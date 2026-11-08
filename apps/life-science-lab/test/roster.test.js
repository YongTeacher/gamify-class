import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoster, prepareRoster, rosterCSV } from '../roster.js';
const defaults={year:2026,grade:2,classNo:1};
test('나이스 제목·공백 머리글·번호 성명만 있는 명단',()=>{
  assert.deepEqual(parseRoster([['출석부'],[],['번 호','성 명'],['01','가상학생'],[],['','합계']],defaults),[{...defaults,number:1,name:'가상학생'}]);
  assert.throws(()=>parseRoster([['번호','성명'],[1,'가상학생']],{}),/학년도/);
});
test('5자리 학번과 명시적 학급 열, 숫자 및 중복 검증',()=>{
  assert.deepEqual(parseRoster([['학번','이름'],['20304','가상학생']],{year:2026}),[{year:2026,grade:2,classNo:3,number:4,name:'가상학생'}]);
  assert.throws(()=>parseRoster([['번호','성명'],[1,'가상1'],[1,'가상2']],defaults),/중복/);
  assert.throws(()=>parseRoster([['번호','성명'],['1번','가상1']],defaults),/번호/);
  assert.throws(()=>parseRoster([['번호','성명','번호','성명'],[1,'가상1',2,'가상2']],defaults),/여러 열/);
});
test('신규 코드 자동 발급, 기존 코드 보존, 다른 이름 충돌 차단',()=>{
  const row={...defaults,number:1,name:'가상학생'};
  const fresh=prepareRoster([row],[],()=> 'secure-test-code');
  assert.equal(fresh.codes[0].password,'secure-test-code');
  const old=prepareRoster([{...row,password:'ignored-code'}],[row]);
  assert.equal(old.codes.length,0);assert.equal(old.students[0].password,'');
  assert.throws(()=>prepareRoster([row],[{...row,name:'다른가상학생'}]),/이름이 다릅니다/);
  assert.throws(()=>prepareRoster([{...row,password:'short'}],[]),/8~128/);
  assert.match(prepareRoster([row],[]).codes[0].password,/^[a-f0-9]{12}$/);
});
test('다운로드 CSV는 수식 삽입과 따옴표를 이스케이프한다',()=>{
  const csv=rosterCSV([{...defaults,number:1,name:'=1+1',password:'a"b123456'}]);
  assert.match(csv,/"'=1\+1"/);assert.match(csv,/"a""b123456"/);
});
