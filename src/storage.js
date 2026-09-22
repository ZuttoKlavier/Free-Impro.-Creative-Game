export const LIMIT = 200;
let connection;
export function openStore() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('free-impro-student', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sounds', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = null; reject(request.error); };
  });
  return connection;
}
export async function listSounds() {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const request = db.transaction('sounds').objectStore('sounds').getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
  });
}
export async function saveSounds(items) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sounds', 'readwrite');
    const store = tx.objectStore('sounds');
    let failure;
    const request = store.getAllKeys();
    request.onsuccess = () => {
      if (new Set([...request.result, ...items.map(i => i.id)]).size > LIMIT) {
        failure = new Error('作品库已满，最多保存 200 份。请先备份或删除一些声音。'); tx.abort(); return;
      }
      for (const item of items) store.put(item);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error('本地保存失败，请检查设备空间。'));
  });
}
export async function deleteSound(id) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sounds', 'readwrite');
    tx.objectStore('sounds').delete(id);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
