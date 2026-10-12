import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
import { createApp } from '../server/app.js';
import { provisionAdmin } from '../server/admin.js';
import { IMAGE_PROJECT } from '../server/image-workflow.js';

const password = 'synthetic-password-123';
const adminPassword = 'synthetic-admin-password-123';
const businessTables = ['users', 'sessions', 'classrooms', 'members', 'submissions', 'classroom_places', 'classroom_arrangements', 'classroom_rhythm_tracks', 'student_rhythm_requests', 'student_rhythm_receipts', 'student_profiles', 'image_jobs', 'image_mcp_tokens', 'image_mcp_activity', 'image_conversations'];
const managedTables = [...businessTables, 'admin_accounts', 'admin_sessions', 'admin_audit'];
const secretKeys = new Set(['salt', 'password', 'token', 'digest', 'claim_id']);

// All accounts, recordings and pictures in this file are synthetic. Each test
// owns a fresh in-memory database; the classroom service is never contacted.
function wavBytes() {
  const samples = 800, rate = 8000, bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8);
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 2, 40);
  return bytes;
}

const png = new PNG({ width: 8, height: 8 });
png.data.fill(125);
const pngBytes = PNG.sync.write(png);
const image = 'data:image/png;base64,' + pngBytes.toString('base64');

async function fixture(t) {
  const app = createApp({ dbPath: ':memory:' });
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    app.server.closeAllConnections();
    await new Promise(resolve => app.server.close(resolve));
    app.db.close();
  });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  function client(role) {
    let cookie = '';
    const request = async (path, data, options = {}) => {
      const headers = { 'Content-Type': 'application/json', Cookie: options.cookie ?? cookie, 'User-Agent': options.agent || 'AdminSyntheticTest/1' };
      if (options.origin !== null) headers.Origin = options.origin ?? origin;
      const response = await fetch(`${origin}/api/${role}${path}`, {
        method: data === undefined ? 'GET' : 'POST', headers,
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      const header = response.headers.get('set-cookie');
      if (header) cookie = header.split(';')[0];
      const contentType = response.headers.get('content-type') || '';
      return { status: response.status, headers: response.headers, data: contentType.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
    };
    request.cookie = () => cookie;
    return request;
  }
  async function register(username, role) {
    const request = client(role);
    const result = await request('/register', { username, password, name: username, role });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return { request, user: result.data.user };
  }
  await provisionAdmin(app.db, { username: 'synthetic_admin', password: adminPassword, name: '合成管理员' });
  const admin = client('admin');
  assert.equal((await admin('/login', { username: 'synthetic_admin', password: adminPassword })).status, 200);
  const teacher = await register('synthetic_teacher', 'teacher');
  const otherTeacher = await register('synthetic_other_teacher', 'teacher');
  const student = await register('synthetic_student', 'student');
  const otherStudent = await register('synthetic_other_student', 'student');
  async function makeRoom(owner, name) {
    const created = await owner.request('/classrooms', { name, capacity: 3, background: '教室' });
    assert.equal(created.status, 201);
    return created.data.classroom;
  }
  const room = await makeRoom(teacher, '合成课堂一');
  const otherRoom = await makeRoom(otherTeacher, '合成课堂二');
  assert.equal((await student.request('/join', { code: room.code })).status, 200);
  assert.equal((await otherStudent.request('/join', { code: otherRoom.code })).status, 200);
  async function submit(owner = student, classroom = room, name = '合成音频') {
    const result = await owner.request(`/classrooms/${classroom.id}/submit`, { requestId: randomUUID(), name, audio: wavBytes().toString('base64'), image, imageKind: 'photo' });
    assert.equal(result.status, 201);
    return result.data.classroom.submissions.find(row => row.status === 'current');
  }
  async function imageJob(owner = student, classroom = room) {
    assert.equal((await owner.request('/image-profile/register', {})).status, 200);
    const requestId = randomUUID();
    const result = await owner.request('/image-jobs', { requestId, classId: classroom.id, kind: 'identity', photo: image });
    assert.equal(result.status, 201);
    return requestId;
  }
  async function rhythm(submission) {
    const requestId = randomUUID();
    const payload = { requestId, submissionId: submission.id, rhythm: { bars: 1, steps: Array.from({ length: 16 }, (_, index) => index === 0) } };
    assert.equal((await student.request(`/classrooms/${room.id}/rhythm-request`, payload)).status, 200);
    assert.equal((await teacher.request(`/classrooms/${room.id}/rhythm-decision`, { studentId: student.user.id, requestId, decision: 'accept', revision: 0 })).status, 200);
  }
  return { ...app, origin, client, admin, teacher, otherTeacher, student, otherStudent, room, otherRoom, submit, imageJob, rhythm };
}

function assertSuccess(result) {
  assert.ok(result.status >= 200 && result.status < 300, `${result.status}: ${JSON.stringify(result.data)}`);
}

async function records(admin, table, values = {}) {
  const query = new URLSearchParams({ table, ...values });
  const result = await admin('/records?' + query);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.ok(Array.isArray(result.data.columns));
  assert.ok(result.data.columns.every(column => typeof column.key === 'string' && typeof column.label === 'string'));
  assert.ok(Array.isArray(result.data.rows));
  assert.ok(Number.isInteger(result.data.total));
  assert.equal(result.data.pageSize, 25);
  return result.data;
}

test('admin authentication is isolated from teacher, student and public registration', async t => {
  const f = await fixture(t), guest = f.client('admin');
  assert.equal((await guest('/me')).status, 401);
  assert.equal((await guest('/overview')).status, 401);
  for (const account of [f.teacher, f.student]) {
    assert.equal((await guest('/overview', undefined, { cookie: account.request.cookie() })).status, 401);
    const renamed = account.request.cookie().replace(/fi_session_(teacher|student)/, 'fi_session_admin');
    assert.equal((await guest('/overview', undefined, { cookie: renamed })).status, 401);
  }
  assert.match(f.admin.cookie(), /^fi_session_admin=/);
  assert.equal((await f.admin('/me')).data.admin.username, 'synthetic_admin');
  assert.equal((await guest('/login', { username: 'synthetic_teacher', password })).status, 401);
  assert.equal((await guest('/login', { username: 'synthetic_admin', password: 'wrong-password-123' })).status, 401);
  const teacherRegistration = await f.client('teacher')('/register', { username: 'forged_admin', password, name: '伪造管理员', role: 'admin' });
  assert.equal(teacherRegistration.status, 400);
  const publicRegistration = await fetch(f.origin + '/api/register', { method: 'POST', headers: { Origin: f.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'public_admin', password, name: '伪造管理员', role: 'admin' }) });
  assert.equal(publicRegistration.status, 400);
  for (const path of ['/api/login', '/api/teacher/login', '/api/student/login']) {
    const response = await fetch(f.origin + path, { method: 'POST', headers: { Origin: f.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'synthetic_admin', password: adminPassword }) });
    assert.ok([401, 403].includes(response.status));
  }
  const oldCookie = f.admin.cookie();
  assertSuccess(await f.admin('/logout', {}));
  assert.equal((await guest('/me', undefined, { cookie: oldCookie })).status, 401);
  assert.equal((await f.teacher.request('/me')).status, 200);
  assert.equal((await f.student.request('/me')).status, 200);
});

test('admin mutations enforce same origin and failed operations leave data unchanged', async t => {
  const f = await fixture(t), before = f.db.prepare('SELECT name FROM users WHERE id=?').get(f.student.user.id).name;
  for (const origin of ['https://unrelated.invalid', null]) {
    assert.equal((await f.admin(`/users/${f.student.user.id}/update`, { name: '不应写入' }, { origin })).status, 403);
    assert.equal((await f.client('admin')('/login', { username: 'synthetic_admin', password: adminPassword }, { origin })).status, 403);
  }
  assert.equal(f.db.prepare('SELECT name FROM users WHERE id=?').get(f.student.user.id).name, before);
  const userCount = f.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  assert.equal((await f.admin('/users/create', { username: 'unwanted_admin', name: '拒绝提权', password, role: 'admin' })).status, 400);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, userCount);
  assert.equal((await f.admin(`/users/${f.student.user.id}/delete`, { confirmation: 'wrong-id' })).status, 400);
  assert.ok(f.db.prepare('SELECT 1 FROM users WHERE id=?').get(f.student.user.id));
});

test('all database areas are available without credential or blob disclosure', async t => {
  const f = await fixture(t), submission = await f.submit();
  await f.rhythm(submission);
  const jobId = await f.imageJob(), claimId = randomUUID();
  assert.equal((await f.teacher.request(`/image-jobs/${jobId}/claim`, { claimId })).status, 200);
  assert.equal((await f.teacher.request(`/image-jobs/${jobId}/conversation`, { projectUrl: IMAGE_PROJECT.url, conversationUrl: 'https://chatgpt.com/c/' + randomUUID() })).status, 200);
  assert.equal((await f.teacher.request('/image-mcp-token', {})).status, 201);
  const tokenDigest = f.db.prepare('SELECT digest FROM image_mcp_tokens').get().digest;
  f.db.prepare('INSERT INTO image_mcp_activity(digest,last_tool_at) VALUES(?,?)').run(tokenDigest, Date.now());
  const overview = await f.admin('/overview');
  assert.equal(overview.status, 200);
  assert.ok(overview.data.counts && typeof overview.data.counts === 'object');
  const available = overview.data.tables.map(table => typeof table === 'string' ? table : table.name || table.key);
  for (const table of managedTables) assert.ok(available.includes(table), `missing table ${table}`);
  const secrets = [password, adminPassword, claimId];
  for (const table of ['users', 'sessions', 'image_mcp_tokens', 'image_mcp_activity', 'admin_accounts', 'admin_sessions']) {
    const columns = f.db.prepare(`PRAGMA table_info(${table})`).all().filter(column => secretKeys.has(column.name));
    for (const row of f.db.prepare(`SELECT * FROM ${table}`).all()) {
      for (const column of columns) if (typeof row[column.name] === 'string' && row[column.name].length >= 8) secrets.push(row[column.name]);
    }
  }
  for (const table of managedTables) {
    const data = await records(f.admin, table), encoded = JSON.stringify(data);
    for (const value of secrets) assert.ok(!encoded.includes(value), `secret escaped through ${table}`);
    assert.ok(!encoded.includes(wavBytes().toString('base64')), `audio escaped through ${table}`);
    assert.ok(!encoded.includes(pngBytes.toString('base64')), `image escaped through ${table}`);
  }
  const data = await records(f.admin, 'submissions');
  const row = data.rows.find(item => item.id === submission.id);
  assert.equal(row.audio.bytes, wavBytes().length);
  assert.equal(row.audio.type, 'audio/wav');
  assert.equal(typeof row.audio.url, 'string');
  assert.equal(row.image.bytes, pngBytes.length);
  assert.equal(row.image.type, 'image/png');
});

test('record filtering, pagination and injection probes preserve database boundaries', async t => {
  const f = await fixture(t);
  for (let index = 0; index < 27; index++) {
    const id = randomUUID();
    f.db.prepare('INSERT INTO users(id,username,name,role,salt,password) VALUES(?,?,?,?,?,?)').run(id, `page_${index}`, `分页学生 ${index}`, 'student', 'synthetic-salt', 'unused-synthetic-hash');
  }
  const teachers = await records(f.admin, 'users', { role: 'teacher' });
  assert.equal(teachers.total, 2);
  assert.ok(teachers.rows.every(row => row.role === 'teacher'));
  const first = await records(f.admin, 'users', { page: '1' });
  const second = await records(f.admin, 'users', { page: '2' });
  assert.equal(first.total, 31); assert.equal(first.page, 1); assert.equal(second.page, 2);
  assert.equal(first.rows.length, 25); assert.equal(second.rows.length, 6);
  assert.ok(first.rows.every(row => !second.rows.some(other => other.id === row.id)));
  const filtered = await records(f.admin, 'users', { q: '分页学生 26' });
  assert.equal(filtered.total, 1); assert.equal(filtered.rows[0].username, 'page_26');
  const injected = await records(f.admin, 'users', { q: "' OR 1=1 --" });
  assert.equal(injected.total, 0);
  const tableInjection = await f.admin('/records?' + new URLSearchParams({ table: 'users; DROP TABLE users;--' }));
  assert.ok([400, 404].includes(tableInjection.status));
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 31);
});

test('admin manages both teachers and their resources while teacher ownership stays intact', async t => {
  const f = await fixture(t), otherSubmission = await f.submit(f.otherStudent, f.otherRoom);
  assert.equal((await f.teacher.request(`/classrooms/${f.otherRoom.id}`)).status, 403);
  assert.equal((await f.teacher.request(`/submissions/${otherSubmission.id}/audio`)).status, 403);
  assertSuccess(await f.admin(`/users/${f.otherTeacher.user.id}/update`, { name: '后台更新教师' }));
  assertSuccess(await f.admin(`/classrooms/${f.otherRoom.id}/update`, { name: '后台更新课堂' }));
  assertSuccess(await f.admin(`/submissions/${otherSubmission.id}/update`, { name: '后台更新声音' }));
  const observed = await f.otherTeacher.request(`/classrooms/${f.otherRoom.id}`);
  assert.equal(observed.data.classroom.name, '后台更新课堂');
  assert.equal(observed.data.classroom.submissions[0].name, '后台更新声音');
  assert.equal((await f.otherTeacher.request('/me')).data.user.name, '后台更新教师');
  assert.equal((await f.teacher.request(`/classrooms/${f.otherRoom.id}`)).status, 403);
  const markupName = '<img src=x onerror=alert(1)>';
  const created = await f.admin('/users/create', { username: 'created_teacher', password, name: markupName, role: 'teacher' });
  assertSuccess(created);
  const stored = await f.admin('/records?' + new URLSearchParams({ table: 'users', q: 'created_teacher' }));
  assert.equal(stored.status, 200);
  assert.match(stored.headers.get('content-type'), /^application\/json/);
  assert.equal(stored.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(stored.data.rows[0].name, markupName);
  const request = f.client('teacher');
  assert.equal((await request('/login', { username: 'created_teacher', password })).status, 200);
  const account = (await request('/me')).data.user;
  assertSuccess(await f.admin(`/users/${account.id}/delete`, { confirmation: account.id }));
  assert.equal((await request('/me')).status, 401);
});

test('password reset and session revoke take effect for existing teacher and admin sessions', async t => {
  const f = await fixture(t), newPassword = 'synthetic-new-password-456';
  assertSuccess(await f.admin(`/users/${f.teacher.user.id}/password`, { password: newPassword }));
  assert.equal((await f.teacher.request('/me')).status, 401);
  const teacher = f.client('teacher');
  assert.equal((await teacher('/login', { username: f.teacher.user.username, password })).status, 401);
  assert.equal((await teacher('/login', { username: f.teacher.user.username, password: newPassword })).status, 200);
  assertSuccess(await f.admin(`/users/${f.teacher.user.id}/revoke`, {}));
  assert.equal((await teacher('/me')).status, 401);
  const oldAdminCookie = f.admin.cookie();
  await provisionAdmin(f.db, { username: 'synthetic_admin', password: newPassword, name: '重置后的管理员' });
  const admin = f.client('admin');
  assert.equal((await admin('/me', undefined, { cookie: oldAdminCookie })).status, 401);
  assert.equal((await admin('/login', { username: 'synthetic_admin', password: adminPassword })).status, 401);
  assert.equal((await admin('/login', { username: 'synthetic_admin', password: newPassword })).status, 200);
  const audit = await records(admin, 'admin_audit');
  const data = JSON.stringify(audit);
  for (const secret of [password, adminPassword, newPassword, oldAdminCookie]) assert.ok(!data.includes(secret));
});

test('blob downloads need an admin session and return original bytes without credential access', async t => {
  const f = await fixture(t), submission = await f.submit();
  const rowid = f.db.prepare('SELECT rowid FROM submissions WHERE id=?').get(submission.id).rowid;
  const path = '/assets?' + new URLSearchParams({ table: 'submissions', column: 'audio', row: String(rowid) });
  const guest = f.client('admin');
  assert.equal((await guest(path)).status, 401);
  assert.equal((await guest(path, undefined, { cookie: f.teacher.request.cookie() })).status, 401);
  const audio = await f.admin(path);
  assert.equal(audio.status, 200); assert.match(audio.headers.get('content-type'), /^audio\/wav/);
  assert.deepEqual(audio.data, wavBytes());
  const photo = await f.admin('/assets?' + new URLSearchParams({ table: 'submissions', column: 'image', row: String(rowid) }));
  assert.equal(photo.status, 200); assert.deepEqual(photo.data, pngBytes);
  for (const [table, column] of [['users', 'password'], ['sessions', 'token'], ['image_mcp_tokens', 'digest'], ['submissions', 'name']]) {
    const response = await f.admin('/assets?' + new URLSearchParams({ table, column, row: '1' }));
    assert.ok([400, 403, 404].includes(response.status));
  }
});

test('admin image rejection clears references and preserves the daily allowance', async t => {
  const f = await fixture(t), jobId = await f.imageJob(f.otherStudent, f.otherRoom);
  assert.equal((await f.teacher.request(`/image-jobs/${jobId}/reject`, {})).status, 403);
  assertSuccess(await f.admin(`/image-jobs/${jobId}/reject`, {}));
  const job = f.db.prepare('SELECT status,photo,reference FROM image_jobs WHERE id=?').get(jobId);
  assert.equal(job.status, 'rejected'); assert.equal(job.photo, null); assert.equal(job.reference, null);
  assert.equal((await f.otherStudent.request('/image-status')).data.remaining, 0);
});

test('deleting a classroom or teacher removes dependent data without affecting another classroom', async t => {
  const f = await fixture(t), submission = await f.submit();
  await f.rhythm(submission); await f.imageJob();
  const otherSubmission = await f.submit(f.otherStudent, f.otherRoom);
  assertSuccess(await f.admin(`/classrooms/${f.room.id}/delete`, { confirmation: f.room.id }));
  assert.equal(f.db.prepare('SELECT 1 FROM classrooms WHERE id=?').get(f.room.id), undefined);
  for (const table of ['members', 'submissions', 'classroom_places', 'classroom_arrangements', 'classroom_rhythm_tracks', 'student_rhythm_requests', 'student_rhythm_receipts', 'image_jobs']) {
    assert.equal(f.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE class_id=?`).get(f.room.id).n, 0, table);
  }
  assert.ok(f.db.prepare('SELECT 1 FROM submissions WHERE id=?').get(otherSubmission.id));
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
  assertSuccess(await f.admin(`/users/${f.otherTeacher.user.id}/delete`, { confirmation: f.otherTeacher.user.id }));
  assert.equal(f.db.prepare('SELECT 1 FROM classrooms WHERE id=?').get(f.otherRoom.id), undefined);
  assert.ok(f.db.prepare('SELECT 1 FROM users WHERE id=?').get(f.otherStudent.user.id));
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('deleting a student removes memberships, rhythm, images, bindings and sessions atomically', async t => {
  const f = await fixture(t), submission = await f.submit();
  await f.rhythm(submission);
  const jobId = await f.imageJob();
  assert.equal((await f.teacher.request(`/image-jobs/${jobId}/conversation`, { projectUrl: IMAGE_PROJECT.url, conversationUrl: 'https://chatgpt.com/c/' + randomUUID() })).status, 200);
  assertSuccess(await f.admin(`/users/${f.student.user.id}/delete`, { confirmation: f.student.user.id }));
  assert.equal((await f.student.request('/me')).status, 401);
  assert.equal(f.db.prepare('SELECT 1 FROM users WHERE id=?').get(f.student.user.id), undefined);
  for (const table of ['members', 'submissions', 'classroom_rhythm_tracks', 'student_rhythm_requests', 'student_rhythm_receipts', 'student_profiles', 'image_jobs', 'image_conversations']) {
    assert.equal(f.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE student_id=?`).get(f.student.user.id).n, 0, table);
  }
  assert.ok(f.db.prepare('SELECT 1 FROM classrooms WHERE id=?').get(f.room.id));
  assert.ok(f.db.prepare('SELECT 1 FROM users WHERE id=?').get(f.otherStudent.user.id));
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('destructive admin operations cannot interrupt a live classroom performance', async t => {
  const f = await fixture(t), submission = await f.submit();
  const performance = { clientId: 'synthetic-teacher-window', playing: true, activeStudentIds: [f.student.user.id] };
  assert.equal((await f.teacher.request(`/classrooms/${f.room.id}/performance`, performance)).status, 200);
  for (const [path, id] of [[`/submissions/${submission.id}/delete`, submission.id], [`/classrooms/${f.room.id}/delete`, f.room.id], [`/users/${f.student.user.id}/delete`, f.student.user.id], [`/users/${f.teacher.user.id}/delete`, f.teacher.user.id]]) {
    assert.equal((await f.admin(path, { confirmation: id })).status, 409, path);
  }
  assert.ok(f.db.prepare('SELECT audio FROM submissions WHERE id=?').get(submission.id).audio);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal((await f.teacher.request(`/classrooms/${f.room.id}/performance`, { ...performance, playing: false, activeStudentIds: [] })).status, 200);
  assertSuccess(await f.admin(`/submissions/${submission.id}/delete`, { confirmation: submission.id }));
  assert.equal(f.db.prepare('SELECT 1 FROM submissions WHERE id=?').get(submission.id), undefined);
});
