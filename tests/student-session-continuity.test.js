import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApp } from '../server/app.js';

async function fixture(t) {
  const app = createApp({ dbPath: ':memory:', studentAuthOptions: { env: {} } });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.db.close(); });
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  async function request(role, path, data, cookie = '') {
    const response = await fetch(origin + '/api/' + role + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return { status: response.status, data: await response.json(), cookies: response.headers.getSetCookie() };
  }
  const teacher = await request('teacher', '/register', { username: 'continuity_teacher', name: '教师', role: 'teacher', password: 'password123' });
  assert.equal(teacher.status, 200);
  const created = await request('teacher', '/classrooms', { name: '会话连续性测试', capacity: 15, background: '教室' }, teacher.cookies[0].split(';')[0]);
  assert.equal(created.status, 201);
  return { ...app, request, room: created.data.classroom };
}

test('replayed or concurrent classroom entry with one valid guest session retains one identity and slot', async t => {
  const { db, request, room } = await fixture(t);
  const payload = { name: '同名学生', code: room.code };
  const entered = await request('student', '/enter-classroom', payload);
  assert.equal(entered.status, 200);
  const originalCookie = entered.cookies[0].split(';')[0];
  const originalId = entered.data.user.id;

  // These requests were prepared with the same cookie. A response from one
  // request must not revoke the identity still carried by the others.
  const repeated = await Promise.all(Array.from({ length: 4 }, () => request('student', '/enter-classroom', payload, originalCookie)));
  for (const result of repeated) {
    assert.equal(result.status, 200);
    assert.equal(result.data.user.id, originalId);
  }
  assert.equal((await request('student', '/me', undefined, originalCookie)).data.user.id, originalId);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM members WHERE class_id=?').get(room.id).n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(originalId).n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE role=\'student\'').get().n, 1);
});

test('same-name guests on different devices remain separate, and an expired session cannot reclaim an identity', async t => {
  const { db, request, room } = await fixture(t);
  const payload = { name: '同名学生', code: room.code };
  const first = await request('student', '/enter-classroom', payload);
  const second = await request('student', '/enter-classroom', payload);
  assert.notEqual(first.data.user.id, second.data.user.id);
  const expiredCookie = first.cookies[0].split(';')[0];
  const digest = createHash('sha256').update(expiredCookie.split('=')[1]).digest('hex');
  db.prepare('UPDATE sessions SET expires=? WHERE token=?').run(Date.now() - 1, digest);
  assert.equal((await request('student', '/me', undefined, expiredCookie)).status, 401);
  const afterExpiry = await request('student', '/enter-classroom', payload, expiredCookie);
  assert.equal(afterExpiry.status, 200);
  assert.notEqual(afterExpiry.data.user.id, first.data.user.id);
  assert.notEqual(afterExpiry.data.user.id, second.data.user.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM members WHERE class_id=?').get(room.id).n, 3);
});

test('an explicit guest identity switch and logout still invalidate the previous session', async t => {
  const { request, room } = await fixture(t);
  const first = await request('student', '/enter-classroom', { name: '原学生', code: room.code });
  const firstCookie = first.cookies[0].split(';')[0];
  const switched = await request('student', '/enter-classroom', { name: '另一学生', code: room.code }, firstCookie);
  assert.equal(switched.status, 200);
  assert.notEqual(switched.data.user.id, first.data.user.id);
  assert.equal((await request('student', '/me', undefined, firstCookie)).status, 401);
  const switchedCookie = switched.cookies[0].split(';')[0];
  assert.equal((await request('student', '/logout', {}, switchedCookie)).status, 200);
  assert.equal((await request('student', '/me', undefined, switchedCookie)).status, 401);
});
