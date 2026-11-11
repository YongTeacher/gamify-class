import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage(),errors=[];page.on('pageerror',(e)=>errors.push(e.message));page.on('dialog',(d)=>d.accept());
const base='http://localhost:8791/apps/life-science-lab/';
const submit=async()=>page.locator('#login-form').evaluate((form)=>form.requestSubmit());
async function fillStudent(){for(const [k,v] of Object.entries({year:'2026',grade:'2',classNo:'1',number:'10',name:'PIN브라우저학생'}))await page.locator('#login-form [name='+k+']').fill(v);}
async function logoutTo(nav){await page.locator('[data-action=logout]').click();await expect(page.locator('#identity a[href="#lab"]')).toBeVisible();await page.locator('[data-nav='+nav+']').click();}
async function teacher(){await page.locator('[data-nav=teacher]').click();await expect(page.locator('#login-form h2')).toContainText('교사 로그인');await page.locator('#login-password').fill('teacher-demo-2026');await submit();await expect(page.locator('#identity [data-action=logout]')).toBeVisible({timeout:30000});await page.locator('[data-nav=teacher]').click();await page.locator('[data-tab=students]').click();}
try{
  await page.goto(base+'#teacher');await teacher();
  await page.locator('#roster-file').setInputFiles({name:'pin-roster.csv',mimeType:'text/csv',buffer:Buffer.from('\uFEFF학년도,학년,반,번호,이름\n2026,2,1,10,PIN브라우저학생\n')});
  await expect(page.locator('[data-action=roster-codes]')).toHaveCount(0);await page.locator('[data-action=import-roster]').click();
  const row=page.locator('.table-wrap').last().locator('tr').filter({hasText:'PIN브라우저학생'});
  await expect(row).toContainText('PIN 미등록');
  await logoutTo('lab');await fillStudent();
  await page.locator('[data-action=pin-mode]').click();await expect(page.locator('#login-form [name=name]')).toHaveValue('PIN브라우저학생');
  await page.locator('#login-password').fill('0123');await page.locator('[name=pinConfirm]').fill('1234');await submit();
  await expect(page.locator('#login-error')).toContainText('두 번');
  await page.locator('[name=pinConfirm]').fill('0123');await submit();await expect(page.locator('h1')).toContainText('PIN브라우저학생');
  await page.locator('[data-nav=activities]').click();await page.locator('[data-open]').first().click();await page.locator('#answer').fill('PIN 변경 후에도 유지되는 탐구 노트');await page.locator('[data-action=retry-save]').click();await expect(page.locator('#save-status')).toContainText('서버에 저장 완료');
  await logoutTo('teacher');await teacher();
  await row.locator('[data-reset-student]').click();await page.locator('#pin-form [name=pin]').fill('4567');await page.locator('#pin-form [name=confirm]').fill('4567');await page.locator('#pin-form button.primary').click();await expect(page.locator('#modal')).not.toBeVisible();
  await logoutTo('lab');await fillStudent();await page.locator('#login-password').fill('0123');await submit();await expect(page.locator('#login-error')).toContainText('일치하지');
  await page.locator('#login-password').fill('4567');await submit();await expect(page.locator('h1')).toContainText('PIN브라우저학생');
  await page.locator('a[href="#write/enzyme-structure"]').click();await expect(page.locator('#answer')).toHaveValue('PIN 변경 후에도 유지되는 탐구 노트');
  await logoutTo('teacher');await teacher();await row.locator('[data-reset-student]').click();await page.locator('[data-allow-pin]').click();await expect(row).toContainText('PIN 미등록');
  await logoutTo('lab');await page.locator('[data-action=pin-mode]').click();await fillStudent();await page.locator('#login-password').fill('7890');await page.locator('[name=pinConfirm]').fill('7890');await submit();await expect(page.locator('h1')).toContainText('PIN브라우저학생');
  expect(errors).toEqual([]);console.log('PASS: no-code roster import, first PIN confirmation, leading zero, teacher PIN change/reset, old PIN rejected, notes preserved, re-enrollment.');
}finally{await browser.close();}
