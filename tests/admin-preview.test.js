import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { createApp } from '../server/app.js';
import { provisionAdmin } from '../server/admin.js';
import { startCloudServer } from '../server/cloud.js';

const publicOrigin = 'https://class.empfreeimpro.xyz';
const adminOrigin = 'https://admin.empfreeimpro.xyz';
const classroomHost = new URL(publicOrigin).host;
const administratorHost = new URL(adminOrigin).host;
const password = 'synthetic-preview-admin-password';
const previewPaths = ['/api/admin/editor-config', '/api/admin/preview/student', '/api/admin/preview/teacher', '/api/admin/preview/assets/student.js', '/api/admin/preview/icon.svg'];

// Private synthetic builds and in-memory databases isolate these tests from
// running classrooms, production login credentials and published releases.
async function fixture(t, { cloud = true } = {}) {
  const root = cloud ? mkdtempSync(join(tmpdir(), 'empvc-admin-preview-')) : null;
  const distDirectory = root && join(root, 'dist');
  const source = {
    'index.html': `<!doctype html><html><head><title>合成学生预览</title><link rel="manifest" href="/manifest.webmanifest"><link rel='icon' href='/icon.svg'><script type="module" src="/assets/student.js"></script><link rel="modulepreload" href="/assets/shared.js"><link href="/assets/shared.css" rel="stylesheet"><script src=/assets/unquoted.js></script></head><body>student</body></html>`,
    'teacher.html': `<!doctype html><html><head><title>合成教师预览</title><LINK href="/teacher.webmanifest" REL="manifest"><link rel="icon" href="/icon.svg"><script type="module" src="/assets/teacher.js"></script><link rel="stylesheet" href="/assets/shared.css"></head><body>teacher</body></html>`,
    'assets/student.js': 'import "./shared.js"; export const role="student";',
    'assets/teacher.js': 'import "./shared.js"; export const role="teacher";',
    'assets/shared.js': 'export const synthetic=true;',
    'assets/unquoted.js': '/* unquoted asset */',
    'assets/shared.css': '@font-face{font-family:fixture;src:url(./nested/font.woff2)}body{color:green}',
    'assets/nested/font.woff2': 'synthetic-font-bytes',
    'assets/hidden.pem': 'private-key-not-in-build-allowlist',
    'assets/source.js.map': 'private-source-map',
    'icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    'favicon.ico': 'synthetic-favicon',
    'student-sw.js': '/* service worker must not be exposed through preview */',
    'sw.js': '/* service worker must not be exposed through preview */',
    'manifest.webmanifest': '{}', 'teacher.webmanifest': '{}',
    '.env': 'synthetic-private-environment', 'server.key': 'synthetic-private-key',
    'src/main.js': 'synthetic-private-source', 'data/private.js': 'synthetic-private-data',
    'admin.html': 'synthetic-private-admin',
  };
  if (cloud) {
    for (const [path, body] of Object.entries(source)) {
      const pieces = path.split('/'); pieces.pop();
      mkdirSync(join(distDirectory, ...pieces), { recursive: true });
      writeFileSync(join(distDirectory, path), body);
    }
    if (process.platform !== 'win32') symlinkSync(join(distDirectory, 'src/main.js'), join(distDirectory, 'assets/leaked.js'));
  }
  const app = cloud ? await startCloudServer({ publicOrigin, adminOrigin, distDirectory, dbPath: ':memory:', port: 0 }) : createApp({ dbPath: ':memory:' });
  if (!cloud) await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => {
    if (cloud) { await app.close(); rmSync(root, { recursive: true, force: true }); }
    else { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.db.close(); }
  });
  const origin = cloud ? adminOrigin : `http://127.0.0.1:${app.server.address().port}`;
  const host = new URL(origin).host;
  const send = (path, options = {}) => new Promise((resolve, reject) => {
    const headers = { Host: options.host ?? host, Cookie: options.cookie ?? '', ...options.headers };
    if (options.origin !== null) headers.Origin = options.origin ?? origin;
    const body = options.data === undefined ? undefined : JSON.stringify(options.data);
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(body); }
    const req = request({ host: '127.0.0.1', port: app.server.address().port, path, method: options.method ?? (options.data === undefined ? 'GET' : 'POST'), headers }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => { const bytes = Buffer.concat(chunks), text = bytes.toString(); resolve({ status: res.statusCode, headers: res.headers, text, bytes, data: res.headers['content-type']?.includes('application/json') && text ? JSON.parse(text) : null }); });
    });
    req.on('error', reject); req.end(body);
  });
  await provisionAdmin(app.db, { username: 'preview_admin', password });
  let cookie;
  async function login() {
    const response = await send('/api/admin/login', { data: { username: 'preview_admin', password } });
    assert.equal(response.status, 200, response.text);
    cookie = response.headers['set-cookie'][0].split(';')[0];
    return cookie;
  }
  await login();
  return {
    ...app, root, distDirectory, source, send, login,
    admin: (path, options = {}) => send(path, { cookie, ...options }),
    audits: () => app.db.prepare('SELECT COUNT(*) AS count FROM admin_audit').get().count,
    get cookie() { return cookie; },
  };
}

test('local editor config preserves real application previews and does not expose a build namespace', async t => {
  const f = await fixture(t, { cloud: false });
  const config = await f.admin('/api/admin/editor-config', { origin: null });
  assert.equal(config.status, 200);
  assert.deepEqual(config.data, { previewPages: { student: '/', teacher: '/teacher.html' }, readOnlyPreview: false });
  assert.equal(config.headers['cache-control'], 'no-store');
  assert.equal(config.headers['x-content-type-options'], 'nosniff');
  assert.equal((await f.send('/api/admin/editor-config')).status, 401);
  assert.equal((await f.admin('/api/admin/preview/student')).status, 404);
  assert.equal((await f.admin('/api/admin/editor-config', { data: {} })).status, 405);
});

test('cloud editor config and built previews require the independent administrator session', async t => {
  const f = await fixture(t);
  const config = await f.admin('/api/admin/editor-config', { origin: null });
  assert.equal(config.status, 200);
  assert.deepEqual(config.data, { previewPages: { student: '/api/admin/preview/student', teacher: '/api/admin/preview/teacher' }, readOnlyPreview: true });
  const cookies = ['', 'fi_session_admin=' + 'a'.repeat(64)];
  for (const role of ['teacher', 'student']) {
    const registered = await f.send(`/api/${role}/register`, { host: classroomHost, origin: publicOrigin, data: { username: `preview_${role}`, password: 'synthetic-user-password', name: `Synthetic ${role}`, role } });
    assert.equal(registered.status, 200, registered.text);
    const userCookie = registered.headers['set-cookie'][0].split(';')[0];
    cookies.push(userCookie, userCookie.replace(`fi_session_${role}`, 'fi_session_admin'));
  }
  for (const cookie of cookies) for (const path of previewPaths) assert.equal((await f.send(path, { cookie })).status, 401, path);
  const audits = f.audits();
  f.db.prepare('UPDATE admin_sessions SET expires=?').run(Date.now() - 1);
  for (const path of previewPaths) assert.equal((await f.admin(path)).status, 401, path);
  await f.login();
  const oldCookie = f.cookie;
  assert.equal((await f.admin('/api/admin/logout', { data: {} })).status, 200);
  for (const path of previewPaths) assert.equal((await f.send(path, { cookie: oldCookie })).status, 401, path);
  assert.equal(f.audits(), audits + 2); // Only the deliberate re-login and logout write audit entries.
});

test('built preview HTML rewrites only asset/icon URLs and removes PWA manifests', async t => {
  const f = await fixture(t), audits = f.audits();
  for (const page of ['student', 'teacher']) {
    const response = await f.admin('/api/admin/preview/' + page + '?uiPreview=1', { origin: null });
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /^text\/html/);
    assert.match(response.text, new RegExp(`/api/admin/preview/assets/${page}\\.js`));
    assert.match(response.text, /\/api\/admin\/preview\/assets\/shared\.css/);
    assert.match(response.text, /\/api\/admin\/preview\/icon\.svg/);
    assert.doesNotMatch(response.text, /manifest|["']\/assets\//i);
    assert.equal(response.headers['content-length'], String(response.bytes.length));
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN');
    assert.match(response.headers['content-security-policy'], /worker-src 'none'/);
    assert.match(response.headers['content-security-policy'], /frame-ancestors 'self'/);
    assert.match(response.headers['content-security-policy'], /form-action 'none'/);
  }
  const student = await f.admin('/api/admin/preview/student');
  assert.match(student.text, /src=\/api\/admin\/preview\/assets\/unquoted\.js/);
  for (const asset of ['student.js', 'shared.js', 'shared.css', 'nested/font.woff2']) {
    const response = await f.admin('/api/admin/preview/assets/' + asset + '?cache=test', { origin: null });
    assert.equal(response.status, 200, asset);
    assert.equal(response.text, f.source['assets/' + asset]);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
  }
  assert.match((await f.admin('/api/admin/preview/assets/shared.css')).headers['content-type'], /^text\/css/);
  assert.match((await f.admin('/api/admin/preview/assets/student.js')).headers['content-type'], /^text\/javascript/);
  assert.equal((await f.admin('/api/admin/preview/icon.svg')).text, f.source['icon.svg']);
  // Serving never re-reads a requested filesystem path after the safe build snapshot.
  writeFileSync(join(f.distDirectory, 'assets/student.js'), 'changed-on-disk');
  assert.equal((await f.admin('/api/admin/preview/assets/student.js')).text, f.source['assets/student.js']);
  assert.equal(f.audits(), audits);
});

test('preview rejects all writes, ambiguous spellings and private/root build paths', async t => {
  const f = await fixture(t), audits = f.audits();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    for (const path of previewPaths) assert.equal((await f.admin(path, { method, data: method === 'HEAD' ? undefined : {} })).status, 405, `${method} ${path}`);
  }
  for (const path of [
    '/api/admin/preview/assets/../../console', '/api/admin/preview/assets/../student.js',
    '/api/admin/preview/assets/%2e%2e/student.js', '/api/admin/preview/assets%2fstudent.js',
    '/api/admin/preview/%73tudent', '/api/admin/preview/assets/%73tudent.js',
    '/api/admin/preview/assets/%252e%252e/student.js', '/api/admin/preview/assets/%252fstudent.js',
    '/api/admin/preview/assets/./student.js', '/api/admin/preview/assets//student.js',
    '/api/admin/preview/assets\\student.js', '/api/admin/preview/assets/%5cstudent.js',
    '/api/admin/preview/assets/%', '/api/admin/preview/assets/%GG',
  ]) assert.equal((await f.admin(path)).status, 400, path);
  for (const suffix of ['.env', 'server.key', 'src/main.js', 'data/private.js', 'admin.html', 'index.html', 'teacher.html', 'student-sw.js', 'sw.js', 'manifest.webmanifest', 'teacher.webmanifest', 'favicon.ico', 'assets/source.js.map', 'assets/hidden.pem', 'assets/leaked.js', 'assets/missing.js']) {
    assert.equal((await f.admin('/api/admin/preview/' + suffix)).status, 404, suffix);
  }
  for (const method of ['GET', 'POST']) for (const path of ['/api/student/me', '/api/teacher/me', '/api/student/account/register', '/api/teacher/classrooms', '/api/ui-design', '/assets/student.js', '/src/main.js', '/teacher.html']) {
    assert.equal((await f.admin(path, { method, data: method === 'POST' ? {} : undefined })).status, 404, `${method} ${path}`);
  }
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM classrooms').get().count, 0);
  assert.equal(f.audits(), audits);
});

test('preview enforces same origin and fetch metadata while classroom host keeps admin routes hidden', async t => {
  const f = await fixture(t), audits = f.audits();
  for (const path of previewPaths) {
    for (const origin of [publicOrigin, 'https://foreign.example', 'null', adminOrigin + '/extra']) assert.equal((await f.admin(path, { origin })).status, 403, `${origin} ${path}`);
    assert.equal((await f.admin(path, { origin: null, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403, path);
    for (const method of ['GET', 'POST']) assert.equal((await f.admin(path, { host: classroomHost, origin: publicOrigin, method, data: method === 'POST' ? {} : undefined })).status, 404, `${method} ${path}`);
  }
  assert.equal((await f.send('/api/health', { host: classroomHost, origin: publicOrigin })).status, 200);
  assert.equal((await f.send('/assets/student.js', { host: classroomHost, origin: publicOrigin })).status, 200);
  assert.equal(f.audits(), audits);
});
