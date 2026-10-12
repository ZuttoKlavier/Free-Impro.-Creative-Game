import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp, canSaveLocalImageToken } from '../server/app.js';
import { openImageBridge } from '../scripts/image-mcp.js';

async function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'empvc-local-bridge-'));
  const dbPath = join(root, 'data/classroom.sqlite');
  const tokenFile = join(root, 'data/image-mcp/teacher.token');
  let now = Date.now();
  const app = createApp({ dbPath, imageTokenFile: tokenFile, imageNow: () => now });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  t.after(async () => { app.server.closeAllConnections(); await new Promise(r => app.server.close(r)); app.db.close(); rmSync(root, { recursive: true, force: true }); });
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const client = role => {
    let cookie = '';
    return async (path, data, overrideOrigin = origin) => {
      const response = await fetch(origin + '/api/' + role + path, { method: data ? 'POST' : 'GET', headers: { Origin: overrideOrigin, Cookie: cookie, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, data: await response.json() };
    };
  };
  const register = async role => { const c = client(role); await c('/register', { username: 'test_' + randomUUID().slice(0, 8), name: '配置测试', password: 'password123', role }); return c; };
  return { root, dbPath, tokenFile, client, register, advance: () => { now += 86400001; } };
}

test('a signed-in teacher saves a scoped token for the real local bridge without marking it connected', async t => {
  const f = await setup(t), teacher = await f.register('teacher');
  assert.equal((await teacher('/image-mcp-connection')).data.canSaveLocally, true);
  const { token } = (await teacher('/image-mcp-token', {})).data;
  const saved = await teacher('/image-mcp-save-local', { token });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.saved, true);
  assert.equal(saved.data.state, 'waiting');
  assert.equal(saved.data.lastToolAt, null);
  assert.equal(JSON.stringify(saved.data).includes(token), false);
  assert.equal(readFileSync(f.tokenFile, 'utf8'), token);
  if (process.platform !== 'win32') assert.equal(statSync(f.tokenFile).mode & 0o777, 0o600);
  const bridge = openImageBridge({ dbPath: f.dbPath, tokenFile: f.tokenFile });
  try { assert.equal(bridge.workflow.connectionStatus(bridge.user).state, 'waiting'); } finally { await bridge.close(); }
});

test('anonymous, student, cross-teacher and cross-origin saves cannot replace the configured credential', async t => {
  const f = await setup(t), teacher = await f.register('teacher'), student = await f.register('student'), other = await f.register('teacher');
  const { token } = (await teacher('/image-mcp-token', {})).data;
  await teacher('/image-mcp-save-local', { token });
  assert.equal((await f.client('teacher')('/image-mcp-save-local', { token })).status, 401);
  assert.equal((await student('/image-mcp-save-local', { token })).status, 403);
  assert.equal((await other('/image-mcp-save-local', { token })).status, 403);
  assert.equal((await teacher('/image-mcp-save-local', { token }, 'https://other.example')).status, 403);
  assert.equal((await teacher('/image-mcp-save-local', { token, path: join(f.root, 'unwanted') })).status, 400);
  assert.equal(readFileSync(f.tokenFile, 'utf8'), token);
  f.advance();
  assert.equal((await teacher('/image-mcp-save-local', { token })).status, 401);
  assert.equal(readFileSync(f.tokenFile, 'utf8'), token);
});

test('an unsafe destination fails without changing a file or issuing another teacher token', async t => {
  const f = await setup(t), teacher = await f.register('teacher');
  const { token } = (await teacher('/image-mcp-token', {})).data;
  mkdirSync(join(f.root, 'data/image-mcp'));
  const target = join(f.root, 'retain'); writeFileSync(target, 'retain-me'); symlinkSync(target, f.tokenFile);
  const failed = await teacher('/image-mcp-save-local', { token });
  assert.equal(failed.status, 500);
  assert.equal(JSON.stringify(failed.data).includes(token), false);
  assert.equal(JSON.stringify(failed.data).includes(f.root), false);
  assert.equal(readFileSync(target, 'utf8'), 'retain-me');
  rmSync(f.tokenFile);
  assert.equal((await teacher('/image-mcp-save-local', { token })).status, 200);
});

test('local saving requires a loopback socket and local host, independent of forwarding headers', () => {
  const req = (remoteAddress, host, forwarded = '127.0.0.1') => ({ socket: { remoteAddress }, headers: { host, 'x-forwarded-for': forwarded } });
  assert.equal(canSaveLocalImageToken(req('127.0.0.1', 'localhost:8443')), true);
  assert.equal(canSaveLocalImageToken(req('::ffff:127.0.0.1', '127.0.0.1:8443')), true);
  assert.equal(canSaveLocalImageToken(req('::1', '[::1]:8443')), true);
  assert.equal(canSaveLocalImageToken(req('192.0.2.5', 'localhost:8443')), false);
  assert.equal(canSaveLocalImageToken(req('127.0.0.1', 'teacher.example:8443')), false);
});
