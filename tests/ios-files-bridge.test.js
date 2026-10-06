import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../ios/Bridge.js', import.meta.url), 'utf8');
function bridge(inputId, actions) {
  let click, changes = 0; const calls = [], alerts = [], sound = { value: 'original-sound' }, input = { id: inputId, dispatchEvent() { changes++; } };
  const window = { webkit: { messageHandlers: { localFiles: { async postMessage(body) { calls.push(body); return actions(body); } } } } };
  const sandbox = { window, document: { getElementById(id) { return id === 'character-sound' ? sound : null; }, addEventListener(name, handler) { if (name === 'click') click = handler; } }, crypto: { randomUUID: () => 'test-id' }, atob: value => Buffer.from(value, 'base64').toString('binary'), Uint8Array, Number, DOMException, Response, alert: message => alerts.push(message), Event: class {}, DataTransfer: class { constructor() { this.files = []; this.items = { add: file => this.files.push(file) }; } }, File: class { constructor(chunks, name, options) { this.bytes = Buffer.concat(chunks.map(c => Buffer.from(c))); this.name = name; this.type = options.type; } } };
  vm.runInNewContext(source, sandbox);
  return { window, calls, alerts, input, sound, get changes() { return changes; }, click: () => click({ target: { closest: () => input }, preventDefault() {}, stopImmediatePropagation() {} }) };
}
for (const [id, kind, name, mime] of [['backup-file', 'backup', 'old-device.json', 'application/json'], ['audio-file', 'audio', 'sound.mp3', 'audio/mpeg'], ['photo-file', 'photo', 'subject.png', 'image/png']]) {
  test(`iOS ${kind} imports full bytes and releases only its selected capability`, async () => {
    const bytes = Buffer.alloc(100000, 42);
    const app = bridge(id, body => {
      if (body.action === 'choose') { assert.equal(body.kind, kind); return { id: 'capability', name, mime, size: bytes.length }; }
      if (body.action === 'read') { assert.equal(body.id, 'capability'); assert.equal(body.name, undefined); return bytes.subarray(body.offset, body.offset + 49152).toString('base64'); }
      if (body.action === 'release') assert.equal(body.id, 'capability');
    });
    await app.click(); assert.equal(app.changes, 1); assert.equal(app.input.files[0].name, name); assert.equal(app.input.files[0].type, mime); assert.deepEqual(app.input.files[0].bytes, bytes); assert.deepEqual(app.alerts, []); assert.equal(app.calls.at(-1).action, 'release');
  });
}
test('iOS import cancellation is silent and leaves the current editor unchanged', async () => {
  const app = bridge('backup-file', () => null); await app.click(); assert.equal(app.changes, 0); assert.deepEqual(app.alerts, []); assert.equal(app.calls.length, 1);
});
test('iOS a truncated import is rejected, released and never dispatched', async () => {
  const app = bridge('audio-file', body => body.action === 'choose' ? { id: 'cap', name: 'sound.wav', mime: 'audio/wav', size: 10 } : '');
  await app.click(); assert.equal(app.changes, 0); assert.match(app.alerts[0], /未完整读取/); assert.equal(app.calls.at(-1).action, 'release');
});
test('iOS oversized photos are rejected before reading and release the capability', async () => {
  const app = bridge('photo-file', body => body.action === 'choose' ? { id: 'cap', name: 'photo.jpg', mime: 'image/jpeg', size: 10485761 } : true);
  await app.click(); assert.equal(app.changes, 0); assert.equal(app.calls.some(c => c.action === 'read'), false); assert.equal(app.calls.at(-1).action, 'release');
});
test('iOS arbitrary file inputs cannot invoke a general picker', async () => {
  const app = bridge('external-file', () => assert.fail('unexpected native request')); await app.click(); assert.equal(app.changes, 0); assert.equal(app.calls.length, 0);
});
test('iOS export waits for native completion and preserves cancellation as false', async () => {
  let complete; const app = bridge('backup-file', body => body.action === 'finish' ? new Promise(resolve => { complete = resolve; }) : true);
  const result = app.window.FreeImproFiles.finish('export-id'); let resolved = false; result.then(() => { resolved = true; }); await Promise.resolve(); assert.equal(resolved, false); complete(false); assert.equal(await result, false);
});
test('iOS photo selection discarded after switching sounds while the picker is open', async () => {
  let choose;
  const app = bridge('photo-file', body => body.action === 'choose' ? new Promise(resolve => { choose = resolve; }) : true);
  const importing = app.click(); app.sound.value = 'new-sound';
  choose({ id: 'old-target-photo', name: 'photo.png', mime: 'image/png', size: 3 }); await importing;
  assert.equal(app.changes, 0); assert.equal(app.calls.some(c => c.action === 'read'), false); assert.deepEqual(app.alerts, []); assert.equal(app.calls.at(-1).action, 'release');
});
test('iOS photo selection discarded after switching sounds during a native read', async () => {
  let read;
  const app = bridge('photo-file', body => {
    if (body.action === 'choose') return { id: 'old-target-photo', name: 'photo.png', mime: 'image/png', size: 3 };
    if (body.action === 'read') return new Promise(resolve => { read = resolve; });
    return true;
  });
  const importing = app.click(); while (!read) await Promise.resolve();
  app.sound.value = 'new-sound'; read(Buffer.from('png').toString('base64')); await importing;
  assert.equal(app.changes, 0); assert.equal(app.input.files, undefined); assert.deepEqual(app.alerts, []); assert.equal(app.calls.at(-1).action, 'release');
});
test('iOS repeated selection cannot overtake an import still reading and unlocks after release', async () => {
  let read, hold = true, choices = 0;
  const app = bridge('photo-file', body => {
    if (body.action === 'choose') return { id: `photo-${++choices}`, name: 'photo.png', mime: 'image/png', size: 3 };
    if (body.action === 'read') {
      if (body.offset) return '';
      if (hold) { hold = false; return new Promise(resolve => { read = resolve; }); }
      return Buffer.from('png').toString('base64');
    }
    return true;
  });
  const first = app.click(); while (!read) await Promise.resolve();
  await app.click(); assert.equal(choices, 1); assert.equal(app.changes, 0);
  read(Buffer.from('png').toString('base64')); await first;
  assert.equal(app.changes, 1); assert.equal(app.calls.at(-1).action, 'release');
  await app.click(); assert.equal(choices, 2); assert.equal(app.changes, 2); assert.deepEqual(app.alerts, []);
});
test('iOS cancellation unlocks the next controlled import', async () => {
  let choices = 0;
  const app = bridge('audio-file', body => {
    if (body.action === 'choose') return ++choices === 1 ? null : { id: 'after-cancel', name: 'sound.wav', mime: 'audio/wav', size: 3 };
    if (body.action === 'read') return body.offset ? '' : Buffer.from('wav').toString('base64');
    return true;
  });
  await app.click(); await app.click(); assert.equal(choices, 2); assert.equal(app.changes, 1); assert.deepEqual(app.alerts, []); assert.equal(app.calls.at(-1).action, 'release');
});
