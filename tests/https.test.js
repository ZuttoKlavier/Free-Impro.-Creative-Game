import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpsRequest } from 'node:https';
import { X509Certificate } from 'node:crypto';
import { prepareCertificates, certificateHosts } from '../scripts/https-certificates.js';
import { startLanServer } from '../server/lan.js';

const dir = mkdtempSync(join(tmpdir(), 'free-impro-https-'));
const certDirectory = join(dir, 'certs'), distDirectory = join(dir, 'dist');
test.after(() => rmSync(dir, { recursive: true, force: true }));
const config = prepareCertificates({ directory: certDirectory, hosts: ['127.0.0.1', 'localhost'] });
const ca = readFileSync(join(certDirectory, 'classroom-ca.crt'));
mkdirSync(join(distDirectory, 'assets'), { recursive: true });
writeFileSync(join(distDirectory, 'index.html'), '<!doctype html><title>classroom</title>');
writeFileSync(join(distDirectory, 'sw.js'), '/* worker */');
writeFileSync(join(distDirectory, 'assets/app-123.js'), '/* app */');
writeFileSync(join(distDirectory, '.env'), 'private configuration');
writeFileSync(join(distDirectory, 'server.key'), 'private key');
if (process.platform !== 'win32') symlinkSync(join(certDirectory, 'config.json'), join(distDirectory, 'leaked.js'));

function getHTTPS(origin, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(origin + path, { ca, ...options }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end(options.body);
  });
}
async function fixture(t) {
  const app = await startLanServer({ certDirectory, distDirectory, dbPath: ':memory:', port: 0, setupPort: 0, bind: '127.0.0.1' });
  t.after(() => app.close()); return app;
}

test('certificate setup validates SANs and preserves the trusted CA when addresses change', () => {
  assert.throws(() => certificateHosts(['https://192.168.1.2:8443']));
  assert.throws(() => certificateHosts(['valid.local\nCA:TRUE']));
  const leaf = new X509Certificate(readFileSync(join(certDirectory, 'server.crt')));
  assert.equal(leaf.checkIP('127.0.0.1'), '127.0.0.1'); assert.equal(leaf.checkHost('localhost'), 'localhost');
  assert.equal(leaf.verify(new X509Certificate(ca).publicKey), true);
  const revised = prepareCertificates({ directory: certDirectory, hosts: ['127.0.0.1', 'localhost', '192.168.1.23'] });
  assert.equal(revised.caFingerprint, config.caFingerprint);
  assert.equal(new X509Certificate(readFileSync(join(certDirectory, 'server.crt'))).checkIP('192.168.1.23'), '192.168.1.23');
});

test('production HTTPS verifies its certificate, serves only build files, and keeps API errors separate', async t => {
  const app = await fixture(t), origin = app.classroomUrl.slice(0, -1);
  assert.equal((await getHTTPS(origin, '/')).status, 200);
  assert.equal((await getHTTPS(origin, '/?class=123456')).status, 200);
  assert.equal((await getHTTPS(origin, '/sw.js')).headers['cache-control'], 'no-cache');
  assert.match((await getHTTPS(origin, '/assets/app-123.js')).headers['cache-control'], /immutable/);
  for (const path of ['/.env', '/server.key', '/data/classroom.sqlite', '/connection/classroom-ca.key', '/%2e%2e/data/https/server.key', '/src/main.js', '/leaked.js']) assert.equal((await getHTTPS(origin, path)).status, 404, path);
  const me = await getHTTPS(origin, '/api/me'); assert.equal(me.status, 401); assert.match(me.headers['content-type'], /application\/json/);
  const mcp = await getHTTPS(origin, '/mcp/images', { method: 'POST', body: '{}' }); assert.equal(mcp.status, 401); assert.match(mcp.headers['content-type'], /application\/json/);
  assert.equal((await getHTTPS(origin, '/', { servername: 'localhost', headers: { Host: 'unrelated.example' } })).status, 421);
  assert.equal((await getHTTPS(origin, '/', { method: 'POST' })).status, 405);
});

test('HTTP setup exposes only instructions and the public CA; HTTPS account cookies are Secure', async t => {
  const app = await fixture(t), origin = app.classroomUrl.slice(0, -1);
  const setup = await fetch(app.setupUrl); assert.equal(setup.status, 200); assert.match(await setup.text(), /CA 证书/);
  assert.equal(await (await fetch(app.setupUrl + 'connection/ca.crt')).text(), ca.toString());
  for (const path of ['api/health', 'api/register', 'assets/app-123.js', 'data/https/classroom-ca.key']) assert.equal((await fetch(app.setupUrl + path)).status, 404);
  assert.equal((await fetch(app.setupUrl + 'api/register', { method: 'POST', body: '{}' })).status, 405);
  const data = JSON.stringify({ username: 'https_teacher', password: 'password123', name: '老师', role: 'teacher' });
  const wrong = await getHTTPS(origin, '/api/register', { method: 'POST', headers: { Origin: origin.replace('https:', 'http:'), 'Content-Type': 'application/json' }, body: data });
  assert.equal(wrong.status, 403);
  const registered = await getHTTPS(origin, '/api/register', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: data });
  assert.equal(registered.status, 200); assert.match(registered.headers['set-cookie'][0], /; Secure/);
  const cookie = registered.headers['set-cookie'][0].split(';')[0];
  assert.equal((await getHTTPS(origin, '/api/me', { headers: { Cookie: cookie } })).status, 200);
  const info = JSON.parse((await getHTTPS(origin, '/connection.json')).text);
  assert.equal(info.classroomUrl, app.classroomUrl);
  assert.match((await getHTTPS(origin, '/connection')).text, /测试麦克风权限/);
});
