import Dexie from 'dexie';

export const LIMIT = 200;
let connection;
export function openStore() {
  if (!connection) connection = (async () => {
    // Keep the legacy native version 2. Dexie's version(2) would upgrade to 20.
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('free-impro-student', 2);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('sounds')) request.result.createObjectStore('sounds', { keyPath: 'id' }); if (!request.result.objectStoreNames.contains('outbox')) request.result.createObjectStore('outbox', { keyPath: 'key' }); };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    const db = new Dexie('free-impro-student', { indexedDB: globalThis.indexedDB, IDBKeyRange: globalThis.IDBKeyRange });
    await db.open();
    db.on('versionchange', () => { db.close(); connection = null; });
    return db;
  })().catch(error => { connection = null; throw error; });
  return connection;
}
export async function closeStore() { const db = await connection; connection = null; db?.close(); }
export async function listSounds() {
  const db = await openStore();
  return (await db.table('sounds').toArray()).sort((a, b) => b.createdAt - a.createdAt);
}
export async function saveSounds(items) {
  const db = await openStore(), sounds = db.table('sounds');
  await db.transaction('rw', sounds, async () => {
    const keys = await sounds.toCollection().primaryKeys();
    if (new Set([...keys, ...items.map(item => item.id)]).size > LIMIT) throw new Error('作品库已满，最多保存 200 份。请先备份或删除一些声音。');
    if (items.length) await sounds.bulkPut(items);
  });
}
export async function importSounds(items) {
  const db = await openStore(), sounds = db.table('sounds');
  return db.transaction('rw', sounds, async () => {
    const existing = new Set(await sounds.toCollection().primaryKeys());
    const additions = items.filter(item => !existing.has(item.id));
    if (existing.size + additions.length > LIMIT) throw new Error('作品库已满，最多保存 200 份。请先备份或删除一些声音。');
    if (additions.length) await sounds.bulkAdd(additions);
    return additions.length;
  });
}
export async function deleteSound(id) {
  const db = await openStore();
  await db.table('sounds').delete(id);
}

// Image jobs may finish after the student renames, edits, or deletes a work.
// Always update the current row atomically and never recreate a deleted sound.
export async function updateSound(id, change) {
  const db = await openStore(), sounds = db.table('sounds');
  return db.transaction('rw', sounds, async () => {
    const current = await sounds.get(id); if (!current) return false;
    const next = change(current); if (!next) return false;
    await sounds.put(next); return true;
  });
}
export async function attachImageResult(id, jobId, userId, avatar) {
  return updateSound(id, current => current.imageRequest?.id === jobId && current.imageRequest?.userId === userId ? { ...current, avatar, imageRequest: null, imageUpdatedAt: Date.now() } : null);
}

export async function outbox(action, value) {
  const db = await openStore(), table = db.table('outbox');
  if (action === 'list') return table.toArray();
  if (action === 'put') return table.put(value);
  if (action === 'delete') return table.delete(value);
  throw new Error('不支持的待发送操作。');
}
