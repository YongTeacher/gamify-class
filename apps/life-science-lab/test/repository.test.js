import test from 'node:test';
import assert from 'node:assert/strict';
import {sheetsRepository} from '../server/repository.js';
import {hmac} from '../server/auth.js';
test('한글·특수문자·이모지 명단은 ASCII 전송 후 원문 그대로 복원·서명 검증',async()=>{
  const original=globalThis.fetch,secret='transport-test-key-not-production';
  const students=Array.from({length:85},(_,i)=>({name:'가상학생'+i+'（위탁） "인용" \\ 🌱',number:i+1,courseClass:'2-1'}));
  try{
    globalThis.fetch=async(url,options)=>{
      assert.equal(options.headers['Content-Type'],'application/json; charset=UTF-8');
      assert.ok(/^[\x00-\x7f]*$/.test(options.body));
      // Simulate a legacy POST decoder; ASCII is unaffected by its encoding.
      const received=Buffer.from(options.body,'utf8').toString('latin1');
      const envelope=JSON.parse(received),body=JSON.parse(envelope.body);
      assert.deepEqual(body.payload.students,students);
      assert.equal(envelope.signature,await hmac(secret,envelope.body));
      const altered=envelope.body.replace('가상학생0','다른학생0');
      assert.notEqual(envelope.signature,await hmac(secret,altered));
      return new Response(JSON.stringify({ok:true,result:{count:85}}));
    };
    assert.deepEqual(await sheetsRepository({LAB_SHEETS_URL:'https://script.google.com/macros/s/test/exec',LAB_SHEETS_SECRET:secret}).execute('students.import',{students},{role:'teacher'}),{count:85});
  }finally{globalThis.fetch=original;}
});
