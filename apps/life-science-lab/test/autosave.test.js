import test from 'node:test';
import assert from 'node:assert/strict';
import { ReportSaver } from '../autosave.js';
test('저장 중 새로 입력한 글은 이전 응답에 덮이지 않고 순서대로 저장',async()=>{
  let release;const writes=[],states=[];
  const saver=new ReportSaver({id:'r',version:0,content:{}},async(r)=>{
    writes.push(r);if(writes.length===1)await new Promise((resolve)=>release=resolve);
    return {...r,version:r.version+1};
  },(s)=>states.push(s),()=>{});
  saver.change({selection:'첫 글'});const pending=saver.flush();
  saver.change({selection:'새 글'});release();await pending;saver.stop();
  assert.equal(writes.length,2);assert.equal(writes[1].version,1);
  assert.equal(writes[1].content.selection,'새 글');assert.equal(saver.report.content.selection,'새 글');
  assert.equal(saver.dirty,false);assert.equal(states.at(-1),'saved');
});
test('충돌은 자동 덮어쓰기·재시도하지 않고 복구본을 유지',async()=>{
  const states=[],backups=[];let requests=0;
  const saver=new ReportSaver({id:'r',version:0,content:{}},async()=>{
    requests++;throw Object.assign(new Error('충돌'),{status:409});
  },(s)=>states.push(s),(v)=>backups.push(v));
  saver.change({selection:'내 글'});assert.equal(await saver.flush(),false);
  assert.equal(await saver.flush(),false);saver.stop();
  assert.equal(requests,1);assert.equal(saver.dirty,true);assert.equal(states.at(-1),'error');assert.ok(backups.at(-1));
});
