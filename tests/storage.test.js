import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { listSounds, saveSounds, deleteSound, outbox, closeStore } from '../src/storage.js';

const NAME = 'free-impro-student';
const raw = version => new Promise((resolve, reject) => { const request = indexedDB.open(NAME, version); request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result); });
test('Dexie preserves native-v2 audio, images, rhythm and pending classroom submissions', async t => {
  const setup = indexedDB.open(NAME, 2);
  setup.onupgradeneeded = () => { setup.result.createObjectStore('sounds', { keyPath: 'id' }); setup.result.createObjectStore('outbox', { keyPath: 'key' }); };
  const old = await new Promise((resolve, reject) => { setup.onsuccess = () => resolve(setup.result); setup.onerror = () => reject(setup.error); });
  const sound = { id: 'old', name: '杯子', createdAt: 1, blob: new Blob(['audio']), avatar: new Blob(['image']), rhythm: { steps: [1, 0, 2] } };
  const tx = old.transaction(['sounds', 'outbox'], 'readwrite');
  tx.objectStore('sounds').put(sound); tx.objectStore('outbox').put({ key: 'queued', requestId: 'existing-id', blob: sound.blob });
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); }); old.close();
  t.after(closeStore);
  const stored = (await listSounds())[0];
  assert.equal(await stored.blob.text(), 'audio'); assert.equal(await stored.avatar.text(), 'image'); assert.deepEqual(stored.rhythm, sound.rhythm);
  assert.equal((await outbox('list'))[0].requestId, 'existing-id');
  await saveSounds([{ ...stored, name: '改名' }]);
  await closeStore();
  const check = await raw(2); assert.equal(check.version, 2); check.close();
  assert.equal((await listSounds())[0].name, '改名');
  await outbox('delete', 'queued'); assert.deepEqual(await outbox('list'), []);
  await deleteSound('old'); assert.deepEqual(await listSounds(), []);
});
test('capacity and bulk errors roll back atomically; concurrent writes cannot exceed 200', async t => {
  t.after(closeStore);
  await saveSounds(Array.from({ length: 199 }, (_, i) => ({ id: String(i), createdAt: i })));
  const results = await Promise.allSettled([saveSounds([{ id: 'last-a' }]), saveSounds([{ id: 'last-b' }])]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await listSounds()).length, 200);
  await assert.rejects(saveSounds([{ id: '0', name: 'must roll back' }, { id: 'overflow' }]), /作品库已满/);
  assert.equal((await listSounds()).find(s => s.id === '0').name, undefined);
  await deleteSound('198');
  await assert.rejects(saveSounds([{ id: '0', name: 'must also roll back' }, { name: 'missing id' }]));
  assert.equal((await listSounds()).find(s => s.id === '0').name, undefined);
});
