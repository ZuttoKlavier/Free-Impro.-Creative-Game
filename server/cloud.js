import { createServer } from 'node:http';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { isIP } from 'node:net';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};
const rootFiles = new Set(['index.html', 'teacher.html', 'sw.js', 'student-sw.js', 'manifest.webmanifest', 'teacher.webmanifest', 'icon.svg', 'favicon.ico']);

export function validatePublicOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('PUBLIC_ORIGIN 必须是公开 HTTPS 域名，例如 https://class.empfreeimpro.xyz。'); }
  const labels = url.hostname.split('.');
  if (typeof value !== 'string' || value !== url.origin || url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/' || isIP(url.hostname) || labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || /^\d+$/.test(labels.at(-1)) || ['localhost', 'local', 'internal', 'test', 'invalid'].includes(labels.at(-1))) {
    throw new Error('PUBLIC_ORIGIN 必须是规范的公开 HTTPS 来源，不能包含路径、端口、账号或本地地址。');
  }
  return url;
}

function buildFiles(directory) {
  const files = new Map();
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new Error('dist 必须是实际构建目录。');
  function visit(path, prefix = '') {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const url = prefix + '/' + entry.name;
      if (entry.isDirectory()) {
        if ((prefix === '' && entry.name === 'assets') || prefix.startsWith('/assets')) visit(join(path, entry.name), url);
      } else if (entry.isFile() && contentTypes[extname(entry.name)] && (prefix.startsWith('/assets') || (prefix === '' && rootFiles.has(entry.name)))) {
        files.set(url, { type: contentTypes[extname(entry.name)], body: readFileSync(join(path, entry.name)) });
      }
    }
  }
  visit(directory);
  if (!files.has('/index.html') || !files.has('/teacher.html')) throw new Error('尚未生成独立学生和教师页面，请先运行 npm run build。');
  return files;
}

// TLS belongs to the same-host reverse proxy. Forwarding headers never grant
// origin, authentication or local teacher-computer privileges to this backend.
export async function startCloudServer({ publicOrigin = process.env.PUBLIC_ORIGIN, distDirectory = 'dist', dbPath = 'data/classroom.sqlite', bind = '127.0.0.1', port = 3000, imageTokenFile } = {}) {
  const origin = validatePublicOrigin(publicOrigin);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT 必须是 0–65535 的整数。');
  if (typeof bind !== 'string' || !isIP(bind)) throw new Error('BIND 必须是明确的监听 IP 地址。');
  const files = buildFiles(resolve(distDirectory));
  const app = createApp({ dbPath, secureCookies: true, ...(imageTokenFile ? { imageTokenFile } : {}) });
  const api = app.server.listeners('request')[0];
  const server = createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body) }); res.end(req.method === 'HEAD' ? undefined : body); };
    if (req.headers.host !== origin.host) { send(421, '请使用配置的课堂域名。'); return; }
    // Reject alternate/absolute request targets and ambiguous encoded paths.
    const target = req.url?.split('?')[0];
    if (!target?.startsWith('/') || target.startsWith('//') || /\\|%2e|%2f|%5c|(?:^|\/)\.{1,2}(?:\/|$)|%(?![a-f0-9]{2})/i.test(target)) { send(400, '无效地址。'); return; }
    if (req.headers.origin !== undefined && req.headers.origin !== origin.origin) { send(403, '请从本应用页面发起操作。'); return; }
    // Administrator maintenance and the local stdio image bridge are configured
    // separately. Never delegate these routes to the shared business app.
    if (target.startsWith('/mcp/') || target === '/api/admin' || target.startsWith('/api/admin/') || /^\/api\/(?:teacher\/|student\/)?image-mcp-save-local(?:\/|$)/.test(target)) { send(404, '页面不存在。'); return; }
    if (target.startsWith('/api/')) { api(req, res); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { send(405, '不支持的操作。'); return; }
    const file = files.get(target === '/' ? '/index.html' : target);
    if (!file) { send(404, '页面不存在。'); return; }
    res.setHeader('Cache-Control', target.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    res.writeHead(200, { 'Content-Type': file.type, 'Content-Length': file.body.length });
    res.end(req.method === 'HEAD' ? undefined : file.body);
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 15000;
  let closing;
  const close = () => {
    if (closing) return closing;
    closing = new Promise((resolveClose, rejectClose) => {
      const finish = error => {
        try {
          app.closeAdmin();
          app.db.close();
          if (error) rejectClose(error); else resolveClose();
        } catch (closeError) { rejectClose(closeError); }
      };
      if (!server.listening) { finish(); return; }
      const deadline = setTimeout(() => server.closeAllConnections(), 5000);
      deadline.unref();
      server.close(error => {
        clearTimeout(deadline);
        finish(error);
      });
      server.closeIdleConnections();
    });
    return closing;
  };
  try {
    await new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(port, bind, () => { server.removeListener('error', reject); resolveListen(); });
    });
  } catch (error) { await close(); throw error; }
  return { server, db: app.db, close, publicOrigin: origin.origin, classroomUrl: origin.origin + '/' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    // The production runtime receives explicit environment variables; no local
    // .env, classroom CA or TLS private key is read by this entry point.
    const app = await startCloudServer({ dbPath: process.env.FREE_IMPRO_DB || 'data/classroom.sqlite', distDirectory: process.env.DIST_DIRECTORY || 'dist', bind: process.env.CLOUD_BIND || '127.0.0.1', port: Number(process.env.CLOUD_PORT || 3000) });
    console.log(`Classroom cloud backend ready for ${app.publicOrigin}`);
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
      if (stopping) return;
      stopping = true;
      try { await app.close(); process.exitCode = 0; } catch { process.exitCode = 1; }
    });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
