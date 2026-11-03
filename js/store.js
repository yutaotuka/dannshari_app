/* =========================================================
 * store.js — IndexedDB への保存（使えない環境ではメモリに退避）
 * ========================================================= */

const Store = (() => {
  const DB_NAME = 'irunai-db';
  const STORE = 'items';
  let dbPromise = null;
  let useMemory = false;
  const memory = new Map();

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
    return dbPromise;
  }

  async function run(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function safe(idbFn, memFn) {
    if (useMemory) return memFn();
    try {
      return await idbFn();
    } catch (e) {
      console.warn('[Store] IndexedDB が使えないため、メモリに保存します', e);
      useMemory = true;
      return memFn();
    }
  }

  return {
    all: () => safe(() => run('readonly', s => s.getAll()), () => [...memory.values()]),
    put: item => safe(() => run('readwrite', s => s.put(item)), () => { memory.set(item.id, item); }),
    remove: id => safe(() => run('readwrite', s => s.delete(id)), () => { memory.delete(id); }),
    clear: () => safe(() => run('readwrite', s => s.clear()), () => { memory.clear(); }),
    get persistent() { return !useMemory; },
  };
})();

/** localStorage の小さな設定値（失敗しても動くように） */
const Prefs = {
  get(key) { try { return localStorage.getItem('irunai:' + key); } catch (e) { return null; } },
  set(key, val) { try { localStorage.setItem('irunai:' + key, val); } catch (e) { /* 何もしない */ } },
};
