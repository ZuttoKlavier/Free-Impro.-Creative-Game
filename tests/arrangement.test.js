import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
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
  const audio = Buffer.from(await encodeWav(new Float32Array(2400), 24000).arrayBuffer()).toString('base64');
  return {
    client, database: () => app.db,
    restart: async () => { await close(); await start(); },
    register: async (username, role = 'student') => {
      const request = client();
      const result = await request('/register', { username, role, name: username, password: 'password123' });
      assert.equal(result.status, 200);
      return { request, user: result.data.user };
    },
    submit: async (student, classroom, name = '杯子') => {
      const result = await student.request(`/classrooms/${classroom.id}/submit`, { name, audio, requestId: randomUUID() });
      assert.equal(result.status, 201);
      return result.data.classroom;
    },
  };
}

const room = async (teacher, capacity = 15) => {
  const result = await teacher('/classrooms', { name: '声音课堂', capacity, background: '教室' });
  assert.equal(result.status, 201);
  return result.data.classroom;
};
const get = async (teacher, classroom) => (await teacher(`/classrooms/${classroom.id}`)).data.classroom.arrangement;
const pattern = (length, ...active) => Array.from({ length }, (_, index) => active.includes(index));
test('student rhythm requests are private, approved with revision checks and do not auto-activate', async t => {
  const f = await fixture(t), teacher = await f.register('rhythm_teacher', 'teacher'), student = await f.register('rhythm_student'), other = await f.register('rhythm_other');
  const classroom = await room(teacher.request);
  for (const account of [student, other]) await account.request('/join', { code: classroom.code });
  const submitted = await f.submit(student, classroom), submissionId = submitted.submissions[0].id;
  const path = `/classrooms/${classroom.id}`, requestId = randomUUID();
  const rhythm = { bars: 1, steps: pattern(16, 0, 3, 7) };
  assert.equal((await student.request(path + '/rhythm-request', { requestId, submissionId, rhythm })).status, 200);
  assert.equal((await other.request(path)).data.classroom.rhythmRequests.length, 0);
  assert.deepEqual((await get(teacher.request, classroom)).tracks[0].steps, pattern(16));
  const decision = { studentId: student.user.id, requestId, decision: 'accept', revision: 0 };
  assert.equal((await student.request(path + '/rhythm-decision', decision)).status, 403);
  assert.equal((await teacher.request(path + '/rhythm-decision', { ...decision, revision: 99 })).status, 409);
  const accepted = await teacher.request(path + '/rhythm-decision', decision);
  assert.equal(accepted.status, 200); assert.deepEqual(accepted.data.classroom.arrangement.tracks[0].steps, rhythm.steps);
  assert.equal(accepted.data.classroom.performance.playing, false);
  assert.equal((await student.request(path + '/rhythm-request', { requestId, submissionId, rhythm })).data.classroom.rhythmRequests[0].status, 'accepted');
  assert.equal((await teacher.request(path + '/rhythm-decision', decision)).status, 409);
  const newer = randomUUID(); await student.request(path + '/rhythm-request', { requestId: newer, submissionId, rhythm });
  assert.equal((await teacher.request(path + '/rhythm-decision', { ...decision, decision: 'reject' })).status, 409);
  assert.equal((await teacher.request(path + '/rhythm-decision', { ...decision, requestId: newer, decision: 'reject' })).status, 409);
  assert.equal((await student.request(path)).data.classroom.rhythmRequests[0].status, 'pending');
  assert.equal((await teacher.request(path + '/rhythm-decision', { ...decision, requestId: newer, decision: 'reject', revision: accepted.data.classroom.arrangement.revision })).status, 200);
  const retried = await student.request(path + '/rhythm-request', { requestId, submissionId, rhythm });
  assert.equal(retried.data.classroom.rhythmRequests[0].requestId, newer);
  assert.equal(retried.data.classroom.rhythmRequests[0].status, 'rejected');
  assert.equal((await other.request(path + '/rhythm-request', { requestId: randomUUID(), submissionId, rhythm })).status, 409);
});

test('stale rhythm rejection preserves the latest pending request and saved track until refreshed', async t => {
  const f = await fixture(t), teacher = await f.register('reject_teacher', 'teacher'), student = await f.register('reject_student');
  const classroom = await room(teacher.request);
  await student.request('/join', { code: classroom.code });
  const submitted = await f.submit(student, classroom), submissionId = submitted.submissions[0].id;
  const path = `/classrooms/${classroom.id}`, firstId = randomUUID(), latestId = randomUUID();
  const propose = requestId => student.request(path + '/rhythm-request', { requestId, submissionId, rhythm: { bars: 1, steps: pattern(16, 2, 6) } });
  await propose(firstId);
  const saved = await edit(teacher.request, classroom, await get(teacher.request, classroom), { track: { studentId: student.user.id, steps: pattern(16, 0, 4) } });
  await propose(latestId);
  const reject = (requestId, revision) => teacher.request(path + '/rhythm-decision', { studentId: student.user.id, requestId, revision, decision: 'reject' });
  const stale = await reject(latestId, 0);
  assert.equal(stale.status, 409); assert.match(stale.data.error, /更新.*刷新/);
  assert.equal((await reject(firstId, saved.revision)).status, 409);
  const unchanged = (await teacher.request(path)).data.classroom;
  assert.deepEqual(unchanged.arrangement, saved);
  assert.equal(unchanged.rhythmRequests[0].requestId, latestId);
  assert.equal(unchanged.rhythmRequests[0].status, 'pending');
  const refreshed = await reject(latestId, saved.revision);
  assert.equal(refreshed.status, 200);
  assert.deepEqual(refreshed.data.classroom.arrangement, saved);
  assert.equal(refreshed.data.classroom.rhythmRequests[0].status, 'rejected');
  assert.equal((await reject(latestId, saved.revision)).status, 409);
});

test('competing accept and reject process a pending rhythm once and cannot change a newer request', async t => {
  const f = await fixture(t), teacher = await f.register('decision_teacher', 'teacher'), student = await f.register('decision_student');
  const classroom = await room(teacher.request);
  await student.request('/join', { code: classroom.code });
  const submitted = await f.submit(student, classroom), submissionId = submitted.submissions[0].id;
  const path = `/classrooms/${classroom.id}`, rhythm = { bars: 1, steps: pattern(16, 1, 5) };
  const propose = requestId => student.request(path + '/rhythm-request', { requestId, submissionId, rhythm });
  const requestId = randomUUID(); await propose(requestId);
  const decide = (id, decision, revision) => teacher.request(path + '/rhythm-decision', { studentId: student.user.id, requestId: id, decision, revision });
  const competing = await Promise.all([decide(requestId, 'accept', 0), decide(requestId, 'reject', 0)]);
  assert.deepEqual(competing.map(result => result.status).sort(), [200, 409]);
  const processed = (await teacher.request(path)).data.classroom;
  const winner = competing[0].status === 200 ? 'accepted' : 'rejected';
  assert.equal(processed.rhythmRequests[0].status, winner);
  assert.deepEqual(processed.arrangement.tracks[0].steps, winner === 'accepted' ? rhythm.steps : pattern(16));
  const latestId = randomUUID(); await propose(latestId);
  assert.equal((await decide(requestId, 'reject', processed.arrangement.revision)).status, 409);
  assert.equal((await propose(requestId)).data.classroom.rhythmRequests[0].requestId, latestId);
  const unchanged = (await teacher.request(path)).data.classroom;
  assert.equal(unchanged.rhythmRequests[0].status, 'pending');
  assert.deepEqual(unchanged.arrangement, processed.arrangement);
  assert.equal((await decide(latestId, 'reject', processed.arrangement.revision)).status, 200);
});
async function edit(teacher, classroom, arrangement, action) {
  const result = await teacher(`/classrooms/${classroom.id}/arrangement`, { revision: arrangement.revision, ...action });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.classroom.arrangement.revision, arrangement.revision + 1);
  return result.data.classroom.arrangement;
}

test('arrangement starts silent and students only receive their own track', async t => {
  const app = await fixture(t);
  const { request: teacher } = await app.register('teacher', 'teacher');
  const classroom = await room(teacher, 3);
  assert.deepEqual(classroom.arrangement, { bars: 1, revision: 0, tracks: [] });
  const students = [];
  for (const name of ['first', 'second', 'no_submission', 'waiting']) {
    const student = await app.register(name);
    const joined = await student.request('/join', { code: classroom.code });
    assert.deepEqual(joined.data.classroom.arrangement.tracks, []);
    students.push(student);
  }
  // Submission time differs from the order in which the students joined.
  await app.submit(students[1], classroom);
  await app.submit(students[0], classroom);
  const arrangement = await get(teacher, classroom);
  assert.deepEqual(arrangement.tracks.map(track => track.studentId), students.slice(0, 2).map(student => student.user.id));
  assert.ok(arrangement.tracks.every(track => track.steps.length === 16 && track.steps.every(step => step === false)));
  assert.equal(arrangement.revision, 0);
  const listed = (await students[0].request('/classrooms')).data.classrooms;
  assert.ok(listed.every(item => item.arrangement.tracks.every(track => track.studentId === students[0].user.id)));
  assert.deepEqual((await students[0].request(`/classrooms/${classroom.id}`)).data.classroom.arrangement.tracks.map(t => t.studentId), [students[0].user.id]);
  assert.deepEqual((await teacher('/classrooms')).data.classrooms[0].arrangement, arrangement);
});

test('each student has an independent rhythm which survives pending, rejected and accepted sample replacements', async t => {
  const app = await fixture(t);
  const { request: teacher } = await app.register('teacher', 'teacher');
  const classroom = await room(teacher);
  const students = [];
  for (const name of ['first', 'second']) {
    const student = await app.register(name);
    await student.request('/join', { code: classroom.code });
    await app.submit(student, classroom);
    students.push(student);
  }
  let arrangement = await get(teacher, classroom);
  const firstSteps = pattern(16, 0, 4, 8, 12), secondSteps = pattern(16, 3, 7, 11, 15);
  arrangement = await edit(teacher, classroom, arrangement, { track: { studentId: students[0].user.id, steps: firstSteps } });
  arrangement = await edit(teacher, classroom, arrangement, { track: { studentId: students[1].user.id, steps: secondSteps } });
  assert.deepEqual(arrangement.tracks.map(track => track.steps), [firstSteps, secondSteps]);
  for (const action of ['reject', 'accept']) {
    const submitted = await app.submit(students[0], classroom, '新声音');
    assert.deepEqual(await get(teacher, classroom), arrangement);
    const pending = submitted.submissions.find(item => item.status === 'pending');
    const result = await teacher(`/submissions/${pending.id}/${action}`, {});
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.classroom.arrangement, arrangement);
  }
});

test('every integer length from 1 to 16 works and shortening permanently deletes the tail for every track', async t => {
  const app = await fixture(t);
  const { request: teacher } = await app.register('teacher', 'teacher');
  const classroom = await room(teacher);
  const students = [];
  for (const name of ['first', 'second']) {
    const student = await app.register(name);
    await student.request('/join', { code: classroom.code });
    await app.submit(student, classroom);
    students.push(student);
  }
  let arrangement = await get(teacher, classroom);
  arrangement = await edit(teacher, classroom, arrangement, { track: { studentId: students[0].user.id, steps: pattern(16, 0, 15) } });
  for (let bars = 1; bars <= 16; bars++) {
    arrangement = await edit(teacher, classroom, arrangement, { bars });
    assert.equal(arrangement.bars, bars);
    assert.ok(arrangement.tracks.every(track => track.steps.length === bars * 16));
    assert.deepEqual(arrangement.tracks[0].steps, pattern(bars * 16, 0, 15));
    assert.ok(arrangement.tracks[1].steps.every(step => !step));
  }
  for (const student of students) arrangement = await edit(teacher, classroom, arrangement, { track: { studentId: student.user.id, steps: pattern(256, 0, 15, 16, 31, 255) } });
  arrangement = await edit(teacher, classroom, arrangement, { bars: 1 });
  arrangement = await edit(teacher, classroom, arrangement, { bars: 16 });
  assert.ok(arrangement.tracks.every(track => JSON.stringify(track.steps) === JSON.stringify(pattern(256, 0, 15))));
  const lateStudent = await app.register('late_student');
  await lateStudent.request('/join', { code: classroom.code });
  await app.submit(lateStudent, classroom);
  const lateTrack = (await get(teacher, classroom)).tracks.find(track => track.studentId === lateStudent.user.id);
  assert.deepEqual(lateTrack.steps, pattern(256));
});

test('permissions, malformed actions and stale revisions cannot overwrite a saved arrangement', async t => {
  const app = await fixture(t);
  const { request: teacher } = await app.register('teacher', 'teacher');
  const { request: stranger } = await app.register('stranger', 'teacher');
  const classroom = await room(teacher, 2);
  const student = await app.register('student'), noSubmission = await app.register('no_submission'), waiting = await app.register('waiting');
  for (const member of [student, noSubmission, waiting]) await member.request('/join', { code: classroom.code });
  await app.submit(student, classroom);
  const path = `/classrooms/${classroom.id}/arrangement`;
  const valid = { revision: 0, track: { studentId: student.user.id, steps: pattern(16, 0, 4) } };
  assert.equal((await app.client()(path, valid)).status, 401);
  assert.equal((await stranger(path, valid)).status, 403);
  assert.equal((await student.request(path, valid)).status, 403);
  const saved = (await teacher(path, valid)).data.classroom.arrangement;
  assert.equal(saved.revision, 1);
  const track = valid.track;
  const invalid = [
    {}, { bars: 2 }, { revision: -1, bars: 2 }, { revision: 1.5, bars: 2 }, { revision: '1', bars: 2 },
    ...[0, 17, 1.5, '2', null].map(bars => ({ revision: 1, bars })),
    { revision: 1, bars: 2, track }, { revision: 1, bars: 2, extra: true },
    { revision: 1, tracks: [track] }, { revision: 1, track: null },
    { revision: 1, track: { ...track, extra: true } },
    ...[[], pattern(15), pattern(17), pattern(257), Array(16).fill(1), Array(16).fill(null), 'invalid'].map(steps => ({ revision: 1, track: { ...track, steps } })),
    ...['unknown', noSubmission.user.id, waiting.user.id].map(studentId => ({ revision: 1, track: { ...track, studentId } })),
  ];
  for (const data of invalid) assert.equal((await teacher(path, data)).status, 400, JSON.stringify(data));
  const conflict = await teacher(path, { revision: 0, bars: 3 });
  assert.equal(conflict.status, 409);
  assert.match(conflict.data.error, /更新.*刷新/);
  assert.deepEqual(await get(teacher, classroom), saved);
  const competing = await Promise.all([teacher(path, { revision: 1, bars: 2 }), teacher(path, { revision: 1, bars: 3 })]);
  assert.deepEqual(competing.map(result => result.status).sort(), [200, 409]);
  assert.deepEqual(await get(teacher, classroom), competing.find(result => result.status === 200).data.classroom.arrangement);
});

test('old classrooms receive defaults, separate classrooms stay independent, and saved rhythm survives restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'music-arrangement-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const app = await fixture(t, join(directory, 'classroom.sqlite'));
  const { request: teacher } = await app.register('teacher', 'teacher');
  const student = await app.register('student');
  const first = await room(teacher), second = await room(teacher);
  for (const classroom of [first, second]) {
    await student.request('/join', { code: classroom.code });
    await app.submit(student, classroom);
  }
  // Recreate the pre-arrangement database state, including existing classroom submissions.
  app.database().exec('DROP TABLE classroom_rhythm_tracks; DROP TABLE classroom_arrangements;');
  await app.restart();
  let arrangement = await get(teacher, first);
  assert.deepEqual(arrangement, { bars: 1, revision: 0, tracks: [{ studentId: student.user.id, steps: pattern(16) }] });
  arrangement = await edit(teacher, first, arrangement, { bars: 3 });
  arrangement = await edit(teacher, first, arrangement, { track: { studentId: student.user.id, steps: pattern(48, 0, 17, 47) } });
  const independent = await get(teacher, second);
  assert.equal(independent.bars, 1);
  assert.equal(independent.revision, 0);
  assert.deepEqual(independent.tracks[0].steps, pattern(16));
  await app.restart();
  assert.deepEqual(await get(teacher, first), arrangement);
  assert.deepEqual(await get(teacher, second), independent);
});
