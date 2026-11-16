const DB_NAME = 'life-science-lab-drafts';
const STORE_NAME = 'drafts';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MAX_HISTORY = 5;
const HISTORY_INTERVAL = 60 * 1000;

const copy = (value) => value == null ? value : structuredClone(value);
const valid = (record, key) => !!(record && record.key === key && record.report?.id && Number.isFinite(record.at));
const safeStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };

function browserAdapter(factory) {
  if(factory===undefined)try{factory=globalThis.indexedDB;}catch{return null;}
  if (!factory) return null;
  let request;
  const open = () => request ||= new Promise((resolve, reject) => {
    const next = factory.open(DB_NAME, 1);
    next.onupgradeneeded = () => {
      if (!next.result.objectStoreNames.contains(STORE_NAME)) next.result.createObjectStore(STORE_NAME, { keyPath:'key' });
    };
    next.onsuccess = () => resolve(next.result);
    next.onerror = () => reject(next.error || new Error('IndexedDB open failed'));
    next.onblocked = () => reject(new Error('IndexedDB is blocked'));
  });
  const run = async (mode, operation) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode), store = tx.objectStore(STORE_NAME);
      const result = operation(store);
      tx.oncomplete = () => resolve(result?.result);
      tx.onerror = () => reject(tx.error || result?.error || new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  };
  return {
    ready: open,
    get: (key) => run('readonly', (store) => store.get(key)),
    put: (value) => run('readwrite', (store) => store.put(value)),
    delete: (key) => run('readwrite', (store) => store.delete(key))
  };
}

export class DraftStore {
  constructor({ storage, adapter, now = () => Date.now() } = {}) {
    this.storage = storage===undefined?safeStorage():storage; this.adapter = adapter===undefined?browserAdapter():adapter; this.now = now; this.cache = new Map(); this.queues = new Map(); this.probeResult = null;
  }
  localGet(key) {
    try { const value=JSON.parse(this.storage?.getItem(key) || 'null'); return valid(value,key) ? value : null; }
    catch { return null; }
  }
  localPut(key, value) {
    try { if (!this.storage) return false; this.storage.setItem(key,JSON.stringify(value)); return true; }
    catch { return false; }
  }
  async probe() {
    if(this.probeResult)return this.probeResult;
    const key='life-lab:probe',value=String(this.now());
    let local=false,indexed=false;
    try { this.storage?.setItem(key,value);local=this.storage?.getItem(key)===value;this.storage?.removeItem(key); } catch {}
    try { if(this.adapter){await this.adapter.ready();indexed=true;} } catch {}
    return this.probeResult={local,indexed,available:local||indexed};
  }
  async load(key) {
    const local=this.localGet(key);
    let indexed=null;
    try { indexed=this.adapter ? await this.adapter.get(key) : null; } catch {}
    let record=[local,indexed].filter((item)=>valid(item,key)).sort((a,b)=>b.at-a.at)[0] || null;
    if(record && this.now()-record.at>MAX_AGE){await this.remove(key);record=null;}
    if(record)this.cache.set(key,copy(record));
    return copy(record);
  }
  save(key, report, { synced=false }={}) {
    const at=this.now(),previous=this.cache.get(key) || this.localGet(key);
    const history=Array.isArray(previous?.history) ? copy(previous.history) : [];
    if(previous && (at-previous.at>=HISTORY_INTERVAL || previous.synced!==synced)) {
      history.push({at:previous.at,synced:!!previous.synced,version:previous.report?.version,content:copy(previous.report?.content || {})});
      if(history.length>MAX_HISTORY)history.splice(0,history.length-MAX_HISTORY);
    }
    const record={key,report:copy(report),at,synced:!!synced,history};
    this.cache.set(key,copy(record));
    const local=this.localPut(key,record);
    const previousQueue=this.queues.get(key) || Promise.resolve(false);
    const persisted=previousQueue.catch(()=>false).then(async()=>{
      if(!this.adapter)return false;
      try { await this.adapter.put(copy(record));return true; } catch { return false; }
    });
    this.queues.set(key,persisted);
    return {local,persisted};
  }
  async flush(key) { try { return await (this.queues.get(key) || Promise.resolve(true)); } catch { return false; } }
  async remove(key) {
    this.cache.delete(key);
    try { this.storage?.removeItem(key); } catch {}
    try { if(this.adapter)await this.adapter.delete(key); } catch {}
  }
}
