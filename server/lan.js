import { createServer as createHTTPS } from 'node:https';
import { createServer as createHTTP } from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { X509Certificate, createPrivateKey } from 'node:crypto';
import { isIP } from 'node:net';
import { createApp } from './app.js';
import { connectionPage } from './connection-page.js';

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };
const urlHost = host => isIP(host) === 6 ? `[${host}]` : host;
function staticFiles(directory, prefix = '') {
  const files = new Map();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name), url = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) for (const pair of staticFiles(path, url)) files.set(...pair);
    else if (entry.isFile() && contentTypes[extname(entry.name)]) files.set(url, { body: readFileSync(path), type: contentTypes[extname(entry.name)] });
  }
  return files;
}

export async function startLanServer({ certDirectory = 'data/https', distDirectory = 'dist', dbPath = 'data/classroom.sqlite', port = 8443, setupPort = 8080, bind = '0.0.0.0' } = {}) {
  const dir = resolve(certDirectory);
  if (!existsSync(join(dir, 'config.json'))) throw new Error('尚未准备 HTTPS 证书，请先运行 npm run setup:https。');
  if (!existsSync(join(distDirectory, 'index.html'))) throw new Error('尚未生成课堂页面，请先运行 npm run build。');
  const config = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
  const key = readFileSync(join(dir, 'server.key')), cert = readFileSync(join(dir, 'server.crt')), ca = readFileSync(join(dir, 'classroom-ca.crt'));
  const certificate = new X509Certificate(cert), authority = new X509Certificate(ca);
  if (Date.parse(certificate.validTo) <= Date.now() || !certificate.verify(authority.publicKey) || !certificate.checkPrivateKey(createPrivateKey(key))) throw new Error('课堂证书已过期或不匹配，请重新运行 npm run setup:https。');
  if (!config.hosts.includes(config.preferredHost) || config.hosts.some(host => !(isIP(host) ? certificate.checkIP(host) : certificate.checkHost(host)))) throw new Error('课堂地址与证书不匹配，请重新运行 npm run setup:https。');
  const files = staticFiles(resolve(distDirectory));
  const app = createApp({ dbPath, secureCookies: true });
  const api = app.server.listeners('request')[0];
  let securePage, setupPage, connection;
  function serve(secure, req, res) {
    const send = (status, body, type = 'text/plain; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) }); res.end(req.method === 'HEAD' ? undefined : body); };
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    if (!securePage || !setupPage) { send(503, '课堂正在启动，请稍后刷新。'); return; }
    let url;
    try { url = new URL(req.url, `${secure ? 'https' : 'http'}://${req.headers.host}`); } catch { send(400, '无效地址'); return; }
    if (!config.hosts.includes(url.hostname.replace(/^\[|\]$/g, ''))) { send(421, '请使用启动终端提供的课堂地址。'); return; }
    if (secure && (url.pathname.startsWith('/api/') || url.pathname === '/mcp/images')) { api(req, res); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { send(405, '不支持的操作'); return; }
    if (url.pathname === '/connection/ca.crt') { res.setHeader('Content-Disposition', 'attachment; filename="classroom-ca.crt"'); send(200, ca, 'application/x-x509-ca-cert'); return; }
    if (url.pathname === '/connection' || (!secure && url.pathname === '/')) { send(200, secure ? securePage : setupPage, 'text/html; charset=utf-8'); return; }
    if (!secure) { send(404, '此端口仅用于课堂证书和连接指引。请通过 HTTPS 访问课堂。'); return; }
    if (url.pathname === '/connection.json') { send(200, JSON.stringify(connection), 'application/json'); return; }
    const file = files.get(url.pathname === '/' ? '/index.html' : url.pathname);
    if (!file) { send(404, '页面不存在'); return; }
    res.setHeader('Cache-Control', url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    send(200, file.body, file.type);
  }
  const server = createHTTPS({ key, cert, minVersion: 'TLSv1.2' }, (req, res) => serve(true, req, res));
  const setupServer = createHTTP((req, res) => serve(false, req, res));
  for (const item of [server, setupServer]) { item.requestTimeout = 15000; item.headersTimeout = 15000; }
  const listen = (item, number) => new Promise((resolve, reject) => { item.once('error', reject); item.listen(number, bind, () => { item.removeListener('error', reject); resolve(); }); });
  let closed = false;
  const close = async () => {
    if (closed) return; closed = true;
    await Promise.all([server, setupServer].map(item => new Promise(resolve => { if (!item.listening) return resolve(); item.close(resolve); item.closeAllConnections(); })));
    app.db.close();
  };
  try {
    // Zero ports are reserved for isolated tests; until pages are ready, return 503.
    await listen(server, port); await listen(setupServer, setupPort);
    connection = { classroomUrl: `https://${urlHost(config.preferredHost)}:${server.address().port}/`, setupUrl: `http://${urlHost(config.preferredHost)}:${setupServer.address().port}/`, hosts: config.hosts };
    [securePage, setupPage] = await Promise.all([true, false].map(secure => connectionPage({ ...connection, fingerprint: authority.fingerprint256, secure })));
    return { ...connection, server, setupServer, close, caFingerprint: authority.fingerprint256 };
  } catch (error) { await close(); throw error; }
}
