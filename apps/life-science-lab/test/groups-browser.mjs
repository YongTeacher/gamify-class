import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',(e)=>errors.push(e.message));page.on('dialog',(d)=>d.accept());
try{
  await page.goto('http://localhost:8791/apps/life-science-lab/#teacher');
  await page.locator('#login-password').fill('teacher-demo-2026');await page.locator('#login-form button[type=submit]').click();
  await page.locator('[data-tab=groups]').click();
  for(const [k,v] of Object.entries({year:'2027',semester:'1',subject:'세포와 물질대사',school:'가상고',password:'group-demo-2027'}))await page.locator('#group-create [name='+k+']').fill(v);
  await page.locator('#group-create button').click();
  await expect(page.locator('#roster-file')).toBeVisible();
  await expect(page.locator('#roster-year')).toHaveValue('2027');
  await page.addScriptTag({url:'http://localhost:8791/apps/life-science-lab/vendor/xlsx.full.min.js'});
  const groupId=await page.locator('#group-select').inputValue();expect(groupId).not.toBe('legacy');
  const files=[];
  for(const [number,course] of [[7,'2-1'],[8,'2-2']]){
    const bytes=await page.evaluate(({number,course})=>{
      const rows=[['교과 : 세포와 물질대사 2학년  '+course],[],['연번','학년','학과','반','번호','성 명','접속코드'],[1,'2.0','일반학과','3.0',number+'.0','가상그룹학생'+number+'(공동)','test-student-2027']];
      const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'명단');
      return Array.from(new Uint8Array(XLSX.write(book,{type:'array',bookType:'xlsx'})));
    },{number,course});
    files.push({name:'course-'+number+'.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from(bytes)});
  }
  await page.locator('#roster-file').setInputFiles(files);await expect(page.locator('#roster-preview')).toContainText('2개 파일 · 2명 확인');
  await expect(page.locator('#roster-preview tbody')).not.toContainText('(공동)');await expect(page.locator('#roster-preview tbody')).toContainText('2-2');
  const download=page.waitForEvent('download');await page.locator('[data-action=roster-codes]').click();await download;
  await page.locator('[data-action=import-roster]').click();await expect(page.locator('#roster-preview')).toBeEmpty();
  await expect(page.locator('.table-wrap').last().locator('tbody tr')).toHaveCount(2);
  await page.locator('#student-course').selectOption('2-1');await expect(page.locator('.table-wrap').last().locator('tbody tr:visible')).toHaveCount(1);
  await page.locator('[data-action=logout]').click();await page.locator('#login-password').fill('group-demo-2027');await page.locator('#login-form button[type=submit]').click();
  await page.locator('[data-tab=groups]').click();await expect(page.locator('#group-update')).toBeVisible();await expect(page.locator('#group-create')).toHaveCount(0);
  const blocked=await page.evaluate(async(groupId)=>{
    const r=await fetch('/api/lab/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'students.list',payload:{groupId:'legacy'}})});return r.status;
  },groupId);expect(blocked).toBe(403);
  await page.screenshot({path:'.qa/groups-desktop.png',fullPage:true});
  await page.locator('[data-action=logout]').click();await page.locator('[data-nav=lab]').click();
  await expect(page.locator('[name=year]')).toHaveValue('2027');
  for(const [k,v] of Object.entries({grade:'2',classNo:'3',number:'7',name:'가상그룹학생7',password:'test-student-2027'}))await page.locator('#login-form [name='+k+']').fill(v);
  await page.locator('#login-form button[type=submit]').click();await expect(page.locator('h1')).toContainText('가상그룹학생7');
  await page.locator('[data-nav=activities]').click();await page.locator('[data-open]').click();await expect(page.locator('#answer')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
  expect(errors).toEqual([]);
  console.log('PASS: group creation, 2027 defaults, multi-file NEIS import, joint-name removal, course filters, group teacher login/isolation, student login and report, mobile width.');
}finally{await browser.close();}
