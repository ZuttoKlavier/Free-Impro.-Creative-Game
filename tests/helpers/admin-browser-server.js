import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server/app.js';
import { provisionAdmin } from '../../server/admin.js';

const directory = mkdtempSync(join(tmpdir(), 'empvc-admin-ui-'));
const app = createApp({ dbPath: join(directory, 'classroom.sqlite') });
await provisionAdmin(app.db, { username: 'browser_admin', password: 'synthetic-admin-password-123', name: '测试管理员' });
const handler = app.server.listeners('request')[0];
let ready = false;
const server = createServer((req, res) => {
  if (!ready && req.url === '/api/health') { res.writeHead(503); res.end(); return; }
  if (req.url === '/admin.html') req.url = '/api/admin/console';
  handler(req, res);
});
await new Promise(resolve => server.listen(4307, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:4307';
let cookie = '';
async function post(path, data) {
  const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie }, body: JSON.stringify(data) });
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  if (!response.ok) throw new Error('Synthetic admin fixture failed.');
  return response.json();
}
await post('/api/teacher/register', { username: 'browser_teacher', password: 'synthetic-teacher-password-123', name: '测试教师', role: 'teacher' });
await post('/api/teacher/classrooms', { name: '测试课堂', capacity: 5, background: '教室' });
ready = true;
console.log('Isolated administrator browser fixture ready.');
let closing = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  if (closing) return; closing = true;
  server.closeAllConnections();
  server.close(() => { app.closeAdmin(); app.db.close(); rmSync(directory, { recursive: true, force: true }); });
});
