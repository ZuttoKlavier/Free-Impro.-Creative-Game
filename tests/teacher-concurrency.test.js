import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApp } from '../server/app.js';

// Exercise the real request handler with independently arriving request bodies.
// No HTTP listener is needed to reproduce the read/await/transaction race.
function fixture(t) {
  let now = 1000;
  const { server, db } = createApp({ dbPath: ':memory:', performanceNow: () => now });
  t.after(() => db.close());
  for (const [id, role] of [['teacher', 'teacher'], ['student', 'student']]) db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id, id, id, role, 'salt', 'unused');
  db.prepare('INSERT INTO classrooms VALUES(?,?,?,?,?,?,?)').run('room', '123456', 'teacher', '课堂', 1, '教室', 0);
  db.prepare('INSERT INTO members(class_id,student_id,admitted,joined_at,slot) VALUES(?,?,?,?,?)').run('room', 'student', 1, 0, 1);
  for (const [id, status] of [['old', 'current'], ['next', 'pending']]) db.prepare('INSERT INTO submissions(id,class_id,student_id,request_id,name,duration,audio,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id, 'room', 'student', id, id, .1, Buffer.from('audio'), status, 0);
  const token = 'a'.repeat(64);
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'), 'teacher', Date.now() + 100000);
  const handler = server.listeners('request')[0];
  function request(path, data, delayed = false) {
    let release, result;
    const gate = delayed ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
    const completed = new Promise(resolve => { result = resolve; });
    const req = { method: 'POST', url: '/api' + path, headers: { host: 'local', origin: 'http://local', cookie: `fi_session=${token}` }, socket: { remoteAddress: 'local' }, async *[Symbol.asyncIterator]() { await gate; yield Buffer.from(JSON.stringify(data)); } };
    const res = { headersSent: false, setHeader() {}, writeHead(status) { this.status = status; this.headersSent = true; }, end(body) { result({ status: this.status, body: JSON.parse(body) }); } };
    handler(req, res);
    return { release, completed };
  }
  return { db, request, advance: ms => { now += ms; } };
}

test('a late rejection cannot turn an already accepted replacement into a classroom with no current sound', async t => {
  const { db, request } = fixture(t);
  const accept = request('/submissions/next/accept', {}, true), reject = request('/submissions/next/reject', {}, true);
  accept.release(); assert.equal((await accept.completed).status, 200);
  reject.release(); assert.equal((await reject.completed).status, 409);
  assert.equal(db.prepare("SELECT id FROM submissions WHERE status='current'").get().id, 'next');
  assert.equal(db.prepare("SELECT audio FROM submissions WHERE id='next'").get().audio.length, 5);
});

test('a late acceptance cannot revive a rejected request or remove the original sound', async t => {
  const { db, request } = fixture(t);
  const accept = request('/submissions/next/accept', {}, true), reject = request('/submissions/next/reject', {}, true);
  reject.release(); assert.equal((await reject.completed).status, 200);
  accept.release(); assert.equal((await accept.completed).status, 409);
  assert.equal(db.prepare("SELECT id FROM submissions WHERE status='current'").get().id, 'old');
});

test('another teacher window cannot start, stop, accept or activate while the existing lease is live', async t => {
  const { request, advance } = fixture(t);
  const first = 'first-teacher-window', second = 'second-teacher-window';
  const report = (clientId, playing) => request('/classrooms/room/performance', { clientId, playing, activeStudentIds: playing ? ['student'] : [] }).completed;
  assert.equal((await report(first, true)).status, 200);
  assert.equal((await report(second, true)).status, 409);
  assert.equal((await report(second, false)).status, 409);
  assert.equal((await request('/submissions/next/accept', { clientId: second }).completed).status, 409);
  assert.equal((await request('/submissions/next/accept', { clientId: first }).completed).status, 200);
  assert.equal((await request('/classrooms/room/activate', { clientId: second, submissionIds: ['next'] }).completed).status, 409);
  advance(30000);
  assert.equal((await report(second, true)).status, 200);
  assert.equal((await report(first, false)).status, 409);
  assert.equal((await request('/classrooms/room/activate', { clientId: second, submissionIds: ['next'] }).completed).status, 200);
});

for (const largestFirst of [true, false]) test(`concurrent capacity updates preserve the 50-student limit (${largestFirst ? 'largest' : 'smallest'} finishes first)`, async t => {
  const { db, request } = fixture(t);
  db.prepare('INSERT INTO classroom_places VALUES(?,?,?,?)').run('room', 1, .23, .81);
  for (let i = 2; i <= 52; i++) {
    const id = `student-${i}`;
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id, id, id, 'student', 'salt', 'unused');
    db.prepare('INSERT INTO members(class_id,student_id,admitted,joined_at) VALUES(?,?,?,?)').run('room', id, 0, i);
  }
  const small = request('/classrooms/room/capacity', { capacity: 2 }, true);
  const large = request('/classrooms/room/capacity', { capacity: 50 }, true);
  const first = largestFirst ? large : small, last = largestFirst ? small : large;
  first.release(); assert.equal((await first.completed).status, 200);
  last.release(); const result = await last.completed;
  assert.equal(result.status, largestFirst ? 409 : 200);
  assert.equal(db.prepare('SELECT capacity FROM classrooms WHERE id=?').get('room').capacity, 50);
  const admitted = db.prepare('SELECT slot FROM members WHERE class_id=? AND admitted=1 ORDER BY slot').all('room');
  assert.deepEqual(admitted.map(member => member.slot), Array.from({ length: 50 }, (_, i) => i + 1));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM members WHERE class_id=? AND admitted=0').get('room').n, 2);
  const places = db.prepare('SELECT slot,x,y FROM classroom_places WHERE class_id=? ORDER BY slot').all('room');
  assert.equal(places.length, 50);
  assert.deepEqual({ ...places[0] }, { slot: 1, x: .23, y: .81 });
});
