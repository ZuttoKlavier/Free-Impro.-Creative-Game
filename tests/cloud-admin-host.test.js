import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startCloudServer } from '../server/cloud.js';
import { provisionAdmin } from '../server/admin.js';

const publicOrigin = 'https://class.empfreeimpro.xyz';
const adminOrigin = 'https://admin.empfreeimpro.xyz';
const classroomHost = new URL(publicOrigin).host;
const administratorHost = new URL(adminOrigin).host;
const adminPassword = 'synthetic-admin-host-password-123';

// These fixtures bind only loopback, own synthetic in-memory databases and use
// temporary build files. No running classroom or external service is contacted.
async function fixture(t, options = { adminOrigin }) {
  const root = mkdtempSync(join(tmpdir(), 'empvc-cloud-admin-host-'));
  const distDirectory = join(root, 'dist');
  mkdirSync(join(distDirectory, 'assets'), { recursive: true });
  for (const [file, content] of Object.entries({
    'index.html': '<!doctype html><title>Synthetic student</title>',
    'teacher.html': '<!doctype html><title>Synthetic teacher</title>',
    'assets/client.js': '/* synthetic classroom asset */',
    'admin.html': 'private build file', '.env': 'private build file',
  })) writeFileSync(join(distDirectory, file), content);
  let app;
  try { app = await startCloudServer({ publicOrigin, distDirectory, dbPath: ':memory:', port: 0, ...options }); }
  catch (error) { rmSync(root, { recursive: true, force: true }); throw error; }
  t.after(async () => { await app.close(); rmSync(root, { recursive: true, force: true }); });
  const send = (path, { host = administratorHost, method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: app.server.address().port, path, method, headers: { Host: host, ...headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, headers: res.headers, text, data: res.headers['content-type']?.includes('application/json') && text ? JSON.parse(text) : null });
      });
    });
    req.on('error', reject); req.end(body);
  });
  const client = (role, origin = role === 'admin' ? adminOrigin : publicOrigin) => {
    let cookie = '';
    const call = async (path, data) => {
      const result = await send('/api/' + role + path, {
        host: new URL(origin).host, method: data === undefined ? 'GET' : 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      if (result.headers['set-cookie']) cookie = result.headers['set-cookie'][0].split(';')[0];
      return result;
    };
    call.cookie = () => cookie;
    return call;
  };
  const login = async () => {
    await provisionAdmin(app.db, { username: 'host_admin', password: adminPassword });
    const admin = client('admin');
    const result = await admin('/login', { username: 'host_admin', password: adminPassword });
    assert.equal(result.status, 200, result.text);
    return { admin, result };
  };
  return { ...app, send, client, login };
}

test('administrator origin requires canonical HTTPS and a different classroom host', async () => {
  for (const value of [null, '', 'http://admin.empfreeimpro.xyz', adminOrigin + '/', adminOrigin + '/api/admin', adminOrigin + ':443', adminOrigin + ':8443', adminOrigin + '?x=1', adminOrigin + '#', 'https://name:secret@admin.empfreeimpro.xyz', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://admin.internal', 'https://ADMIN.empfreeimpro.xyz', publicOrigin]) {
    await assert.rejects(startCloudServer({ publicOrigin, adminOrigin: value, distDirectory: '/nonexistent-admin-host-test-build' }), /ADMIN_ORIGIN/, String(value));
  }
});

test('administrator host remains disabled when ADMIN_ORIGIN is absent', async t => {
  const previous = process.env.ADMIN_ORIGIN;
  delete process.env.ADMIN_ORIGIN;
  let app;
  try { app = await fixture(t, {}); }
  finally { if (previous === undefined) delete process.env.ADMIN_ORIGIN; else process.env.ADMIN_ORIGIN = previous; }
  assert.equal(app.adminOrigin, null);
  assert.equal(app.adminUrl, null);
  assert.equal((await app.send('/api/admin/console')).status, 421);
  assert.equal((await app.send('/api/admin/console', { host: classroomHost })).status, 404);
  assert.equal((await app.send('/api/health', { host: classroomHost })).status, 200);
});

test('explicit ADMIN_ORIGIN serves only the console API and a root redirect', async t => {
  const previous = process.env.ADMIN_ORIGIN;
  process.env.ADMIN_ORIGIN = adminOrigin;
  let app;
  try { app = await fixture(t, {}); }
  finally { if (previous === undefined) delete process.env.ADMIN_ORIGIN; else process.env.ADMIN_ORIGIN = previous; }
  assert.equal(app.adminOrigin, adminOrigin);
  assert.equal(app.adminUrl, adminOrigin + '/api/admin/console');
  assert.equal(app.server.address().address, '127.0.0.1');
  for (const method of ['GET', 'HEAD']) {
    const redirected = await app.send('/', { method });
    assert.equal(redirected.status, 302);
    assert.equal(redirected.headers.location, '/api/admin/console');
    assert.equal(redirected.headers['cache-control'], 'no-store');
    assert.equal(redirected.text, '');
  }
  assert.equal((await app.send('/', { method: 'POST' })).status, 405);
  const console = await app.send('/api/admin/console');
  assert.equal(console.status, 200);
  assert.match(console.headers['content-type'], /text\/html/);
  assert.match(console.text, /管理员登录/);
  assert.equal(console.headers['cache-control'], 'no-store');
  for (const path of ['/api/admin/me', '/api/admin/overview', '/api/admin/assets?table=submissions&column=audio&row=1', '/api/admin/database/', '/api/admin/database/static/app.js', '/api/admin/page-editor.js', '/api/admin/page-editor.css']) {
    assert.equal((await app.send(path)).status, 401, path);
  }
  for (const method of ['GET', 'POST']) {
    for (const path of ['/api/health', '/api/teacher/login', '/api/student/account/login', '/api/student/auth/callback/apple', '/api/register', '/mcp/images', '/api/image-mcp-save-local', '/teacher.html', '/index.html', '/assets/client.js', '/admin.html', '/.env', '/data/classroom.sqlite', '/data/admin/initial-login.txt', '/api/administrator/me']) {
      assert.equal((await app.send(path, { method, headers: { Origin: adminOrigin }, body: method === 'POST' ? '{}' : undefined })).status, 404, `${method} ${path}`);
    }
  }
});

test('administrator host preserves secure isolated sessions and classroom route exclusion', async t => {
  const app = await fixture(t), { admin, result } = await app.login();
  const cookieHeader = result.headers['set-cookie'][0];
  assert.match(cookieHeader, /^fi_session_admin=[a-f0-9]{64}; HttpOnly; SameSite=Strict; Path=\/api\/admin; Max-Age=28800; Secure$/);
  assert.doesNotMatch(cookieHeader, /Domain=/i);
  assert.equal((await admin('/me')).data.admin.username, 'host_admin');
  assert.equal((await admin('/overview')).status, 200);
  assert.equal((await admin('/page-editor.js')).status, 200);
  const teacher = app.client('teacher');
  assert.equal((await teacher('/register', { username: 'host_teacher', password: 'synthetic-teacher-password-123', name: 'Synthetic teacher', role: 'teacher' })).status, 200);
  assert.equal((await app.send('/api/admin/me', { headers: { Cookie: teacher.cookie() } })).status, 401);
  assert.equal((await app.send('/api/admin/me', { headers: { Cookie: teacher.cookie().replace('fi_session_teacher=', 'fi_session_admin=') } })).status, 401);
  for (const path of ['/api/admin', '/api/admin/console', '/api/admin/me', '/api/admin/overview', '/api/admin/database/', '/api/admin/page-editor.js']) {
    assert.equal((await app.send(path, { host: classroomHost, headers: { Origin: publicOrigin, Cookie: admin.cookie() } })).status, 404, path);
  }
  assert.equal((await app.send('/api/teacher/me', { host: classroomHost, headers: { Origin: publicOrigin, Cookie: admin.cookie() } })).status, 401);
  const oldCookie = admin.cookie();
  assert.equal((await admin('/logout', {})).status, 200);
  for (const path of ['/api/admin/me', '/api/admin/database/', '/api/admin/page-editor.js']) {
    assert.equal((await app.send(path, { headers: { Cookie: oldCookie } })).status, 401, path);
  }
  assert.equal((await teacher('/me')).status, 200);
});

test('administrator routing enforces exact origins and ignores forwarded authority', async t => {
  const app = await fixture(t), { admin } = await app.login();
  const forwarded = { 'X-Forwarded-Host': administratorHost, 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '127.0.0.1', Forwarded: `for=127.0.0.1;host=${administratorHost};proto=https` };
  for (const host of ['localhost', '127.0.0.1', administratorHost + ':443', administratorHost + '.evil.example', administratorHost.toUpperCase()]) {
    assert.equal((await app.send('/api/admin/console', { host, headers: forwarded })).status, 421, host);
  }
  assert.equal((await app.send('/api/admin/console', { host: classroomHost, headers: forwarded })).status, 404);
  for (const origin of [publicOrigin, 'http://' + administratorHost, adminOrigin + '/', adminOrigin + ':443', 'null', 'https://appleid.apple.com']) {
    for (const path of ['/api/admin/console', '/api/admin/me', '/api/admin/login']) {
      assert.equal((await app.send(path, { method: path.endsWith('/login') ? 'POST' : 'GET', headers: { ...forwarded, Origin: origin, Cookie: admin.cookie(), 'Content-Type': 'application/json' }, body: path.endsWith('/login') ? '{}' : undefined })).status, 403, `${origin} ${path}`);
    }
  }
  assert.equal((await app.send('/api/admin/login', { method: 'POST', headers: { ...forwarded, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await app.send('/api/admin/me', { headers: { Cookie: admin.cookie(), Origin: adminOrigin, 'X-Forwarded-Host': 'localhost', 'X-Forwarded-Proto': 'http' } })).status, 200);
  assert.equal((await app.send('/api/teacher/me', { host: classroomHost, headers: { Origin: adminOrigin, ...forwarded } })).status, 403);
  const apple = { method: 'POST', headers: { Origin: 'https://appleid.apple.com', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'state=missing-synthetic-state&code=synthetic-invalid-code' };
  assert.equal((await app.send('/api/student/auth/callback/apple', apple)).status, 403);
  const callback = await app.send('/api/student/auth/callback/apple', { ...apple, host: classroomHost });
  assert.equal(callback.status, 403);
  assert.equal(callback.data?.error, '登录回调已过期或已使用，请重新登录。');
});

test('both configured hosts reject ambiguous paths before dispatching shared APIs', async t => {
  const app = await fixture(t);
  for (const host of [classroomHost, administratorHost]) {
    for (const path of ['https://' + administratorHost + '/api/admin/console', '//api/admin/console', '/api/admin/../teacher/me', '/api/admin/./console', '/api/admin/%2e%2e/teacher/me', '/api/admin%2fconsole', '/api/admin\\console', '/api/admin/%5cconsole', '/api/admin/%', '/api/admin/%GG']) {
      assert.equal((await app.send(path, { host })).status, 400, `${host} ${path}`);
    }
    // An encoded spelling never becomes the public administrator console;
    // the classroom app may reject unknown APIs at its general auth guard.
    assert.ok([401, 404].includes((await app.send('/api/%61dmin/console', { host })).status));
  }
});

test('administrator and classroom hosts share live performance deletion protection', async t => {
  const app = await fixture(t), { admin } = await app.login(), teacher = app.client('teacher');
  const registered = await teacher('/register', { username: 'performing_teacher', password: 'synthetic-teacher-password-123', name: 'Synthetic performer', role: 'teacher' });
  assert.equal(registered.status, 200);
  const created = await teacher('/classrooms', { name: 'Synthetic protected classroom', capacity: 2, background: '教室' });
  assert.equal(created.status, 201);
  const classroom = created.data.classroom, teacherId = registered.data.user.id;
  const performance = { clientId: 'synthetic-admin-host-performance', playing: true, activeStudentIds: [] };
  assert.equal((await teacher(`/classrooms/${classroom.id}/performance`, performance)).status, 200);
  assert.equal((await admin('/overview')).data.counts.classrooms, 1);
  for (const [entity, id] of [['classrooms', classroom.id], ['users', teacherId]]) {
    const denied = await admin(`/${entity}/${id}/delete`, { confirmation: id });
    assert.equal(denied.status, 409, denied.text);
    assert.match(denied.data.error, /正在演奏/);
  }
  assert.equal((await teacher(`/classrooms/${classroom.id}`)).data.classroom.performance.playing, true);
  assert.equal((await teacher(`/classrooms/${classroom.id}/performance`, { ...performance, playing: false })).status, 200);
  assert.equal((await admin(`/classrooms/${classroom.id}/delete`, { confirmation: classroom.id })).status, 200);
  assert.equal((await teacher(`/classrooms/${classroom.id}`)).status, 404);
  assert.deepEqual(app.db.prepare('PRAGMA foreign_key_check').all(), []);
});
