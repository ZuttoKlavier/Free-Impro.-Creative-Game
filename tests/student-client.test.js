import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';

test('student application cannot create, log into, or reuse a teacher account', async t => {
  const { server, db } = createApp({ dbPath: ':memory:' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, data, native = true, cookie) => fetch(origin + '/api' + path, { method: data ? 'POST' : 'GET', headers: { Origin: origin, 'Content-Type': 'application/json', 'User-Agent': native ? 'FreeImproStudent/1' : 'test browser', ...(cookie ? { Cookie: cookie } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const teacher = { username: 'native_teacher', name: '老师', role: 'teacher', password: 'password123' };
  assert.equal((await request('/register', teacher)).status, 403);
  const registered = await request('/register', teacher, false); assert.equal(registered.status, 200);
  const teacherCookie = registered.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/login', teacher)).status, 403);
  assert.equal((await request('/me', null, true, teacherCookie)).status, 403);
  const student = await request('/register', { ...teacher, username: 'native_student', role: 'student' }); assert.equal(student.status, 200);
  const cookie = student.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/me', null, true, cookie)).status, 200);
  assert.equal((await request('/classrooms', { name: '不允许创建', capacity: 15, background: '教室' }, true, cookie)).status, 403);
});
