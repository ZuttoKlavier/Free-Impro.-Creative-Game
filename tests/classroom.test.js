import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { encodeWav } from '../src/audio.js';
import { randomUUID } from 'node:crypto';

test('account, classroom capacity, private submissions, idempotency and replacement approval', async () => {
  const { server, db } = createApp({ dbPath: ':memory:' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    let cookie = '';
    return async (path, body, origin = base) => {
      const response = await fetch(base + '/api' + path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}), Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, data: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.arrayBuffer() };
    };
  }
  try {
    const teacher = client(), student = client(), second = client(), stranger = client();
    assert.equal((await student('/me')).status, 401);
    assert.equal((await teacher('/register', { username: 'teacher', password: 'password123', name: '老师', role: 'teacher' })).status, 200);
    assert.equal((await student('/register', { username: 'student', password: 'password123', name: '学生', role: 'student' })).status, 200);
    assert.equal((await second('/register', { username: 'second', password: 'password123', name: '学生二', role: 'student' })).status, 200);
    assert.equal((await stranger('/register', { username: 'stranger', password: 'password123', name: '别的教师', role: 'teacher' })).status, 200);
    assert.notEqual(db.prepare('SELECT password FROM users LIMIT 1').get().password, 'password123');
    assert.equal((await student('/classrooms', { name: '不允许', capacity: 15, background: '教室' })).status, 403);
    const created = await teacher('/classrooms', { name: '声音课堂', capacity: 1, background: '厨房' });
    assert.equal(created.status, 201); const { id, code } = created.data.classroom;
    assert.equal((await stranger('/classrooms/' + id)).status, 403);
    assert.equal((await student('/join', { code })).data.classroom.members[0].admitted, 1);
    assert.equal((await second('/join', { code })).data.classroom.members[0].admitted, 0);
    const audio = Buffer.from(await encodeWav(new Float32Array(2400), 24000).arrayBuffer()).toString('base64');
    const original = { name: '杯子', requestId: randomUUID(), audio };
    assert.equal((await second(`/classrooms/${id}/submit`, original)).status, 403);
    let submitted = await student(`/classrooms/${id}/submit`, original);
    assert.equal(submitted.status, 201);
    const firstId = submitted.data.classroom.submissions[0].id;
    assert.equal((await second('/submissions/' + firstId + '/audio')).status, 403);
    assert.equal((await student(`/classrooms/${id}/submit`, original)).data.classroom.submissions.length, 1);
    await student(`/classrooms/${id}/submit`, { ...original, name: '木头', requestId: randomUUID() });
    submitted = await student(`/classrooms/${id}/submit`, { ...original, name: '金属', requestId: randomUUID() });
    assert.equal(submitted.data.classroom.submissions.length, 2);
    assert.equal(submitted.data.classroom.submissions.find(s => s.status === 'current').name, '杯子');
    const pending = submitted.data.classroom.submissions.find(s => s.status === 'pending');
    assert.equal(pending.name, '金属');
    assert.equal((await student('/submissions/' + pending.id + '/accept', {})).status, 403);
    assert.equal((await teacher('/submissions/' + pending.id + '/accept', {})).status, 200);
    assert.equal((await student('/classrooms/' + id)).data.classroom.submissions[0].name, '金属');
    assert.equal((await teacher('/submissions/' + pending.id + '/reject', {})).status, 409);
    assert.equal((await teacher(`/classrooms/${id}/capacity`, { capacity: 51 })).status, 400);
    assert.equal((await teacher(`/classrooms/${id}/capacity`, { capacity: 2 })).status, 200);
    assert.equal((await second('/classrooms/' + id)).data.classroom.members[0].admitted, 1);
    const longAudio = Buffer.from(await encodeWav(new Float32Array(48001), 24000).arrayBuffer()).toString('base64');
    assert.equal((await student(`/classrooms/${id}/submit`, { ...original, requestId: randomUUID(), audio: longAudio })).status, 400);
    assert.equal((await student('/logout', {}, 'https://unrelated.example')).status, 403);
    await student('/logout', {}); assert.equal((await student('/me')).status, 401);
    assert.equal((await student('/login', { username: 'student', password: 'wrong_password' })).status, 401);
    assert.equal((await student('/login', { username: 'student', password: 'password123' })).status, 200);
    assert.equal((await student('/classrooms')).data.classrooms.length, 1);
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
});
