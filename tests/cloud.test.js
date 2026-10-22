import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { startCloudServer, validatePublicOrigin } from '../server/cloud.js';
import { encodeWav } from '../src/audio.js';
import { provisionAdmin } from '../server/admin.js';

const publicOrigin = 'https://class.empfreeimpro.xyz';
const host = new URL(publicOrigin).host;
async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'empvc-cloud-'));
  const distDirectory = join(root, 'dist');
  mkdirSync(join(distDirectory, 'assets'), { recursive: true });
  for (const [path, content] of Object.entries({ 'index.html': '<!doctype html><title>学生</title>', 'teacher.html': '<!doctype html><title>教师</title>', 'sw.js': '/* worker */', 'student-sw.js': '/* offline */', 'teacher.webmanifest': '{}', 'assets/student-123.js': '/* student */', 'assets/teacher-456.js': '/* teacher */', '.env': 'private', 'server.key': 'private', 'teacher.token': 'private', 'admin.html': 'private administrator console', 'unlisted.html': 'private' })) writeFileSync(join(distDirectory, path), content);
  for (const name of ['data', 'connection', 'server']) {
    mkdirSync(join(distDirectory, name));
    writeFileSync(join(distDirectory, name, 'private.js'), 'private');
  }
  writeFileSync(join(root, 'private.js'), 'private');
  if (process.platform !== 'win32') symlinkSync(join(root, 'private.js'), join(distDirectory, 'assets/leaked.js'));
  const imageTokenFile = join(root, 'private/teacher.token');
  const app = await startCloudServer({ publicOrigin, distDirectory, dbPath: ':memory:', imageTokenFile, port: 0 });
  t.after(async () => { await app.close(); rmSync(root, { recursive: true, force: true }); });
  const send = (path, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: app.server.address().port, path, method, headers: { Host: host, ...headers } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const bytes = Buffer.concat(chunks), text = bytes.toString();
        resolve({ status: res.statusCode, headers: res.headers, text, bytes, data: res.headers['content-type']?.includes('application/json') && text ? JSON.parse(text) : null });
      });
    });
    req.on('error', reject); req.end(body);
  });
  const client = role => {
    let cookie = '';
    return async (path, data, headers = {}) => {
      const response = await send('/api/' + role + path, { method: data ? 'POST' : 'GET', headers: { Origin: publicOrigin, 'Content-Type': 'application/json', Cookie: cookie, ...headers }, body: data ? JSON.stringify(data) : undefined });
      if (response.headers['set-cookie']) cookie = response.headers['set-cookie'][0].split(';')[0];
      return response;
    };
  };
  return { ...app, root, imageTokenFile, send, client };
}

test('cloud configuration requires an explicit canonical public HTTPS origin', () => {
  assert.equal(validatePublicOrigin(publicOrigin).origin, publicOrigin);
  for (const value of [undefined, 'http://class.empfreeimpro.xyz', publicOrigin + '/', publicOrigin + '/teacher.html', publicOrigin + ':8443', publicOrigin + ':443', publicOrigin + '?x=1', publicOrigin + '#', 'https://person:secret@class.empfreeimpro.xyz', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://teacher.local', 'https://class.empfreeimpro.xyz.evil/teacher.html', 'https://CLASS.empfreeimpro.xyz']) assert.throws(() => validatePublicOrigin(value), undefined, String(value));
});

test('cloud serves separate built clients without exposing private files or certificate setup', async t => {
  const app = await fixture(t);
  assert.equal(app.classroomUrl, publicOrigin + '/');
  assert.equal(app.server.address().address, '127.0.0.1');
  assert.match((await app.send('/')).text, /学生/);
  assert.match((await app.send('/teacher.html')).text, /教师/);
  assert.equal((await app.send('/assets/teacher-456.js')).headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal((await app.send('/student-sw.js')).headers['cache-control'], 'no-cache');
  const head = await app.send('/teacher.html', { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(head.bytes.length, 0); assert.ok(Number(head.headers['content-length']) > 0);
  for (const path of ['/.env', '/server.key', '/teacher.token', '/admin.html', '/unlisted.html', '/data/private.js', '/server/private.js', '/connection/private.js', '/connection', '/connection.json', '/connection/ca.crt', '/assets/leaked.js', '/src/main.js', '/assets/app.js.map']) assert.equal((await app.send(path)).status, 404, path);
  for (const method of ['GET', 'POST']) assert.equal((await app.send('/mcp/images', { method, headers: { Origin: publicOrigin }, body: method === 'POST' ? '{}' : undefined })).status, 404);
  // Even an existing valid administrator session cannot publish maintenance
  // tools through the public teacher/student endpoint after app.js changes.
  const admin = await provisionAdmin(app.db, { username: 'cloud_admin', password: 'test_password123', name: '测试管理员' });
  const adminToken = randomBytes(32).toString('hex');
  app.db.prepare('INSERT INTO admin_sessions VALUES(?,?,?)').run(createHash('sha256').update(adminToken).digest('hex'), admin.id, Date.now() + 60000);
  for (const method of ['GET', 'POST']) {
    for (const path of ['/api/admin', '/api/admin/console', '/api/admin/login', '/api/admin/overview', '/api/admin/database/', '/api/admin/export?table=users', '/api/image-mcp-save-local', '/api/teacher/image-mcp-save-local', '/api/student/image-mcp-save-local']) {
      const response = await app.send(path, { method, headers: { Origin: publicOrigin, Cookie: 'fi_session_admin=' + adminToken, 'X-Forwarded-Host': 'localhost', 'X-Forwarded-For': '127.0.0.1' }, body: method === 'POST' ? '{}' : undefined });
      assert.equal(response.status, 404, `${method} ${path}`);
    }
  }
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM admin_audit').get().n, 0);
  for (const path of ['/../teacher.html', '/%2e%2e/teacher.html', '/assets%2fprivate.js', '//evil.example/teacher.html', '/assets\\private.js']) assert.equal((await app.send(path)).status, 400, path);
  assert.equal((await app.send('/teacher.html', { method: 'POST' })).status, 405);
  await Promise.all([app.close(), app.close()]);
  assert.equal(app.server.listening, false);
  assert.throws(() => app.db.prepare('SELECT 1'), /closed|open/i);
});

test('cloud rejects incorrect Host and Origin without granting authority to forwarding headers', async t => {
  const app = await fixture(t);
  const forwarded = { 'X-Forwarded-Host': host, 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '127.0.0.1', Forwarded: `for=127.0.0.1;host=${host};proto=https` };
  for (const wrongHost of ['127.0.0.1', 'localhost', host + ':443', host + '.evil', host.toUpperCase()]) assert.equal((await app.send('/api/health', { headers: { Host: wrongHost, ...forwarded } })).status, 421, wrongHost);
  assert.equal((await app.send('/api/health', { headers: { Origin: 'https://other.example' } })).status, 403);
  assert.equal((await app.send('/api/health', { headers: { Origin: publicOrigin, ...forwarded, 'X-Forwarded-Host': 'localhost', 'X-Forwarded-Proto': 'http' } })).status, 200);
  for (const origin of ['http://' + host, publicOrigin + '/teacher.html', publicOrigin + ':443', 'null']) assert.equal((await app.send('/api/teacher/register', { method: 'POST', headers: { Origin: origin, ...forwarded }, body: '{}' })).status, 403, origin);
  assert.equal((await app.send('/api/teacher/register', { method: 'POST', body: '{}' })).status, 403);
});

test('Apple cross-origin POST is allowed only at the exact callback and still requires verified OAuth state', async t => {
  const app = await fixture(t);
  const headers = { Origin: 'https://appleid.apple.com', 'Content-Type': 'application/x-www-form-urlencoded' };
  const callback = await app.send('/api/student/auth/callback/apple', { method: 'POST', headers, body: 'state=missing-synthetic-state&code=synthetic-invalid-code' });
  // The trusted callback origin reaches the student authentication guard,
  // which still rejects a request without a valid initiating intent.
  assert.equal(callback.status, 403);
  assert.equal(callback.data?.error, '登录回调已过期或已使用，请重新登录。');
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  for (const path of ['/api/student/account/register', '/api/student/account/login', '/api/teacher/register', '/api/student/auth/callback/wechat', '/api/student/auth/callback/apple/']) {
    assert.equal((await app.send(path, { method: 'POST', headers, body: '{}' })).status, 403, path);
  }
  assert.equal((await app.send('/api/student/auth/callback/apple', { headers })).status, 403);
  for (const origin of ['https://appleid.apple.com/', 'https://appleid.apple.com.evil.example', 'https://APPLEID.apple.com', 'http://appleid.apple.com']) {
    assert.equal((await app.send('/api/student/auth/callback/apple', { method: 'POST', headers: { ...headers, Origin: origin }, body: '{}' })).status, 403, origin);
  }
});

test('cloud runs real secure classroom submission flow and denies local credential saving', async t => {
  const app = await fixture(t), teacher = app.client('teacher'), student = app.client('student');
  const registered = await teacher('/register', { username: 'cloud_teacher', password: 'password123', name: '老师', role: 'teacher' });
  assert.equal(registered.status, 200);
  assert.match(registered.headers['set-cookie'][0], /^fi_session_teacher=/);
  assert.match(registered.headers['set-cookie'][0], /HttpOnly; SameSite=Strict; Path=\/api\/teacher;.*; Secure$/);
  const created = await teacher('/classrooms', { name: '云端课堂', capacity: 15, background: '教室' });
  assert.equal(created.status, 201);
  const { id, code } = created.data.classroom;
  const entered = await student('/enter-classroom', { name: '学生', code });
  assert.equal(entered.status, 200);
  assert.equal(entered.data.user.role, 'student');
  assert.match(entered.headers['set-cookie'][0], /^fi_session_student=.*; Secure$/);
  const audio = Buffer.from(await encodeWav(new Float32Array(2400), 24000).arrayBuffer()).toString('base64');
  const submitted = await student(`/classrooms/${id}/submit`, { name: '杯子', requestId: randomUUID(), audio });
  assert.equal(submitted.status, 201);
  const item = submitted.data.classroom.submissions[0];
  assert.equal(item.name, '杯子');
  assert.equal((await teacher('/classrooms/' + id)).data.classroom.submissions[0].id, item.id);
  assert.deepEqual((await teacher('/submissions/' + item.id + '/audio')).bytes, Buffer.from(audio, 'base64'));
  assert.equal((await teacher('/me', undefined, { 'User-Agent': 'FreeImproStudent/1' })).status, 403);
  assert.equal((await student('/me', undefined, { 'User-Agent': 'FreeImproTeacher/1' })).status, 403);
  const forwarded = { 'X-Forwarded-Host': 'localhost', 'X-Forwarded-For': '127.0.0.1', Forwarded: 'for=127.0.0.1;host=localhost' };
  const jobs = await teacher('/image-jobs');
  assert.equal(jobs.status, 200); assert.deepEqual(jobs.data.jobs, []);
  assert.equal((await teacher('/image-mcp-connection', undefined, forwarded)).data.canSaveLocally, false);
  const token = (await teacher('/image-mcp-token', {})).data.token;
  assert.equal((await teacher('/image-mcp-save-local', { token }, forwarded)).status, 404);
  assert.equal(existsSync(app.imageTokenFile), false);
});

test('cloud preserves the existing JSON body limit', async t => {
  const app = await fixture(t);
  const response = await app.send('/api/student/enter-classroom', { method: 'POST', headers: { Origin: publicOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '学生', code: '123456', extra: 'x'.repeat(1300000) }) });
  assert.equal(response.status, 413);
  assert.equal(response.data.error, '提交内容过大。');
});

test('cloud CLI uses only explicit environment and closes on SIGTERM', { timeout: 10000 }, async t => {
  const app = await fixture(t);
  // A developer .env must not replace production configuration or be needed.
  writeFileSync(join(app.root, '.env'), 'PUBLIC_ORIGIN=http://localhost\nCLOUD_BIND=not-an-ip\nCLOUD_PORT=invalid\n');
  const dbPath = join(app.root, 'cli/classroom.sqlite');
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server/cloud.js', import.meta.url))], { cwd: app.root, env: { PATH: process.env.PATH, PUBLIC_ORIGIN: publicOrigin, DIST_DIRECTORY: join(app.root, 'dist'), FREE_IMPRO_DB: dbPath, CLOUD_BIND: '127.0.0.1', CLOUD_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let output = '', errors = '';
  child.stderr.on('data', chunk => { errors += chunk.toString(); });
  const exited = once(child, 'exit');
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => { if (!output.includes('Classroom cloud backend ready')) reject(new Error(`CLI exited before startup (${code}): ${errors}`)); });
    child.stdout.on('data', chunk => { output += chunk.toString(); if (output.includes('Classroom cloud backend ready')) resolve(); });
  });
  assert.match(output, /ready for https:\/\/class\.empfreeimpro\.xyz/);
  assert.equal(existsSync(dbPath), true);
  child.kill('SIGTERM');
  const [code, signal] = await exited;
  assert.equal(code, 0); assert.equal(signal, null);
  assert.equal(existsSync(dbPath + '-wal'), false);
});
