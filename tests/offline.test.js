import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { offlineBuild } from '../scripts/offline-build.js';

function worker() {
  let built;
  offlineBuild().generateBundle.call({ emitFile: file => { if (file.fileName === 'sw.js') built = file; } }, {}, { 'assets/app-123.js': {}, 'assets/app-123.css': {} });
  const events = new Map(), saved = new Map(), deleted = [], network = [], added = [];
  const context = {
    URL, Set,
    self: { location: { origin: 'https://classroom.local' }, clients: { claim: async () => {} }, addEventListener: (name, handler) => events.set(name, handler) },
    caches: { open: async () => ({ addAll: async paths => { added.push(...paths); for (const path of paths) saved.set(path, 'cached:' + path); }, match: async key => saved.get(key) }), keys: async () => ['unrelated-cache', 'free-impro-shell-old'], delete: async key => { deleted.push(key); } },
    fetch: async request => { network.push(request.url); throw new Error('offline'); },
  };
  vm.runInNewContext(built.source, context);
  const dispatch = async name => { let task; events.get(name)({ waitUntil: value => { task = value; } }); await task; };
  const fetch = (path, method = 'GET', mode = 'cors') => {
    let response;
    events.get('fetch')({ request: { url: new URL(path, context.self.location.origin).href, method, mode }, respondWith: result => { response = result; } });
    return response;
  };
  return { built, dispatch, fetch, added, network, deleted };
}

test('production shell caches hashed assets and opens a classroom link offline without caching account or audio requests', async () => {
  const service = worker(); await service.dispatch('install');
  assert.ok(service.added.includes('/assets/app-123.js')); assert.ok(service.added.includes('/index.html'));
  assert.equal(await service.fetch('/?class=123456', 'GET', 'navigate'), 'cached:/index.html');
  assert.equal(await service.fetch('/teacher.html', 'GET', 'navigate'), 'cached:/teacher.html');
  assert.equal(await service.fetch('/assets/app-123.js'), 'cached:/assets/app-123.js');
  for (const path of ['/api/me', '/api/submissions/private/audio', '/api/submissions/private/image', 'https://other.example/assets/app-123.js']) assert.equal(service.fetch(path), undefined);
  assert.equal(service.fetch('/api/login', 'POST'), undefined);
  assert.equal(service.fetch('/unrelated-page', 'GET', 'navigate'), undefined);
  assert.equal(service.network.length, 0);
  await service.dispatch('activate'); assert.deepEqual(service.deleted, ['free-impro-shell-old']);
  assert.ok(!service.built.source.includes('skipWaiting'));
});

test('web manifest provides a local standalone app and includes no external resources', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url)));
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.start_url, '/');
  assert.ok(manifest.icons.every(icon => icon.src.startsWith('/') && !icon.src.startsWith('//')));
});

test('native student offline cache never requires teacher pages forbidden by the student app', () => {
  const emitted = [];
  offlineBuild().generateBundle.call({ emitFile: file => emitted.push(file) }, {}, { 'assets/student.js': {}, 'assets/shared.css': {} });
  const student = emitted.find(file => file.fileName === 'student-sw.js');
  assert.ok(student.source.includes('/index.html'));
  assert.ok(!student.source.includes('/teacher.html'));
  assert.ok(!student.source.includes('/teacher.webmanifest'));
});
