import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PNG } from 'pngjs';
import { createApp } from '../server/app.js';
import { encodeWav } from '../src/audio.js';

async function setup(options = {}) {
  const app = createApp({ dbPath: ':memory:', ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  function client(performanceClientId = 'test-performance-client') {
    let cookie = '';
    return async (path, body) => {
      const response = await fetch(base + '/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: base }), Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify({ ...body, ...(/\/(performance|activate|accept)$/.test(path) ? { clientId: performanceClientId } : {}) }) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, data: response.headers.get('content-type')?.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
    };
  }
  const teacher = client(), student = client(), second = client(), waiting = client(), stranger = client();
  const users = {};
  for (const [name, request, role] of [['teacher', teacher, 'teacher'], ['student', student, 'student'], ['second', second, 'student'], ['waiting', waiting, 'student'], ['stranger', stranger, 'teacher']]) {
    const result = await request('/register', { username: name, name, role, password: 'password123' });
    users[name] = result.data.user;
  }
  const room = (await teacher('/classrooms', { name: '合奏', capacity: 2, background: '厨房' })).data.classroom;
  for (const request of [student, second, waiting]) await request('/join', { code: room.code });
  const audio = Buffer.from(await encodeWav(new Float32Array(2400), 24000).arrayBuffer()).toString('base64');
  const png = new PNG({ width: 2, height: 2 }); png.data.fill(180);
  const image = 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');
  async function submit(request, name, roomId = room.id, rhythm) {
    const result = await request(`/classrooms/${roomId}/submit`, { name, requestId: randomUUID(), audio, image, imageKind: 'avatar', ...(rhythm ? { rhythm } : {}) });
    assert.equal(result.status, 201);
    return result.data.classroom.submissions.find(item => item.name === name);
  }
  const original = await submit(student, '原作品'), secondOriginal = await submit(second, '另一件作品');
  return { ...app, base, client, teacher, student, second, waiting, stranger, users, room, original, secondOriginal, submit, image,
    close: async () => { await new Promise(resolve => app.server.close(resolve)); app.db.close(); } };
}

test('submitted compositions reach the classroom intact and replacements change sample and rhythm together', async () => {
  const f = await setup();
  try {
    const room = (await f.teacher('/classrooms', { name: '带节奏上传', capacity: 2, background: '操场' })).data.classroom;
    await f.student('/join', { code: room.code });
    await f.teacher(`/classrooms/${room.id}/arrangement`, { revision: 0, bars: 2 });
    const first = { bars: 1, steps: [4, ...Array(7).fill(false), true, ...Array(7).fill(false)] };
    const original = await f.submit(f.student, '长音作品', room.id, first);
    let snapshot = (await f.teacher(`/classrooms/${room.id}`)).data.classroom;
    assert.deepEqual(original.rhythm, first);
    assert.deepEqual(snapshot.arrangement.tracks[0].steps, [...first.steps, ...first.steps]);
    const next = { bars: 2, steps: [...Array(16).fill(false), false, 8, ...Array(14).fill(false)] };
    await f.teacher(`/classrooms/${room.id}/performance`, { playing: true, activeStudentIds: [f.users.student.id] });
    const replacement = await f.submit(f.student, '第二份长音作品', room.id, next);
    snapshot = (await f.teacher(`/submissions/${replacement.id}/accept`, {})).data.classroom;
    assert.equal(snapshot.submissions.find(s => s.id === replacement.id).status, 'accepted');
    assert.deepEqual(snapshot.arrangement.tracks[0].steps, [...first.steps, ...first.steps]);
    snapshot = (await f.teacher(`/classrooms/${room.id}/activate`, { submissionIds: [replacement.id] })).data.classroom;
    assert.deepEqual(snapshot.arrangement.tracks[0].steps, next.steps);
    assert.equal(snapshot.submissions.find(s => s.id === replacement.id).status, 'current');
    await f.teacher(`/classrooms/${room.id}/performance`, { playing: false, activeStudentIds: [] });
    const withoutDraft = await f.submit(f.student, '仅更换采样', room.id);
    snapshot = (await f.teacher(`/submissions/${withoutDraft.id}/accept`, {})).data.classroom;
    assert.deepEqual(snapshot.arrangement.tracks[0].steps, next.steps);
  } finally { await f.close(); }
});

test('classroom stage exposes only the published audible mix and protects every media and control route', async () => {
  let time = 100000;
  const f = await setup({ performanceNow: () => time });
  const base = `/classrooms/${f.room.id}`, steps = [4, ...Array(15).fill(false)];
  const timeline = { bpm: 100, swing: .2, volume: .8, bars: 1, loop: 3, remaining: 1.2, tracks: [{ id: f.users.student.id, submissionId: f.original.id, pattern: steps, volume: .65, position: { x: .3, y: .6 } }] };
  try {
    assert.equal((await f.teacher(base + '/performance', { playing: true, activeStudentIds: [f.users.student.id], timeline })).status, 200);
    time += 250;
    const response = await f.second(base + '/stage');
    assert.equal(response.status, 200);
    const stage = response.data.stage;
    assert.equal(stage.performance.serverNow - stage.performance.updatedAt, 250);
    assert.deepEqual(stage.performers[0].pattern, steps);
    assert.equal(stage.performers[0].submissionId, f.original.id);
    assert.equal(stage.performers[0].name, 'student');
    assert.equal(stage.performers.length, 1);
    assert.equal(stage.performance.clientId, undefined);
    assert.equal((await f.second(base + `/stage/${f.original.id}/audio`)).status, 200);
    assert.equal((await f.second(base + `/stage/${f.original.id}/image`)).status, 200);
    assert.equal((await f.second(`/submissions/${f.original.id}/audio`)).status, 403);
    assert.equal((await f.second(base + `/stage/${f.secondOriginal.id}/audio`)).status, 403);
    assert.equal((await f.waiting(base + '/stage')).status, 403);
    assert.equal((await f.stranger(base + '/stage')).status, 403);
    assert.equal((await f.second(base + '/performance', { playing: false, activeStudentIds: [] })).status, 403);
    assert.equal((await f.second(base + '/layout', { slot: 1, x: .4, y: .4 })).status, 403);
    assert.equal((await f.second(base + '/arrangement', { revision: 0, bars: 2 })).status, 403);
    const before = (await f.teacher(base)).data.classroom.arrangement;
    await f.teacher(base + '/arrangement', { revision: before.revision, track: { studentId: f.users.student.id, steps: Array(16).fill(false) } });
    assert.deepEqual((await f.second(base + '/stage')).data.stage.performers[0].pattern, steps);
    assert.equal((await f.teacher(base + '/performance', { playing: true, activeStudentIds: [f.users.student.id], timeline: { ...timeline, tracks: [{ ...timeline.tracks[0], submissionId: f.secondOriginal.id }] } })).status, 400);
    time += 31000;
    assert.equal((await f.second(base + '/stage')).data.stage.performance.playing, false);
    assert.equal((await f.second(base + `/stage/${f.original.id}/audio`)).status, 403);
  } finally { await f.close(); }
});

test('playing replacements retain current media until an atomic, authorized boundary acknowledgement', async () => {
  const f = await setup(); const { teacher, student, second, stranger, room, users, original, submit } = f;
  const base = `/classrooms/${room.id}`;
  try {
    let response = await teacher(base + '/performance', { playing: true, activeStudentIds: [users.student.id] });
    assert.equal(response.status, 200);
    assert.equal(response.data.classroom.submissions.find(s => s.id === original.id).enabled, true);
    const replacement = await submit(student, '替换一');
    response = await teacher(`/submissions/${replacement.id}/accept`, {});
    assert.equal(response.data.classroom.submissions.find(s => s.id === replacement.id).status, 'accepted');
    assert.equal(response.data.classroom.submissions.find(s => s.id === replacement.id).enabled, false);
    assert.equal(response.data.classroom.submissions.find(s => s.id === original.id).status, 'current');
    assert.equal((await teacher(`/submissions/${original.id}/audio`)).status, 200);
    assert.equal((await teacher(`/submissions/${original.id}/image`)).status, 200);
    assert.equal((await student(`/submissions/${replacement.id}/audio`)).status, 200);
    assert.equal((await second(`/submissions/${replacement.id}/audio`)).status, 403);
    assert.equal((await stranger(`/submissions/${replacement.id}/accept`, {})).status, 403);

    const latest = await submit(student, '替换二');
    response = await student(base);
    assert.deepEqual(new Set(response.data.classroom.submissions.map(s => s.status)), new Set(['current', 'accepted', 'pending']));
    await teacher(`/submissions/${latest.id}/accept`, {});
    assert.equal((await teacher(`/submissions/${replacement.id}/audio`)).status, 404);
    assert.equal((await teacher(`/submissions/${original.id}/audio`)).status, 200);
    assert.equal((await student(base + '/activate', { submissionIds: [latest.id] })).status, 403);
    assert.equal((await stranger(base + '/activate', { submissionIds: [latest.id] })).status, 403);

    const foreignRoom = (await stranger('/classrooms', { name: '别的课堂', capacity: 2, background: '教室' })).data.classroom;
    await student('/join', { code: foreignRoom.code });
    const foreign = await submit(student, '外部作品', foreignRoom.id);
    assert.equal((await teacher(base + '/activate', { submissionIds: [latest.id, foreign.id] })).status, 404);
    assert.equal((await student(base)).data.classroom.submissions.find(s => s.id === latest.id).status, 'accepted');
    response = await teacher(base + '/activate', { submissionIds: [latest.id] });
    assert.equal(response.status, 200);
    assert.equal(response.data.classroom.submissions.find(s => s.id === latest.id).status, 'current');
    assert.equal(response.data.classroom.submissions.find(s => s.id === latest.id).enabled, true);
    assert.equal((await teacher(`/submissions/${original.id}/audio`)).status, 404);
    assert.equal((await teacher(`/submissions/${original.id}/image`)).status, 404);
    assert.equal((await teacher(base + '/activate', { submissionIds: [latest.id] })).status, 200);
    assert.equal((await teacher(base + '/activate', { submissionIds: [replacement.id] })).status, 409);

    const queued = await submit(student, '停止后等待启用');
    await teacher(`/submissions/${queued.id}/accept`, {});
    response = await teacher(base + '/performance', { playing: false, activeStudentIds: [] });
    assert.equal(response.data.classroom.submissions.find(s => s.id === queued.id).status, 'accepted');
    assert.equal(response.data.classroom.submissions.some(s => s.enabled), false);
    // Reporting a stop never promotes an audio buffer the engine has not applied.
    assert.equal((await teacher(`/submissions/${latest.id}/audio`)).status, 200);
    assert.equal((await teacher(base + '/activate', { submissionIds: [queued.id] })).status, 200);
  } finally { await f.close(); }
});

test('teacher engine status validates membership, expires after 30 seconds, and permits immediate stopped acceptance', async () => {
  let now = 1000;
  const f = await setup({ performanceNow: () => now });
  const { teacher, student, waiting, stranger, users, room, submit } = f;
  const path = `/classrooms/${room.id}/performance`;
  try {
    const state = { playing: true, activeStudentIds: [users.student.id] };
    assert.equal((await student(path, state)).status, 403);
    assert.equal((await stranger(path, state)).status, 403);
    assert.equal((await waiting(path, state)).status, 403);
    for (const invalid of [{ playing: 'true', activeStudentIds: [] }, { playing: false, activeStudentIds: [users.student.id] }, { playing: true, activeStudentIds: [users.waiting.id] }, { playing: true, activeStudentIds: [users.student.id, users.student.id] }, { playing: true, activeStudentIds: [users.teacher.id] }]) assert.equal((await teacher(path, invalid)).status, 400);
    await teacher(path, state);
    now += 29999;
    let snapshot = (await student(`/classrooms/${room.id}`)).data.classroom;
    assert.equal(snapshot.performance.playing, true);
    assert.equal(snapshot.submissions[0].enabled, true);
    now += 1;
    snapshot = (await student(`/classrooms/${room.id}`)).data.classroom;
    assert.equal(snapshot.performance.playing, false);
    assert.deepEqual(snapshot.performance.activeStudentIds, []);
    assert.equal(snapshot.performance.updatedAt, 1000);
    assert.equal(snapshot.submissions[0].enabled, false);
    const replacement = await submit(student, '心跳超时后接受');
    const response = await teacher(`/submissions/${replacement.id}/accept`, {});
    assert.equal(response.data.classroom.submissions.find(s => s.id === replacement.id).status, 'current');
    await teacher(path, state);
    assert.equal((await student(`/classrooms/${room.id}`)).data.classroom.performance.playing, true);
  } finally { await f.close(); }
});
