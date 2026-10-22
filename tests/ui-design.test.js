import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { createApp } from '../server/app.js';
import { provisionAdmin } from '../server/admin.js';
import { createUIDesignStore } from '../server/ui-design.js';
import { emptyDesign } from '../server/ui-design-schema.js';

const adminPassword = 'synthetic-editor-admin-password';
const password = 'synthetic-editor-user-password';
const savedDesign = () => ({ version: 1, pages: {
  student: { navigation: { backgroundColor: '#AABBCC', gap: 16, height: 70 }, record: { width: 64, height: 64, x: -8, y: 12 }, library: { columns: 3 } },
  teacher: { primary: { color: '#123456', fontSize: 22, borderRadius: 12 }, main: { maxWidth: 1440 } },
} });
const protectedPaths = ['/api/admin/ui-design', '/api/admin/page-editor.js', '/api/admin/ui-design-schema.js', '/api/admin/page-editor.css'];

// Every test owns synthetic accounts and a private database. No running
// classroom service, stored production account or production design is used.
async function fixture(t, { persistent = false } = {}) {
  const directory = persistent ? mkdtempSync(join(tmpdir(), 'empvc-ui-design-')) : null;
  const dbPath = directory ? join(directory, 'classroom.sqlite') : ':memory:';
  let app, origin, adminCookie;
  async function start() {
    app = createApp({ dbPath });
    await new Promise((resolve, reject) => {
      app.server.once('error', reject);
      app.server.listen(0, '127.0.0.1', resolve);
    });
    origin = `http://127.0.0.1:${app.server.address().port}`;
  }
  async function stop() {
    app.server.closeAllConnections();
    await new Promise(resolve => app.server.close(resolve));
    app.db.close();
  }
  await start();
  t.after(async () => { await stop(); if (directory) rmSync(directory, { recursive: true, force: true }); });
  async function request(path, options = {}) {
    const headers = { 'User-Agent': 'SyntheticUIEditorTest/1', Cookie: options.cookie ?? '', ...options.headers };
    if (options.origin !== null) headers.Origin = options.origin ?? origin;
    if (options.data !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(origin + path, {
      method: options.method ?? (options.data === undefined ? 'GET' : 'POST'), headers,
      body: options.data === undefined ? undefined : JSON.stringify(options.data),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, data: response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text };
  }
  await provisionAdmin(app.db, { username: 'editor_admin', password: adminPassword, name: '合成编辑管理员' });
  async function login() {
    const response = await request('/api/admin/login', { data: { username: 'editor_admin', password: adminPassword } });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    adminCookie = response.headers.get('set-cookie').split(';')[0];
    return adminCookie;
  }
  await login();
  return {
    request, login,
    admin: (path, options = {}) => request('/api/admin' + path, { cookie: adminCookie, ...options }),
    async register(role) {
      const response = await request(`/api/${role}/register`, { data: { username: `editor_${role}`, password, name: `合成${role}`, role } });
      assert.equal(response.status, 200, JSON.stringify(response.data));
      return response.headers.get('set-cookie').split(';')[0];
    },
    publish: (data, options = {}) => request('/api/admin/ui-design', { cookie: adminCookie, data, ...options }),
    audits: () => app.db.prepare("SELECT * FROM admin_audit WHERE action='ui-design.publish' ORDER BY at,rowid").all(),
    async restart() { await stop(); await start(); },
    get db() { return app.db; },
    get server() { return app.server; },
    get cookie() { return adminCookie; },
    get origin() { return origin; },
  };
}

test('published settings default to an empty document and every public role route is read only', async t => {
  const f = await fixture(t);
  for (const prefix of ['/api', '/api/student', '/api/teacher']) {
    const response = await f.request(prefix + '/ui-design', { origin: null });
    assert.equal(response.status, 200);
    assert.deepEqual(response.data, { revision: 0, design: emptyDesign(), updatedAt: null });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const denied = await f.request(prefix + '/ui-design', { method, data: { revision: 0, design: savedDesign() }, cookie: f.cookie });
      assert.equal(denied.status, 405);
    }
  }
  for (const [client, other] of [['student', 'teacher'], ['teacher', 'student']]) {
    const headers = { 'User-Agent': `FreeImpro${client === 'student' ? 'Student' : 'Teacher'}/SyntheticTest` };
    assert.equal((await f.request(`/api/${client}/ui-design`, { headers })).status, 200);
    assert.equal((await f.request(`/api/${other}/ui-design`, { headers })).status, 403);
  }
  assert.deepEqual((await f.admin('/ui-design')).data.design, emptyDesign());
  assert.equal(f.audits().length, 0);
});

test('only an independently authenticated administrator can load editing resources or publish', async t => {
  const f = await fixture(t);
  const teacher = await f.register('teacher'), student = await f.register('student');
  const cookies = ['', teacher, student, teacher.replace('fi_session_teacher', 'fi_session_admin'), student.replace('fi_session_student', 'fi_session_admin'), 'fi_session_admin=' + 'a'.repeat(64)];
  for (const cookie of cookies) {
    for (const path of protectedPaths) assert.equal((await f.request(path, { cookie })).status, 401, path);
    assert.equal((await f.publish({ revision: 0, design: savedDesign() }, { cookie })).status, 401);
  }
  assert.deepEqual((await f.admin('/ui-design')).data.design, emptyDesign());
  assert.equal(f.audits().length, 0);
  const beforeLogout = f.cookie;
  assert.equal((await f.admin('/logout', { data: {} })).status, 200);
  for (const path of protectedPaths) assert.equal((await f.request(path, { cookie: beforeLogout })).status, 401);
  assert.equal((await f.publish({ revision: 0, design: savedDesign() }, { cookie: beforeLogout })).status, 401);
  await f.login();
  f.db.prepare('UPDATE admin_sessions SET expires=?').run(Date.now() - 1);
  for (const path of protectedPaths) assert.equal((await f.admin(path.slice('/api/admin'.length))).status, 401);
  assert.equal((await f.publish({ revision: 0, design: savedDesign() })).status, 401);
});

test('admin editing rejects foreign origins and cross-site loads without writing settings or audit', async t => {
  const f = await fixture(t);
  for (const origin of ['https://foreign.example', 'null', f.origin + '/extra']) {
    for (const path of protectedPaths) assert.equal((await f.request(path, { cookie: f.cookie, origin })).status, 403);
    assert.equal((await f.publish({ revision: 0, design: savedDesign() }, { origin })).status, 403);
  }
  assert.equal((await f.publish({ revision: 0, design: savedDesign() }, { origin: null })).status, 403);
  for (const path of protectedPaths) {
    assert.equal((await f.request(path, { cookie: f.cookie, origin: null, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  }
  assert.equal((await f.admin('/ui-design', { origin: null })).status, 200);
  assert.equal((await f.admin('/ui-design')).data.revision, 0);
  assert.equal(f.audits().length, 0);
});

test('publishing normalizes safe values, records an audit and can restore the complete default design', async t => {
  const f = await fixture(t);
  const result = await f.publish({ revision: 0, design: savedDesign() });
  assert.equal(result.status, 200);
  assert.equal(result.data.revision, 1);
  assert.equal(result.data.design.pages.student.navigation.backgroundColor, '#aabbcc');
  assert.ok(Number.isSafeInteger(result.data.updatedAt));
  assert.equal(f.audits().length, 1);
  assert.equal(f.audits()[0].target, '1');
  assert.deepEqual((await f.request('/api/ui-design')).data, result.data);
  assert.deepEqual((await f.admin('/ui-design')).data, result.data);
  const reset = await f.publish({ revision: 1, design: emptyDesign() });
  assert.equal(reset.status, 200);
  assert.equal(reset.data.revision, 2);
  assert.deepEqual(reset.data.design, emptyDesign());
  assert.deepEqual((await f.request('/api/ui-design')).data, reset.data);
  assert.equal(f.audits().length, 2);
});

test('strict validation rejects script/CSS injection, unknown keys and non-integer or out-of-range controls', async t => {
  const f = await fixture(t);
  const invalid = [
    null, [], {}, { revision: 0 }, { design: savedDesign() },
    { revision: 0, design: savedDesign(), extra: true },
    ...[-1, 0.5, '0', null, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1].map(revision => ({ revision, design: savedDesign() })),
  ];
  function badDesign(change) { const design = emptyDesign(); change(design); invalid.push({ revision: 0, design }); }
  badDesign(design => { design.version = 2; });
  badDesign(design => { design.extra = 'ignored'; });
  badDesign(design => { design.pages.admin = {}; });
  badDesign(design => { design.pages.student = null; });
  badDesign(design => { design.pages.student.unknown = { color: '#123456' }; });
  badDesign(design => { design.pages.student.main = { color: '#123456' }; });
  badDesign(design => { design.pages.student.primary = { position: 'fixed' }; });
  badDesign(design => { design.pages.student.primary = []; });
  badDesign(design => { design.pages.student = JSON.parse('{"__proto__":{"color":"#123456"}}'); });
  for (const color of ['red', '#fff', '#11223344', 'url(https://example.com)', '#ffffff;display:none', '<script>alert(1)</script>', 123, null]) {
    badDesign(design => { design.pages.teacher.page = { color }; });
  }
  for (const fontSize of [9, 57, 16.5, '16', null, true]) badDesign(design => { design.pages.teacher.page = { fontSize }; });
  for (const [target, property, value] of [['primary', 'x', -161], ['primary', 'y', 161], ['primary', 'height', 1001], ['main', 'maxWidth', 279], ['page', 'padding', 4]]) {
    badDesign(design => { design.pages.teacher[target] = { [property]: value }; });
  }
  badDesign(design => { design.pages.student.library = { columns: 7 }; });
  badDesign(design => { design.pages.student.library = { columns: 0 }; });
  for (const data of invalid) {
    const response = await f.publish(data);
    assert.equal(response.status, 400, JSON.stringify(data));
  }
  assert.deepEqual((await f.admin('/ui-design')).data, { revision: 0, design: emptyDesign(), updatedAt: null });
  assert.equal(f.audits().length, 0);
});

test('stale revisions and simultaneous editors cannot overwrite a newer publication or append its audit', async t => {
  const f = await fixture(t);
  const first = await f.publish({ revision: 0, design: savedDesign() });
  assert.equal(first.status, 200);
  const stale = await f.publish({ revision: 0, design: emptyDesign() });
  assert.equal(stale.status, 409);
  assert.deepEqual((await f.admin('/ui-design')).data, first.data);
  assert.equal(f.audits().length, 1);
  const [left, right] = await Promise.all([
    f.publish({ revision: 1, design: emptyDesign() }),
    f.publish({ revision: 1, design: savedDesign() }),
  ]);
  assert.deepEqual([left.status, right.status].sort(), [200, 409]);
  const winner = left.status === 200 ? left : right;
  assert.deepEqual((await f.request('/api/ui-design')).data, winner.data);
  assert.equal(winner.data.revision, 2);
  assert.equal(f.audits().length, 2);
});

test('published settings and revision survive service restart', async t => {
  const f = await fixture(t, { persistent: true });
  const first = await f.publish({ revision: 0, design: savedDesign() });
  assert.equal(first.status, 200);
  await f.restart();
  assert.deepEqual((await f.request('/api/ui-design')).data, first.data);
  assert.deepEqual((await f.admin('/ui-design')).data, first.data);
  assert.equal(f.audits().length, 1);
  assert.equal((await f.publish({ revision: 0, design: emptyDesign() })).status, 409);
  assert.equal((await f.publish({ revision: 1, design: emptyDesign() })).data.revision, 2);
});

test('publication rolls back when the accompanying audit fails', async t => {
  const f = await fixture(t), store = createUIDesignStore(f.db);
  const before = store.read();
  assert.throws(() => store.publish({ revision: 0, design: savedDesign() }, () => { throw new Error('synthetic audit failure'); }), /synthetic audit failure/);
  assert.deepEqual(store.read(), before);
  assert.equal(f.audits().length, 0);
});

test('a delayed upload cannot publish after its admin session is logged out or expires', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  for (const revoke of ['logout', 'expire']) {
    await f.login();
    const payload = JSON.stringify({ revision: 0, design: savedDesign() });
    const received = new Promise(resolve => f.server.once('request', resolve));
    let upload;
    const response = new Promise((resolve, reject) => {
      upload = httpRequest(f.origin + '/api/admin/ui-design', { method: 'POST', headers: {
        Origin: f.origin, Cookie: f.cookie, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload),
      } }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks)) }));
        res.on('error', reject);
      });
      upload.on('error', reject);
    });
    upload.write(payload.slice(0, 20));
    await received;
    if (revoke === 'logout') assert.equal((await f.admin('/logout', { data: {} })).status, 200);
    else f.db.prepare('UPDATE admin_sessions SET expires=?').run(Date.now() - 1);
    upload.end(payload.slice(20));
    assert.equal((await response).status, 401, revoke);
    assert.equal((await f.request('/api/ui-design')).data.revision, 0);
    assert.equal(f.audits().length, 0);
  }
});

test('authenticated editor modules and stylesheet use correct MIME, no-store and nosniff', async t => {
  const f = await fixture(t);
  for (const [path, type] of [['/page-editor.js', 'text/javascript'], ['/ui-design-schema.js', 'text/javascript'], ['/page-editor.css', 'text/css']]) {
    const response = await f.admin(path, { origin: null });
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').startsWith(type));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(response.data.length > 100);
  }
});
