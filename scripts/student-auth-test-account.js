import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../server/app.js';

// Always seed a separate, local test database. Never install known passwords
// or demonstration identities into a real classroom database.
const directory = resolve('data/student-auth-test');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const credentialFile = resolve(directory, 'credentials.json');
const dbPath = resolve(directory, 'classroom.sqlite');
const credentials = existsSync(credentialFile) ? JSON.parse(readFileSync(credentialFile, 'utf8')) : {
  student: { username: 'student_test_' + randomBytes(4).toString('hex'), password: randomBytes(18).toString('base64url'), name: '登录测试学生' },
  teacher: { username: 'teacher_test_' + randomBytes(4).toString('hex'), password: randomBytes(18).toString('base64url'), name: '登录测试教师' },
};
const app = createApp({ dbPath, studentAuthOptions: { env: {} } });
await new Promise((resolveListen, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolveListen); });
const origin = 'http://127.0.0.1:' + app.server.address().port;
function client(role) {
  const cookies = new Map();
  return async (path, data) => {
    const response = await fetch(origin + '/api/' + role + path, { method: data ? 'POST' : 'GET', headers: { origin, cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; '), 'content-type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
    for (const cookie of response.headers.getSetCookie()) { const [key, ...value] = cookie.split(';')[0].split('='); if (value.join('=')) cookies.set(key, value.join('=')); else cookies.delete(key); }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '测试账号设置失败。');
    return result;
  };
}
try {
  const teacher = client('teacher'), student = client('student');
  const existingTeacher = app.db.prepare('SELECT id FROM users WHERE username=?').get(credentials.teacher.username);
  await teacher(existingTeacher ? '/login' : '/register', { ...credentials.teacher, role: 'teacher' });
  const existing = app.db.prepare('SELECT id FROM users WHERE username=?').get(credentials.student.username);
  const user = (await student(existing ? '/account/login' : '/account/register', credentials.student)).user;
  const rooms = (await teacher('/classrooms')).classrooms;
  const room = rooms[0] || (await teacher('/classrooms', { name: '学生登录测试课堂', capacity: 15, background: '教室' })).classroom;
  await student('/join', { code: room.code });
  await student('/image-profile/register', {});
  writeFileSync(credentialFile, JSON.stringify({ ...credentials, studentId: user.id, classId: room.id, classCode: room.code, dbPath }, null, 2) + '\n', { mode: 0o600 });
  chmodSync(credentialFile, 0o600);
  console.log('测试学生账号和测试课堂已就绪，注册或再次登录验证通过。');
  console.log('测试账号：' + credentials.student.username);
  console.log('本机登录信息：' + credentialFile);
  console.log('独立测试数据库：' + dbPath);
} finally {
  app.server.closeAllConnections(); await new Promise(resolveClose => app.server.close(resolveClose)); app.db.close();
}
