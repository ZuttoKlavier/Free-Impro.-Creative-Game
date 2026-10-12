import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prefix = '/api/admin/database';
const maximumBody = 1024 * 1024;
const maximumResponse = 8 * 1024 * 1024;

function reply(res, status, message) {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(message);
}

// Authentication, CSRF and exact-origin checks belong to the caller and must
// run before proxy(). No teacher/student credentials reach the Python process.
export function createAdminDatabase({ dbPath, pythonPath } = {}) {
  const databasePath = typeof dbPath === 'string' && dbPath !== ':memory:' ? resolve(dbPath) : null;
  const python = pythonPath || (process.platform === 'win32' ? resolve(root, 'data/admin/venv/Scripts/python.exe') : resolve(root, 'data/admin/venv/bin/python'));
  let child;
  let starting;
  let port;
  let closed = false;
  let active = 0;

  function close() {
    closed = true;
    port = undefined;
    child?.stdin.end();
    child?.kill('SIGTERM');
    child = undefined;
  }

  async function start() {
    if (closed) throw new Error('数据库浏览工具已关闭。');
    if (port) return port;
    if (starting) return starting;
    if (!existsSync(python)) throw new Error('请先运行管理员数据库工具安装。');
    const environment = { PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1' };
    for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TMP', 'TEMP', 'TMPDIR']) if (process.env[key]) environment[key] = process.env[key];
    const process_ = spawn(python, [resolve(root, 'scripts/admin-sqlite-web.py'), '--database', databasePath], {
      cwd: root, env: environment, stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true,
    });
    child = process_;
    starting = new Promise((resolveStart, rejectStart) => {
      let output = '';
      let settled = false;
      // Stderr is drained, capped and discarded; it may contain private data.
      let diagnosticBytes = 0;
      process_.stderr.on('data', data => { diagnosticBytes = Math.min(4096, diagnosticBytes + data.length); });
      const finish = (error, readyPort) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) { process_.kill('SIGTERM'); rejectStart(error); }
        else { port = readyPort; resolveStart(readyPort); }
      };
      const timer = setTimeout(() => finish(new Error('数据库浏览工具启动超时。')), 15000);
      process_.stdout.on('data', data => {
        output += data.toString('utf8');
        if (Buffer.byteLength(output) > 8192) return finish(new Error('数据库浏览工具启动失败。'));
        const newline = output.indexOf('\n');
        if (newline < 0) return;
        try {
          const state = JSON.parse(output.slice(0, newline));
          if (!state.ready || state.version !== '0.8.2' || !Number.isInteger(state.port) || state.port < 1 || state.port > 65535) throw new Error();
          finish(null, state.port);
        } catch { finish(new Error('数据库浏览工具启动失败。')); }
      });
      process_.on('error', () => finish(new Error('数据库浏览工具无法启动，请检查安装。')));
      process_.on('exit', () => {
        if (child === process_) { child = undefined; port = undefined; }
        finish(new Error('数据库浏览工具未能启动。'));
      });
    }).finally(() => { starting = undefined; });
    return starting;
  }

  async function proxy(req, res) {
    if (!databasePath) return reply(res, 503, '内存数据库不提供高级浏览，请使用管理员业务页面。');
    if (!req.url?.startsWith('/') || req.url.startsWith('//')) return reply(res, 400, '请求地址无效。');
    let target;
    try { target = new URL(req.url, 'http://localhost'); } catch { return reply(res, 400, '请求地址无效。'); }
    if (target.pathname !== prefix && !target.pathname.startsWith(prefix + '/')) return reply(res, 404, '数据库浏览页面不存在。');
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) return reply(res, 405, '该操作不受支持。');
    // A normal page loads several stylesheets and scripts concurrently.
    if (active >= 16) return reply(res, 429, '数据库浏览正在处理其他请求，请稍后重试。');
    active += 1;
    try {
      const body = [];
      let size = 0;
      for await (const part of req) {
        size += part.length;
        if (size > maximumBody) return reply(res, 413, '查询内容过大。');
        body.push(part);
      }
      const readyPort = await start();
      if (res.destroyed) return;
      const payload = Buffer.concat(body);
      await new Promise(resolveProxy => {
        const headers = { host: `127.0.0.1:${readyPort}`, 'accept-encoding': 'identity', 'content-length': payload.length };
        for (const key of ['content-type', 'accept', 'sec-fetch-site']) if (typeof req.headers[key] === 'string') headers[key] = req.headers[key];
        const upstream = http.request({ hostname: '127.0.0.1', port: readyPort, path: target.pathname + target.search, method: req.method, headers }, response => {
          const chunks = [];
          let bytes = 0;
          response.on('data', part => {
            bytes += part.length;
            if (bytes > maximumResponse) { upstream.destroy(); reply(res, 413, '结果过大，请缩小查询范围。'); resolveProxy(); }
            else chunks.push(part);
          });
          response.on('error', () => { reply(res, 502, '数据库浏览暂时不可用。'); resolveProxy(); });
          response.on('end', () => {
            if (res.headersSent || res.destroyed) return resolveProxy();
            const responseHeaders = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN', 'referrer-policy': 'no-referrer' };
            for (const key of ['content-type', 'content-disposition']) if (typeof response.headers[key] === 'string') responseHeaders[key] = response.headers[key];
            if (response.headers.location) {
              const location = new URL(response.headers.location, `http://127.0.0.1:${readyPort}`);
              if (location.origin !== `http://127.0.0.1:${readyPort}` || (location.pathname !== prefix && !location.pathname.startsWith(prefix + '/'))) { reply(res, 502, '数据库浏览重定向无效。'); return resolveProxy(); }
              responseHeaders.location = location.pathname + location.search;
            }
            res.writeHead(response.statusCode || 502, responseHeaders);
            res.end(Buffer.concat(chunks));
            resolveProxy();
          });
        });
        const disconnected = () => { if (!res.writableEnded) upstream.destroy(); };
        res.once('close', disconnected);
        upstream.on('close', () => res.off('close', disconnected));
        upstream.setTimeout(12000, () => upstream.destroy(new Error('timeout')));
        upstream.on('error', () => { reply(res, 502, '数据库浏览暂时不可用，请稍后重试。'); resolveProxy(); });
        upstream.end(payload);
      });
    } catch {
      reply(res, 503, '数据库浏览工具尚未就绪，请运行 node scripts/install-admin-database.js 后重试。');
    } finally { active -= 1; }
  }

  return { proxy, close };
}
