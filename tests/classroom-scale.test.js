import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
import { createApp } from '../server/app.js';
import { encodeWav } from '../src/audio.js';

test('50 concurrent classroom clients retain private identities, media and latest requests without exceeding capacity', async t => {
  const { server, db } = createApp({ dbPath: ':memory:' });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const client = role => {
    let cookie = '';
    return async (path, body) => {
      const response = await fetch(`${origin}/api/${role}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, data: response.headers.get('content-type')?.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
    };
  };
  const teacher = client('teacher');
  assert.equal((await teacher('/register', { name: '规模测试老师', username: 'scale_teacher', password: 'password123', role: 'teacher' })).status, 200);
  const created = await teacher('/classrooms', { name: '50 人并发课堂', capacity: 50, background: '教室' });
  assert.equal(created.status, 201);
  const room = created.data.classroom, path = `/classrooms/${room.id}`;
  const students = await Promise.all(Array.from({ length: 50 }, async (_, index) => {
    const request = client('student');
    const joined = await request('/enter-classroom', { name: '同名学生', code: room.code });
    assert.equal(joined.status, 200, JSON.stringify(joined.data));
    return { request, user: joined.data.user, index };
  }));
  assert.equal(new Set(students.map(s => s.user.id)).size, 50);
  assert.equal(new Set(students.map(s => s.user.username)).size, 50);
  const audio = Buffer.from(await encodeWav(new Float32Array(2400).fill(.1), 24000).arrayBuffer());
  const png = new PNG({ width: 16, height: 16 }); png.data.fill(255);
  const image = PNG.sync.write(png), imageData = `data:image/png;base64,${image.toString('base64')}`;
  await Promise.all(students.map(async student => {
    const body = { name: `声音 ${student.index}`, requestId: randomUUID(), audio: audio.toString('base64'), image: imageData, imageKind: 'avatar' };
    const sent = await student.request(path + '/submit', body);
    assert.equal(sent.status, 201);
    student.submission = sent.data.classroom.submissions.find(s => s.status === 'current');
    assert.equal((await student.request(path + '/submit', body)).status, 200);
    assert.equal((await student.request(`/submissions/${student.submission.id}/audio`)).data.compare(audio), 0);
    assert.equal((await student.request(`/submissions/${student.submission.id}/image`)).data.compare(image), 0);
  }));
  const snapshot = (await teacher(path)).data.classroom;
  assert.equal(snapshot.memberCount, 50); assert.equal(snapshot.submissions.length, 50);
  assert.equal(new Set(snapshot.members.map(m => m.slot)).size, 50);
  assert.equal(snapshot.arrangement.tracks.length, 50);
  const full = client('student');
  assert.equal((await full('/enter-classroom', { name: '等待扩容', code: room.code })).status, 200);
  assert.equal((await full(path)).data.classroom.members[0].admitted, 0);
  assert.equal((await full(path + '/submit', { name: '不得挤占', requestId: randomUUID(), audio: audio.toString('base64') })).status, 403);
  assert.equal((await teacher(path + '/capacity', { capacity: 51 })).status, 400);
  await Promise.all(students.map(async student => {
    const rhythm = { bars: 1, steps: Array.from({ length: 16 }, (_, i) => i === student.index % 16) };
    const oldId = randomUUID(), latestId = randomUUID();
    const propose = requestId => student.request(path + '/rhythm-request', { requestId, submissionId: student.submission.id, rhythm });
    assert.equal((await propose(oldId)).status, 200); assert.equal((await propose(latestId)).status, 200);
    const retried = await propose(oldId);
    assert.equal(retried.data.classroom.rhythmRequests[0].requestId, latestId);
    assert.ok(retried.data.classroom.arrangement.tracks.every(track => track.studentId === student.user.id));
    const neighbour = students[(student.index + 1) % students.length];
    assert.equal((await student.request(`/submissions/${neighbour.submission.id}/audio`)).status, 403);
  }));
  const final = (await teacher(path)).data.classroom;
  assert.equal(final.memberCount, 50); assert.equal(final.rhythmRequests.length, 50);
  assert.equal(final.submissions.filter(s => s.status === 'current').length, 50);
  const reject = (request, revision) => teacher(path + '/rhythm-decision', { studentId: request.studentId, requestId: request.requestId, decision: 'reject', revision });
  const stale = await Promise.all(final.rhythmRequests.map(request => reject(request, 1)));
  assert.ok(stale.every(result => result.status === 409));
  const preserved = (await teacher(path)).data.classroom;
  assert.deepEqual(preserved.arrangement, final.arrangement);
  assert.ok(preserved.rhythmRequests.every(request => request.status === 'pending'));
  const rejected = await Promise.all(final.rhythmRequests.map(request => reject(request, 0)));
  assert.ok(rejected.every(result => result.status === 200));
  const settled = (await teacher(path)).data.classroom;
  assert.ok(settled.rhythmRequests.every(request => request.status === 'rejected'));
  assert.deepEqual(settled.arrangement, final.arrangement);
  const repeated = await Promise.all(final.rhythmRequests.map(request => reject(request, 0)));
  assert.ok(repeated.every(result => result.status === 409));
});
