import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Prepared for the frozen 2705870 API. No requests run without the explicit flag.
const origin = 'https://class.empfreeimpro.xyz';
const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== '--run') {
  console.log('Prepared public classroom check. Run only after public HTTPS is verified: node scripts/public-classroom-smoke.js --run');
  console.log('Creates one marked teacher, guest student, classroom and synthetic WAV; retains those records and logs out its own sessions. Credentials stay in the ignored data/public-network-smoke directory.');
  if (args.length && !(args.length === 1 && ['--help', '--plan'].includes(args[0]))) process.exitCode = 1;
} else {
  await run().catch(() => { process.exitCode = 1; });
}

async function run() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '');
  const suffix = randomBytes(5).toString('hex');
  const runId = `smoke_${day}_${suffix}`;
  const parent = join(projectRoot, 'data/public-network-smoke');
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const directory = join(parent, runId);
  mkdirSync(directory, { mode: 0o700 });
  const credentials = {
    origin, runId,
    teacher: { username: runId, password: randomBytes(24).toString('base64url'), name: `验网教师_${suffix}` },
    student: { name: `验网学生_${suffix}` },
    cookies: { teacher: '', student: '' }
  };
  const report = {
    origin, sourceApiCommit: '2705870', runId, startedAt: new Date().toISOString(),
    status: 'running', operations: [], records: {},
    classroomCloseSupported: false, persistentTestRecordsRetained: true,
    limitation: 'The frozen public API cannot close or delete classrooms. Only this check\'s sessions are logged out. Normal server login also expires preexisting expired sessions.'
  };
  const save = () => {
    for (const [name, value] of [['credentials.json', credentials], ['report.json', report]]) {
      const temporary = join(directory, name + '.tmp');
      writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      renameSync(temporary, join(directory, name));
    }
  };
  save();

  async function api(role, path, expectedStatus, body) {
    const operation = { method: body === undefined ? 'GET' : 'POST', role, path, state: 'pending' };
    report.operations.push(operation); save();
    try {
      const response = await fetch(origin + '/api' + (role ? '/' + role : '') + path, {
        method: operation.method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: {
          Origin: origin, 'User-Agent': 'EMPVC-Public-Smoke/1',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(role && credentials.cookies[role] ? { Cookie: credentials.cookies[role] } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      if (role) {
        const cookie = response.headers.getSetCookie().find(value => value.startsWith(`fi_session_${role}=`));
        if (cookie) {
          credentials.cookies[role] = cookie.split(';')[0].split('=')[1] ? cookie.split(';')[0] : '';
          save();
          assert.match(cookie, /;\s*HttpOnly(?:;|$)/i);
          assert.match(cookie, /;\s*Secure(?:;|$)/i);
          assert.match(cookie, /;\s*SameSite=Strict(?:;|$)/i);
          assert.match(cookie, new RegExp(`;\\s*Path=/api/${role}(?:;|$)`));
        }
      }
      operation.status = response.status;
      assert.equal(response.status, expectedStatus, `${operation.method} ${role || ''}${path} returned unexpected HTTP status`);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.ok(bytes.length < 2 * 1024 * 1024, 'Unexpectedly large verification response');
      operation.state = 'passed'; save();
      return response.headers.get('content-type')?.includes('application/json') ? JSON.parse(bytes.toString('utf8')) : bytes;
    } catch (error) {
      operation.state = operation.status === undefined ? 'outcome-uncertain' : 'failed'; save();
      throw error;
    }
  }
  const checkId = id => { assert.match(id || '', /^[a-f0-9-]{36}$/); return id; };
  const sameRoom = data => {
    const room = data.classroom;
    assert.equal(room.id, report.records.classroomId);
    assert.equal(room.teacher_id, report.records.teacherId);
    assert.equal(room.members.length, 1);
    assert.equal(room.members[0].student_id, report.records.studentId);
    assert.equal(room.members[0].admitted, 1);
    assert.equal(room.submissions.length, 1);
    assert.equal(room.submissions[0].id, report.records.submissionId);
    return room;
  };
  const wav = () => {
    const sampleRate = 24000, samples = 3000, bytes = Buffer.alloc(44 + samples * 2);
    bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28);
    bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(1800 * Math.sin(2 * Math.PI * 440 * i / sampleRate)), 44 + i * 2);
    return bytes;
  };
  let failure;
  try {
    assert.equal((await api(null, '/health', 200)).ok, true);
    let teacher = await api('teacher', '/register', 200, { ...credentials.teacher, role: 'teacher' });
    report.records.teacherId = checkId(teacher.user.id); save();
    assert.equal(teacher.user.username, credentials.teacher.username);
    assert.equal(teacher.user.role, 'teacher');
    await api('teacher', '/logout', 200, {});
    await api('teacher', '/me', 401);
    teacher = await api('teacher', '/login', 200, { username: credentials.teacher.username, password: credentials.teacher.password });
    assert.equal(teacher.user.id, report.records.teacherId);
    assert.equal((await api('teacher', '/classrooms', 200)).classrooms.length, 0);
    const created = await api('teacher', '/classrooms', 201, { name: `验网测试_${day}_${suffix}`, capacity: 1, background: '教室' });
    report.records.classroomId = checkId(created.classroom.id);
    report.records.classroomName = created.classroom.name;
    report.records.classroomCode = created.classroom.code; save();
    assert.equal(created.classroom.teacher_id, report.records.teacherId);
    assert.match(report.records.classroomCode, /^\d{6}$/);
    const entered = await api('student', '/enter-classroom', 200, { name: credentials.student.name, code: report.records.classroomCode });
    report.records.studentId = checkId(entered.user.id); save();
    assert.equal(entered.user.name, credentials.student.name);
    assert.equal(entered.user.role, 'student');
    const audio = wav();
    report.audioSha256 = createHash('sha256').update(audio).digest('hex');
    report.audioBytes = audio.length; report.audioSeconds = 0.125;
    report.records.requestId = randomUUID(); save();
    const submitted = await api('student', `/classrooms/${report.records.classroomId}/submit`, 201, { name: `验网WAV_${suffix}`, requestId: report.records.requestId, audio: audio.toString('base64') });
    assert.equal(submitted.classroom.submissions.length, 1);
    report.records.submissionId = checkId(submitted.classroom.submissions[0].id); save();
    sameRoom(submitted);
    sameRoom(await api('teacher', `/classrooms/${report.records.classroomId}`, 200));
    const received = await api('teacher', `/submissions/${report.records.submissionId}/audio`, 200);
    assert.ok(Buffer.isBuffer(received));
    assert.equal(createHash('sha256').update(received).digest('hex'), report.audioSha256);
    assert.equal((await api('teacher', '/me', 200)).user.id, report.records.teacherId);
    assert.equal((await api('student', '/me', 200)).user.id, report.records.studentId);
    sameRoom(await api('student', `/classrooms/${report.records.classroomId}`, 200));
    const reentered = await api('student', '/enter-classroom', 200, { name: credentials.student.name, code: report.records.classroomCode });
    assert.equal(reentered.user.id, report.records.studentId);
    await api('teacher', '/logout', 200, {});
    teacher = await api('teacher', '/login', 200, { username: credentials.teacher.username, password: credentials.teacher.password });
    assert.equal(teacher.user.id, report.records.teacherId);
    sameRoom(await api('teacher', `/classrooms/${report.records.classroomId}`, 200));
    const reloaded = await api('teacher', `/submissions/${report.records.submissionId}/audio`, 200);
    assert.equal(createHash('sha256').update(reloaded).digest('hex'), report.audioSha256);
    report.status = 'passed';
  } catch (error) {
    failure = error;
    report.status = 'failed';
    report.failure = error instanceof assert.AssertionError ? 'A verification assertion failed; inspect recorded operation statuses.' : 'A network or response error occurred; write outcomes may be uncertain. Do not rerun automatically.';
  } finally {
    report.sessionCleanup = {};
    for (const role of ['student', 'teacher']) {
      if (!credentials.cookies[role]) { report.sessionCleanup[role] = 'no-active-local-cookie'; continue; }
      try {
        await api(role, '/logout', 200, {});
        await api(role, '/me', 401);
        report.sessionCleanup[role] = 'logged-out-and-verified';
      } catch {
        report.sessionCleanup[role] = 'unconfirmed'; report.status = 'failed';
        failure ||= new Error('Session cleanup could not be verified.');
      }
    }
    report.finishedAt = new Date().toISOString(); save();
    console.log(`Public classroom verification: ${report.status}. Protected report: ${join(directory, 'report.json')}`);
    console.log('Marked verification records are retained; the frozen API has no classroom-close operation. No existing account, classroom or work was selected for modification.');
  }
  if (failure) throw failure;
}
