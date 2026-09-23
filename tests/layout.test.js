import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, scryptSync } from 'node:crypto';
import { createApp } from '../server/app.js';
import { encodeWav } from '../src/audio.js';

async function fixture(t, dbPath = ':memory:') {
  let app, base;
  const start = async () => {
    app = createApp({ dbPath });
    await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${app.server.address().port}`;
  };
  const close = async () => {
    if (!app) return;
    await new Promise(resolve => app.server.close(resolve));
    app.db.close(); app = null;
  };
  t.after(close);
  await start();
  const client = () => {
    let cookie = '';
    return async (path, body) => {
      const response = await fetch(base + '/api' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, data: await response.json() };
    };
  };
  return {
    client,
    restart: async () => { await close(); await start(); },
    register: async (username, role = 'student') => {
      const request = client();
      const result = await request('/register', { username, role, name: username, password: 'password123' });
      assert.equal(result.status, 200);
      return { request, user: result.data.user };
    },
  };
}

const room = async (teacher, capacity, background = '教室') => {
  const result = await teacher('/classrooms', { name: `${capacity} 人声音课堂`, capacity, background });
  assert.equal(result.status, 201);
  return result.data.classroom;
};

function assertLayout(layout, capacity) {
  assert.equal(layout.length, capacity);
  assert.deepEqual(layout.map(point => point.slot).sort((a, b) => a - b), Array.from({ length: capacity }, (_, i) => i + 1));
  for (const point of layout) {
    assert.ok(Number.isFinite(point.x) && point.x >= 0.05 && point.x <= 0.95);
    assert.ok(Number.isFinite(point.y) && point.y >= 0.05 && point.y <= 0.95);
  }
}

test('classrooms reserve 1, 15 and 50 numbered places and student snapshots keep the teacher layout private', async t => {
  const app = await fixture(t);
  const { request: teacher } = await app.register('teacher', 'teacher');
  const { request: student } = await app.register('student');
  for (const [capacity, background] of [[1, '教室'], [15, '厨房'], [50, '操场']]) {
    const classroom = await room(teacher, capacity, background);
    assertLayout(classroom.layout, capacity);
    assert.equal(classroom.background, background);
    assert.equal(classroom.memberCount, 0);
    const fetched = await teacher(`/classrooms/${classroom.id}`);
    assert.deepEqual(fetched.data.classroom.layout, classroom.layout);
    const joined = await student('/join', { code: classroom.code });
    assert.equal(joined.status, 200);
    assert.equal(Object.hasOwn(joined.data.classroom, 'layout'), false);
    assert.equal(joined.data.classroom.members[0].slot, 1);
  }
  const listed = await student('/classrooms');
  assert.ok(listed.data.classrooms.every(item => !Object.hasOwn(item, 'layout')));
});

test('same-millisecond joins have stable slots, replacements retain them, and expansion preserves moved places and waiting order', async t => {
  const app = await fixture(t);
  const { request: teacher } = await app.register('teacher', 'teacher');
  const students = [];
  for (const username of ['first', 'second', 'third', 'fourth']) students.push(await app.register(username));
  const classroom = await room(teacher, 2);
  const frozenTime = Date.now();
  t.mock.method(Date, 'now', () => frozenTime);
  for (const student of students) assert.equal((await student.request('/join', { code: classroom.code })).status, 200);
  let snapshot = (await teacher(`/classrooms/${classroom.id}`)).data.classroom;
  const memberFor = (student) => snapshot.members.find(member => member.student_id === student.user.id);
  assert.deepEqual(students.map(student => memberFor(student).slot), [1, 2, null, null]);
  assert.deepEqual(students.map(student => memberFor(student).admitted), [1, 1, 0, 0]);
  assert.equal((await students[0].request('/join', { code: classroom.code })).data.classroom.members[0].slot, 1);

  const moved = await teacher(`/classrooms/${classroom.id}/layout`, { slot: 1, x: 0.23, y: 0.81 });
  assert.equal(moved.status, 200);
  const existingPlaces = moved.data.classroom.layout;
  assert.deepEqual(existingPlaces.find(point => point.slot === 1), { slot: 1, x: 0.23, y: 0.81 });
  assert.deepEqual((await teacher(`/classrooms/${classroom.id}`)).data.classroom.layout, existingPlaces);

  const audio = Buffer.from(await encodeWav(new Float32Array(2400), 24000).arrayBuffer()).toString('base64');
  for (const name of ['杯子', '木头', '金属']) {
    const submitted = await students[0].request(`/classrooms/${classroom.id}/submit`, { name, audio, requestId: randomUUID() });
    assert.equal(submitted.status, 201);
    assert.equal(submitted.data.classroom.members[0].slot, 1);
  }
  snapshot = (await teacher(`/classrooms/${classroom.id}`)).data.classroom;
  const pending = snapshot.submissions.find(item => item.status === 'pending');
  assert.equal(pending.name, '金属');
  assert.equal((await teacher(`/submissions/${pending.id}/accept`, {})).status, 200);
  assert.equal((await students[0].request(`/classrooms/${classroom.id}`)).data.classroom.members[0].slot, 1);

  const expanded = await teacher(`/classrooms/${classroom.id}/capacity`, { capacity: 4 });
  assert.equal(expanded.status, 200);
  snapshot = expanded.data.classroom;
  assertLayout(snapshot.layout, 4);
  assert.deepEqual(snapshot.layout.filter(point => point.slot <= 2), existingPlaces);
  assert.deepEqual(students.map(student => memberFor(student).slot), [1, 2, 3, 4]);
  assert.ok(students.every(student => memberFor(student).admitted === 1));
  const refreshed = (await teacher(`/classrooms/${classroom.id}`)).data.classroom;
  assert.deepEqual(refreshed.layout, snapshot.layout);
  assert.deepEqual(refreshed.members, snapshot.members);
});

test('only the owning teacher can move existing places and coordinate boundaries are validated without changing saved data', async t => {
  const app = await fixture(t);
  const { request: teacher } = await app.register('teacher', 'teacher');
  const { request: stranger } = await app.register('stranger', 'teacher');
  const { request: student } = await app.register('student');
  const classroom = await room(teacher, 1);
  await student('/join', { code: classroom.code });
  const path = `/classrooms/${classroom.id}/layout`;
  const valid = { slot: 1, x: 0.05, y: 0.95 };
  assert.equal((await app.client()(path, valid)).status, 401);
  assert.equal((await stranger(path, valid)).status, 403);
  assert.equal((await student(path, valid)).status, 403);
  const saved = await teacher(path, valid);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data.classroom.layout, [valid]);
  for (const invalid of [
    { ...valid, slot: 0 }, { ...valid, slot: 2 }, { ...valid, slot: 1.5 }, { ...valid, slot: '1' },
    { ...valid, x: 0.049 }, { ...valid, x: 0.951 }, { ...valid, y: 0.049 }, { ...valid, y: 0.951 },
    { ...valid, x: '0.5' }, { ...valid, y: null }, { ...valid, x: NaN }, { ...valid, y: Infinity },
    { slot: 1, x: 0.5 }, {},
  ]) assert.equal((await teacher(path, invalid)).status, 400, JSON.stringify(invalid));
  assert.deepEqual((await teacher(`/classrooms/${classroom.id}`)).data.classroom.layout, [valid]);
});

test('legacy classrooms receive stable places at startup and saved teacher positions survive a SQLite restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'music-layout-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'classroom.sqlite');
  const legacy = new DatabaseSync(dbPath);
  // The pre-layout schema deliberately has no slot column or layout storage.
  legacy.exec(`
    CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL);
    CREATE TABLE classrooms(id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, teacher_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, capacity INTEGER NOT NULL, background TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE members(class_id TEXT NOT NULL REFERENCES classrooms(id), student_id TEXT NOT NULL REFERENCES users(id), admitted INTEGER NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY(class_id,student_id));
  `);
  const salt = 'legacy-layout-test';
  const password = scryptSync('password123', salt, 64).toString('hex');
  for (const [id, role] of [['teacher', 'teacher'], ['first', 'student'], ['second', 'student'], ['third', 'student']]) {
    legacy.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id, id, id, role, salt, password);
  }
  legacy.prepare('INSERT INTO classrooms VALUES(?,?,?,?,?,?,?)').run('legacy-room', '123456', 'teacher', '历史课堂', 2, '厨房', 1);
  for (const [id, admitted] of [['first', 1], ['second', 1], ['third', 0]]) legacy.prepare('INSERT INTO members VALUES(?,?,?,?)').run('legacy-room', id, admitted, 10);
  legacy.close();

  const app = await fixture(t, dbPath);
  const teacher = app.client();
  assert.equal((await teacher('/login', { username: 'teacher', password: 'password123' })).status, 200);
  const migrated = (await teacher('/classrooms/legacy-room')).data.classroom;
  assertLayout(migrated.layout, 2);
  const admittedSlots = migrated.members.filter(member => member.admitted).map(member => member.slot).sort((a, b) => a - b);
  assert.deepEqual(admittedSlots, [1, 2]);
  assert.equal(migrated.members.find(member => !member.admitted).slot, null);
  const saved = await teacher('/classrooms/legacy-room/layout', { slot: 2, x: 0.74, y: 0.39 });
  assert.equal(saved.status, 200);
  await app.restart();
  const restored = await teacher('/classrooms/legacy-room');
  assert.equal(restored.status, 200);
  assert.deepEqual(restored.data.classroom.layout, saved.data.classroom.layout);
  assert.deepEqual(restored.data.classroom.members, migrated.members);
});
