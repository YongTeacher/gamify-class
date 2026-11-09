import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.js';
import {handle} from '../server/api.js';
import {passwordHash} from '../server/auth.js';
test('그룹 교사 암호 로그인·권한·세션 만료를 실제 API로 검증',async()=>{
  const f=fixture(),env={LAB_SESSION_SECRET:'group-api-test-secret-only',LAB_ADMIN_HASH:await passwordHash('root-demo-code')};
  const repo={execute:async(a,p,u)=>f.run(a,p,u || {})};
  const request=async(action,payload={},cookie='')=>{
    const r=await handle(new Request('https://lab.test/api/lab/rpc',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://lab.test',Cookie:cookie},body:JSON.stringify({action,payload})}),env,repo);
    return {status:r.status,body:await r.json(),cookie:r.headers.get('Set-Cookie')?.split(';')[0]};
  };
  const root=await request('login',{role:'teacher',password:'root-demo-code'});assert.equal(root.status,200);assert.equal(root.body.result.owner,true);
  const created=await request('groups.create',{year:2026,semester:'2',subject:'생명과학',school:'가상학교',password:'group-demo-code'},root.cookie);assert.equal(created.status,200);
  const id=created.body.result.id;
  assert.equal((await request('login',{role:'teacher',groupId:id,password:'root-demo-code'})).status,401);
  const login=await request('login',{role:'teacher',groupId:id,password:'group-demo-code'});assert.equal(login.status,200);assert.equal(login.body.result.owner,false);
  assert.equal((await request('students.list',{groupId:'legacy'},login.cookie)).status,403);
  assert.equal((await request('groups.enter',{groupId:id,targetId:'legacy'},login.cookie)).status,403);
  assert.equal((await request('groups.create',{groupId:id},login.cookie)).status,403);
  assert.equal((await request('students.list',{groupId:id},login.cookie)).body.result.students.length,0);
  const entered=await request('groups.enter',{targetId:id},root.cookie);assert.equal(entered.status,200);assert.equal(entered.body.result.groupId,id);
  const changed=await request('groups.update',{groupId:id,year:2026,semester:'2',subject:'생명과학',school:'가상학교',password:'0000000',version:login.body.result.groupVersion},login.cookie);assert.equal(changed.status,200);
  assert.equal((await request('students.list',{groupId:id},login.cookie)).status,401);
  assert.equal((await request('login',{role:'teacher',groupId:id,password:'0000000'})).status,200);
  const listed=await request('groups.list');assert.ok(!JSON.stringify(listed.body).includes('password'));
});
