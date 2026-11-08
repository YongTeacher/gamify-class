import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID, randomBytes } from 'node:crypto';
function gas() {
  const tabs=new Map(),props=new Map(),nonces=new Map();
  const sheet={
    getName:()=> 'Gamify Class - 생명과학 탐구 연구소',getId:()=> 'separate-test-sheet',
    getSheetByName:(name)=>tabs.get(name),
    insertSheet:(name)=>{
      const data=[];
      const tab={
        getLastRow:()=>data.length,setFrozenRows:()=>{},setColumnWidths:()=>{},
        getRange:(row,col,height,width)=>{
          const range={
            getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>data[row-1+i]?.[col-1+j]??'')),
            setValues:(values)=>{values.forEach((v,i)=>{data[row-1+i]||=[];v.forEach((cell,j)=>data[row-1+i][col-1+j]=cell);});return range;},
            setFontWeight:()=>range,setBackground:()=>range
          };return range;
        },data
      };tabs.set(name,tab);return tab;
    }
  };
  let locked=false;
  const lock={waitLock:()=>{locked=true;},tryLock:()=>{locked=true;return true;},hasLock:()=>locked,releaseLock:()=>{locked=false;}};
  const ctx=vm.createContext({
    SpreadsheetApp:{getActiveSpreadsheet:()=>sheet,openById:(id)=>{assert.equal(id,'separate-test-sheet');return sheet;},flush:()=>{}},
    PropertiesService:{getScriptProperties:()=>({getProperty:(k)=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},
    LockService:{getScriptLock:()=>lock},CacheService:{getScriptCache:()=>({get:(k)=>nonces.get(k),put:(k,v)=>nonces.set(k,v)})},
    Utilities:{getUuid:randomUUID,computeHmacSha256Signature:(body,secret)=>[...createHmac('sha256',secret).update(body).digest()].map((v)=>v>127?v-256:v)},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:(body)=>({setMimeType:()=>JSON.parse(body)})}
  });
  for(const file of ['seed.js','domain.js','google-apps-script/Code.gs'])vm.runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),ctx);
  ctx.setupLifeScienceLab();
  function request(action,payload,actor={role:'teacher'}) {
    const body=JSON.stringify({action,payload,actor,timestamp:Date.now(),nonce:randomBytes(16).toString('hex')});
    const signature=createHmac('sha256',props.get('LAB_WEBHOOK_SECRET')).update(body).digest('hex');
    return {postData:{contents:JSON.stringify({body,signature})}};
  }
  return {ctx,tabs,props,request};
}
test('Apps Script 실제 어댑터: 재초기화 보존, JSON 왕복, 수식 방지, 서명 및 재전송 차단',()=>{
  const g=gas();
  const rows=Array.from({length:29},(_,i)=>({year:2026,grade:2,classNo:1,number:i+1,name:i?'테스트'+i:'=IMPORTXML("bad")',passwordHash:'a'.repeat(32)+':'+ 'b'.repeat(64)}));
  const req=g.request('students.import',{students:rows});
  assert.equal(g.ctx.doPost(req).ok,true);
  assert.equal(g.tabs.get('Students').data.length,30);
  assert.match(g.tabs.get('Students').data[1][5],/^"=/);
  g.ctx.setupLifeScienceLab();assert.equal(g.tabs.get('Students').data.length,30);
  const list=g.ctx.doPost(g.request('students.list',{}));
  assert.equal(list.result.students.length,29);
  assert.equal(list.result.students[0].name,'=IMPORTXML("bad")');
  assert.equal(g.ctx.doPost(req).ok,false);
  const tampered=g.request('students.list',{}),body=JSON.parse(tampered.postData.contents);body.signature='0'.repeat(64);
  assert.equal(g.ctx.doPost({postData:{contents:JSON.stringify(body)}}).status,403);
});
test('Apps Script에서 실패한 명단 검증은 일부 학생만 저장하지 않는다',()=>{
  const g=gas(),students=[1,2].map((i)=>({year:2026,grade:2,classNo:1,number:1,name:'중복'+i,passwordHash:'a'.repeat(32)+':'+ 'b'.repeat(64)}));
  assert.equal(g.ctx.doPost(g.request('students.import',{students})).status,400);
  assert.equal(g.tabs.get('Students').data.length,1);
});
