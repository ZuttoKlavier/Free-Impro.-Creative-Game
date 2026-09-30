import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';

test('teacher and student endpoints have separate sessions and enforce their account role', async t => {
  const { server, db } = createApp({ dbPath: ':memory:' }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (role, path, data, cookie, agent = 'test') => fetch(`${origin}/api/${role}${path}`, { method: data ? 'POST' : 'GET', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie || '', 'User-Agent': agent }, body: data ? JSON.stringify(data) : undefined });
  const cookies = {};
  for (const role of ['teacher', 'student']) {
    const result = await request(role, '/register', { role, username: role, name: role, password: 'password123' });
    assert.equal(result.status, 200); const header = result.headers.get('set-cookie');
    assert.match(header, new RegExp(`fi_session_${role}=`)); assert.ok(header.includes(`Path=/api/${role}`));
    cookies[role] = header.split(';')[0];
  }
  const both = cookies.teacher + '; ' + cookies.student;
  for (const role of ['teacher', 'student']) assert.equal((await (await request(role, '/me', null, both)).json()).user.role, role);
  assert.equal((await request('teacher', '/login', { username: 'student', password: 'password123' })).status, 403);
  assert.equal((await request('student', '/register', { username: 'forged', role: 'teacher', name: '伪造身份', password: 'password123' })).status, 403);
  assert.equal((await request('teacher', '/me', null, cookies.student.replace('fi_session_student', 'fi_session_teacher'))).status, 403);
  assert.equal((await request('teacher', '/me', null, both, 'FreeImproStudent/1')).status, 403);
  assert.equal((await request('student', '/me', null, both, 'FreeImproTeacher/1')).status, 403);
  assert.equal((await request('teacher', '/logout', {}, both)).status, 200);
  assert.equal((await request('teacher', '/me', null, both)).status, 401);
  assert.equal((await request('student', '/me', null, both)).status, 200);
});
