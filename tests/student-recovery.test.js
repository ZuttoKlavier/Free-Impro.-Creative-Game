import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { createStudentRecovery } from '../server/student-recovery.js';
import { encodeWav } from '../src/audio.js';
import { PNG } from 'pngjs';

const origin = 'https://class.empfreeimpro.xyz';
const host = new URL(origin).host;
async function fixture(t) {
  const app = createApp({ dbPath: ':memory:', secureCookies: true });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.db.close(); });
  const send = (path, data, headers = {}) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: app.server.address().port, path, method: data === undefined ? 'GET' : 'POST', headers: { Host: host, Origin: origin, 'Content-Type': 'application/json', ...headers } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const bytes = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, bytes, data: res.headers['content-type']?.includes('application/json') ? JSON.parse(bytes.toString()) : null });
      });
    });
    req.on('error', reject); req.end(data === undefined ? undefined : JSON.stringify(data));
  });
  const client = (role, serviceOrigin = origin) => {
    let cookie = '';
    const api = async (path, data, headers = {}) => {
      const result = await send('/api/' + role + path, data, { Host: new URL(serviceOrigin).host, Origin: serviceOrigin, Cookie: cookie, ...headers });
      if (result.headers['set-cookie']) cookie = result.headers['set-cookie'][0].split(';')[0];
      return result;
    };
    api.cookie = () => cookie;
    return api;
  };
  const teacher = client('teacher');
  assert.equal((await teacher('/register', { username: 'test_teacher', password: 'password123', name: '教师', role: 'teacher' })).status, 200);
  const createRoom = async (owner = teacher) => {
    const result = await owner('/classrooms', { name: '迁移测试课堂', capacity: 15, background: '教室' });
    assert.equal(result.status, 201); return result.data.classroom;
  };
  const room = await createRoom();
  const enter = async (name = '同名学生', code = room.code, serviceOrigin = origin) => {
    const api = client('student', serviceOrigin), entered = await api('/enter-classroom', { name, code });
    assert.equal(entered.status, 200); return { api, user: entered.data.user };
  };
  const issue = async (studentId, classId = room.id, api = teacher) => {
    const result = await api('/student-recovery-codes', { classId, studentId });
    return { ...result, recovery: result.data.recovery };
  };
  return { ...app, send, client, teacher, room, createRoom, enter, issue };
}

test('explicit teacher recovery preserves a same-name student UUID, avatar and submission across origins', async t => {
  const f = await fixture(t), first = await f.enter('同名学生', f.room.code, 'https://192.0.2.10:8443'), second = await f.enter();
  assert.notEqual(first.user.id, second.user.id);
  const bytes = PNG.sync.write(new PNG({ width: 1, height: 1 }));
  assert.equal((await first.api('/image-profile/register', {})).status, 200);
  f.db.prepare('UPDATE student_profiles SET avatar=? WHERE student_id=?').run(bytes, first.user.id);
  const audio = Buffer.from(await encodeWav(new Float32Array(2400), 24000).arrayBuffer()).toString('base64');
  assert.equal((await first.api('/classrooms/' + f.room.id + '/submit', { name: '旧作品', requestId: randomUUID(), audio })).status, 201);
  const beforeUsers = f.db.prepare('SELECT count(*) AS n FROM users').get().n;
  const beforeSessions = f.db.prepare('SELECT count(*) AS n FROM sessions').get().n;
  const issued = await f.issue(first.user.id);
  assert.equal(issued.status, 201);
  assert.match(issued.recovery.code, /^[a-f0-9]{64}$/);
  assert.ok(issued.recovery.expiresAt > Date.now());
  assert.ok(issued.recovery.expiresAt <= Date.now() + 900000);
  const stored = f.db.prepare('SELECT * FROM student_recovery_codes').get();
  assert.notEqual(stored.digest, issued.recovery.code);
  assert.equal(stored.digest, createHash('sha256').update(issued.recovery.code).digest('hex'));
  assert.equal(JSON.stringify(stored).includes(issued.recovery.code), false);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n, beforeSessions);
  const newDevice = f.client('student');
  assert.equal(newDevice.cookie(), '');
  const recovered = await newDevice('/recover-identity', { classId: f.room.id, code: issued.recovery.code });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.data.user.id, first.user.id);
  assert.equal(recovered.data.user.username, first.user.username);
  assert.equal(recovered.data.classId, f.room.id);
  assert.match(recovered.headers['set-cookie'][0], /^fi_session_student=.*; HttpOnly; SameSite=Strict; Path=\/api\/student;.*; Secure$/);
  assert.equal((await newDevice('/me')).data.user.id, first.user.id);
  assert.deepEqual((await newDevice('/image-profile/avatar')).bytes, bytes);
  assert.equal((await newDevice('/image-status')).data.registered, true);
  assert.equal((await newDevice('/classrooms')).data.classrooms[0].submissions[0].name, '旧作品');
  assert.equal((await first.api('/me')).data.user.id, first.user.id);
  assert.equal((await second.api('/me')).data.user.id, second.user.id);
  assert.equal((await f.teacher('/me')).data.user.role, 'teacher');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, beforeUsers);
});

test('recovery issuance requires exact admitted student ownership and rejects missing or mixed teacher associations', async t => {
  const f = await fixture(t), student = await f.enter();
  const other = f.client('teacher');
  assert.equal((await other('/register', { username: 'other_teacher', password: 'password123', name: '其他教师', role: 'teacher' })).status, 200);
  const otherUser = (await other('/me')).data.user, otherRoom = await f.createRoom(other);
  assert.equal((await f.client('teacher')('/student-recovery-codes', { classId: f.room.id, studentId: student.user.id })).status, 401);
  assert.equal((await student.api('/student-recovery-codes', { classId: f.room.id, studentId: student.user.id })).status, 403);
  assert.equal((await f.issue(student.user.id, f.room.id, other)).status, 403);
  assert.equal((await f.issue(student.user.id, otherRoom.id)).status, 403);
  assert.equal((await f.issue(otherUser.id)).status, 403);
  assert.equal((await f.issue(randomUUID())).status, 403);
  assert.equal((await f.teacher('/student-recovery-codes', { classId: f.room.id, name: student.user.name })).status, 400);
  f.db.prepare('UPDATE members SET admitted=0 WHERE student_id=?').run(student.user.id);
  assert.equal((await f.issue(student.user.id)).status, 403);
  f.db.prepare('UPDATE members SET admitted=1 WHERE student_id=?').run(student.user.id);
  assert.equal((await student.api('/join', { code: otherRoom.code })).status, 200);
  assert.equal((await f.issue(student.user.id)).status, 403);
  f.db.prepare('DELETE FROM members WHERE class_id=? AND student_id=?').run(otherRoom.id, student.user.id);
  f.db.prepare('INSERT INTO image_conversations VALUES(?,?,?,?)').run(student.user.id, otherUser.id, 'https://chatgpt.com/c/' + randomUUID(), Date.now());
  assert.equal((await f.issue(student.user.id)).status, 403);
  f.db.prepare('DELETE FROM image_conversations').run();
  f.db.prepare("INSERT INTO image_jobs(id,student_id,class_id,kind,work_name,fingerprint,day,status,created_at,updated_at) VALUES(?,?,?,'identity','测试','test','2026-10-13','rejected',?,?)").run(randomUUID(), student.user.id, otherRoom.id, Date.now(), Date.now());
  assert.equal((await f.issue(student.user.id)).status, 403);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM student_recovery_codes').get().n, 0);
});

test('wrong classroom, expiry, invalid payload and concurrent replays never create accounts or additional sessions', async t => {
  const f = await fixture(t), student = await f.enter(), issued = await f.issue(student.user.id), otherRoom = await f.createRoom();
  const payload = { classId: f.room.id, code: issued.recovery.code };
  const beforeUsers = f.db.prepare('SELECT count(*) AS n FROM users').get().n;
  const beforeSessions = f.db.prepare('SELECT count(*) AS n FROM sessions').get().n;
  assert.equal((await f.client('student')('/recover-identity', { ...payload, classId: otherRoom.id })).status, 401);
  assert.equal((await f.client('student')('/recover-identity', { ...payload, code: '0'.repeat(64) })).status, 401);
  assert.equal((await f.client('student')('/recover-identity', { classId: f.room.id, code: '123456' })).status, 401);
  assert.equal((await f.client('student')('/recover-identity', { ...payload, studentId: student.user.id })).status, 400);
  const results = await Promise.all(Array.from({ length: 8 }, () => f.client('student')('/recover-identity', payload)));
  assert.equal(results.filter(result => result.status === 200).length, 1);
  assert.equal(results.filter(result => result.status === 401).length, 7);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, beforeUsers);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n, beforeSessions + 1);
  const next = await f.issue(student.user.id);
  f.db.prepare('UPDATE student_recovery_codes SET expires=? WHERE consumed_at IS NULL').run(Date.now() - 1);
  const expired = await f.client('student')('/recover-identity', { classId: f.room.id, code: next.recovery.code });
  assert.equal(expired.status, 401); assert.equal(expired.headers['set-cookie'], undefined);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, beforeUsers);
});

test('replacement codes, teacher logout and changed ownership invalidate previously issued capabilities', async t => {
  const f = await fixture(t), student = await f.enter();
  const first = await f.issue(student.user.id), replacement = await f.issue(student.user.id);
  assert.notEqual(first.recovery.code, replacement.recovery.code);
  assert.equal((await f.client('student')('/recover-identity', { classId: f.room.id, code: first.recovery.code })).status, 401);
  f.db.prepare('UPDATE members SET admitted=0 WHERE student_id=?').run(student.user.id);
  assert.equal((await f.client('student')('/recover-identity', { classId: f.room.id, code: replacement.recovery.code })).status, 401);
  f.db.prepare('UPDATE members SET admitted=1 WHERE student_id=?').run(student.user.id);
  const current = await f.issue(student.user.id);
  assert.equal((await f.teacher('/logout', {})).status, 200);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM student_recovery_codes').get().n, 0);
  assert.equal((await f.client('student')('/recover-identity', { classId: f.room.id, code: current.recovery.code })).status, 401);
  assert.equal((await student.api('/me')).data.user.id, student.user.id);
});

test('recovery requires exact HTTPS source and explicit client role without consuming a valid code', async t => {
  const f = await fixture(t), student = await f.enter(), issued = await f.issue(student.user.id), payload = { classId: f.room.id, code: issued.recovery.code };
  for (const wrong of ['https://other.example', 'http://' + host, origin + '/teacher.html', 'null']) assert.equal((await f.client('student')('/recover-identity', payload, { Origin: wrong })).status, 403);
  assert.equal((await f.client('teacher')('/recover-identity', payload)).status, 403);
  assert.equal((await f.send('/api/recover-identity', payload, { 'User-Agent': 'FreeImproStudent/1' })).status, 403);
  assert.equal((await f.client('student')('/recover-identity', payload, { 'User-Agent': 'FreeImproTeacher/1' })).status, 403);
  const teacherCookie = f.teacher.cookie().replace('fi_session_teacher=', 'fi_session_student=');
  assert.equal((await f.send('/api/student/recover-identity', payload, { Cookie: teacherCookie })).status, 403);
  assert.equal((await f.client('student')('/recover-identity', payload)).status, 200);
  assert.equal((await f.teacher('/me')).data.user.role, 'teacher');
});

test('issue and redemption limits survive module recreation and unsuccessful requests', async t => {
  const f = await fixture(t), student = await f.enter();
  for (let index = 0; index < 3; index++) assert.equal((await f.issue(student.user.id)).status, 201);
  assert.equal((await f.issue(student.user.id)).status, 429);
  const issuedSession = createHash('sha256').update(f.teacher.cookie().split('=')[1]).digest('hex');
  const teacherUser = (await f.teacher('/me')).data.user;
  const at = Date.now(), limits = createStudentRecovery(f.db, { now: () => at });
  assert.throws(() => limits.issue(teacherUser, { classId: f.room.id, studentId: student.user.id }, issuedSession), error => error.status === 429);
  for (let index = 0; index < 120; index++) assert.throws(() => limits.consume({ classId: f.room.id, code: '0'.repeat(64) }, 'test-peer', () => assert.fail('invalid code must not create a session')), error => error.status === 401);
  const recreated = createStudentRecovery(f.db, { now: () => at });
  assert.throws(() => recreated.consume({ classId: f.room.id, code: '0'.repeat(64) }, 'test-peer', () => assert.fail()), error => error.status === 429);
  const later = createStudentRecovery(f.db, { now: () => at + 900001 });
  assert.throws(() => later.consume({ classId: f.room.id, code: '0'.repeat(64) }, 'test-peer', () => assert.fail()), error => error.status === 401);
  const issuedLater = later.issue(teacherUser, { classId: f.room.id, studentId: student.user.id }, issuedSession);
  assert.match(issuedLater.code, /^[a-f0-9]{64}$/);
  // Malformed requests still spend the authenticated teacher's issue budget.
  for (let index = 0; index < 59; index++) assert.throws(() => later.issue(teacherUser, {}, issuedSession), error => error.status === 400);
  assert.throws(() => later.issue(teacherUser, {}, issuedSession), error => error.status === 429);
  const teacherLimitAfterRestart = createStudentRecovery(f.db, { now: () => at + 900001 });
  assert.throws(() => teacherLimitAfterRestart.issue(teacherUser, {}, issuedSession), error => error.status === 429);
});

test('a failed session write rolls code consumption back and invalid role changes cannot be recovered', async t => {
  const f = await fixture(t), student = await f.enter(), issued = await f.issue(student.user.id), payload = { classId: f.room.id, code: issued.recovery.code };
  const recovery = createStudentRecovery(f.db);
  assert.throws(() => recovery.consume(payload, 'rollback-peer', () => { throw new Error('test insert failure'); }), /test insert failure/);
  assert.equal(f.db.prepare('SELECT consumed_at FROM student_recovery_codes').get().consumed_at, null);
  f.db.prepare("UPDATE users SET role='teacher' WHERE id=?").run(student.user.id);
  assert.equal((await f.client('student')('/recover-identity', payload)).status, 401);
  f.db.prepare("UPDATE users SET role='student' WHERE id=?").run(student.user.id);
  assert.equal((await f.client('student')('/recover-identity', payload)).status, 200);
});
