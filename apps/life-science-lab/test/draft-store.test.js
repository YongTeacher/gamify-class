import test from 'node:test';
import assert from 'node:assert/strict';
import { DraftStore } from '../draft-store.js';

class MemoryStorage {
  constructor(){this.values=new Map();}
  getItem(key){return this.values.has(key)?this.values.get(key):null;}
  setItem(key,value){this.values.set(key,String(value));}
  removeItem(key){this.values.delete(key);}
}
class MemoryAdapter {
  constructor(){this.values=new Map();}
  async ready(){return true;}
  async get(key){return structuredClone(this.values.get(key));}
  async put(value){this.values.set(value.key,structuredClone(value));}
  async delete(key){this.values.delete(key);}
}
const report=(content='직접 작성한 글',version=1)=>({id:'report-one',version,content:{answer:content}});

test('서버 저장 실패 중에도 localStorage와 IndexedDB에 같은 복구본을 유지한다',async()=>{
  const storage=new MemoryStorage(),adapter=new MemoryAdapter(),store=new DraftStore({storage,adapter,now:()=>1000});
  const result=store.save('draft-key',report(),{synced:false});
  assert.equal(result.local,true);assert.equal(await result.persisted,true);
  const saved=await store.load('draft-key');
  assert.equal(saved.report.content.answer,'직접 작성한 글');assert.equal(saved.synced,false);
});

test('서버 저장 성공 후에도 동기화된 기기 복구본을 삭제하지 않는다',async()=>{
  let now=1000;const storage=new MemoryStorage(),adapter=new MemoryAdapter(),store=new DraftStore({storage,adapter,now:()=>now});
  await store.save('draft-key',report('저장 전'),{synced:false}).persisted;
  now+=100;await store.save('draft-key',report('서버 저장 완료',2),{synced:true}).persisted;
  const saved=await store.load('draft-key');
  assert.equal(saved.report.content.answer,'서버 저장 완료');assert.equal(saved.synced,true);assert.equal(saved.history.length,1);
});

test('두 저장소 중 더 최근 복구본을 선택하고 최근 기록은 5개만 보관한다',async()=>{
  let now=1000;const storage=new MemoryStorage(),adapter=new MemoryAdapter(),store=new DraftStore({storage,adapter,now:()=>now});
  for(let i=0;i<7;i++){now+=61_000;await store.save('draft-key',report('기록 '+i,i),{synced:i%2===0}).persisted;}
  const saved=await store.load('draft-key');
  assert.equal(saved.report.content.answer,'기록 6');assert.equal(saved.history.length,5);
  const older=JSON.parse(storage.getItem('draft-key'));older.at=1;storage.setItem('draft-key',JSON.stringify(older));
  const freshStore=new DraftStore({storage,adapter,now:()=>now});
  assert.equal((await freshStore.load('draft-key')).report.content.answer,'기록 6');
});

test('7일이 지난 기기 복구본은 개인정보 보호를 위해 정리한다',async()=>{
  let now=1000;const storage=new MemoryStorage(),adapter=new MemoryAdapter(),store=new DraftStore({storage,adapter,now:()=>now});
  await store.save('draft-key',report(),{synced:false}).persisted;
  now+=8*24*60*60*1000;
  assert.equal(await store.load('draft-key'),null);assert.equal(storage.getItem('draft-key'),null);assert.equal(await adapter.get('draft-key'),undefined);
});
