import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server/app.js';
import { provisionAdmin } from '../../server/admin.js';
import { createServer as createViteServer } from 'vite';

const directory = mkdtempSync(join(tmpdir(), 'empvc-admin-ui-'));
function previewBuild() {
  if (process.env.ADMIN_BROWSER_PREVIEW !== 'cloud') return undefined;
  const distDirectory = process.env.ADMIN_BROWSER_DIST || 'dist';
  const files = new Map();
  const types = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
  for (const name of ['index.html', 'teacher.html', 'icon.svg']) files.set('/' + name, { body: readFileSync(join(distDirectory, name)), type: name.endsWith('.html') ? 'text/html; charset=utf-8' : 'image/svg+xml' });
  function visit(directory, prefix) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name), url = prefix + '/' + entry.name;
      if (entry.isDirectory()) visit(path, url);
      else if (entry.isFile()) files.set(url, { body: readFileSync(path), type: types['.' + entry.name.split('.').at(-1)] || 'application/octet-stream' });
    }
  }
  visit(join(distDirectory, 'assets'), '/assets'); return files;
}
const app = createApp({ dbPath: join(directory, 'classroom.sqlite'), adminPreviewFiles: previewBuild() });
await provisionAdmin(app.db, { username: 'browser_admin', password: 'synthetic-admin-password-123', name: '测试管理员' });
const handler = app.server.listeners('request')[0];
// Serve the real app in the editor iframe while keeping all fixture data isolated.
const vite = await createViteServer({ configFile: false, appType: 'mpa', server: { middlewareMode: true, hmr: false } });
let ready = false;
const server = createServer((req, res) => {
  if (!ready && req.url === '/api/health') { res.writeHead(503); res.end(); return; }
  if (req.url === '/admin.html') req.url = '/api/admin/console';
  if (req.url.startsWith('/api/')) handler(req, res);
  else vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
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
  server.close(async () => { await vite.close(); app.closeAdmin(); app.db.close(); rmSync(directory, { recursive: true, force: true }); });
});
