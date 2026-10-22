import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { createApp } from '../server/app.js';

const password = 'NativeStudentTest123!';
const sha = value => createHash('sha256').update(value).digest('hex');
const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };
const wechatEnv = { WECHAT_APP_ID: 'native-test-wechat', WECHAT_APP_SECRET: 'native-test-secret' };

async function setup(t, { env = wechatEnv, secureCookies = true } = {}) {
  const app = createApp({ dbPath: ':memory:', secureCookies, studentAuthOptions: { env } });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  const target = 'http://127.0.0.1:' + app.server.address().port;
  const origin = secureCookies ? 'https://login.example.com' : target;
  t.after(async () => { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.db.close(); });
  function client(native = true) {
    const cookies = new Map();
    async function request(role, path, data, extra = {}) {
      const response = await new Promise((resolve, reject) => {
        const outgoing = httpRequest(target + '/api/' + role + path, { method: data === undefined ? 'GET' : 'POST', headers: { Host: new URL(origin).host, Origin: origin, Cookie: [...cookies].map(([name, value]) => name + '=' + value).join('; '), 'Content-Type': 'application/json', 'User-Agent': native ? 'FreeImproStudent/1 iOS' : 'NativeAuthTestBrowser/1', ...extra.headers } }, incoming => {
          const chunks = []; incoming.on('data', chunk => chunks.push(chunk)); incoming.on('end', () => {
            const headers = new Headers(); for (const [name, value] of Object.entries(incoming.headers)) for (const item of [].concat(value || [])) headers.append(name, item);
            resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers }));
          });
        });
        outgoing.on('error', reject); outgoing.end(data === undefined ? undefined : typeof data === 'string' ? data : JSON.stringify(data));
      });
      for (const cookie of response.headers.getSetCookie()) { const [name, ...value] = cookie.split(';')[0].split('='); if (value.join('=')) cookies.set(name, value.join('=')); else cookies.delete(name); }
      const text = await response.text();
      return { status: response.status, data: response.headers.get('content-type')?.includes('json') && text ? JSON.parse(text) : text, location: response.headers.get('location'), cookies: response.headers.getSetCookie() };
    }
    return { student: (path, data, extra) => request('student', path, data, extra), teacher: (path, data, extra) => request('teacher', path, data, extra), cookies };
  }
  return { ...app, origin, client, path: url => url.replace(origin + '/api/student', '') };
}

function mockWechat(t, { subject = 'native-subject', block } = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url || input.toString());
    if (url.hostname !== 'api.weixin.qq.com') return original(input, init);
    if (url.pathname.endsWith('/access_token')) {
      if (block) await block();
      return Response.json({ access_token: 'native-mock-token', expires_in: 7200, refresh_token: 'native-mock-refresh', openid: subject, scope: 'snsapi_login' });
    }
    return Response.json({ openid: subject, unionid: subject, nickname: '原生平台同学' });
  };
  t.after(() => { globalThis.fetch = original; });
}

async function start(native, provider = 'wechat', mode = 'login') {
  const proof = pkce();
  const result = await native.student('/account/native/start', { provider, mode, codeChallenge: proof.challenge });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.match(result.data.handoffId, /^[a-f0-9]{64}$/);
  const url = new URL(result.data.browserURL);
  assert.equal(url.pathname, '/api/student/account/native/open');
  assert.deepEqual([...url.searchParams], [['handoffId', result.data.handoffId]]);
  assert.equal(result.cookies.length, 0, 'Starting must not disclose or install any browser/library credential');
  assert.deepEqual(Object.keys(result.data).sort(), ['browserURL', 'handoffId']);
  return { ...result.data, ...proof };
}

async function browserFinish(app, browser, flow) {
  const opened = await browser.student(app.path(flow.browserURL));
  assert.equal(opened.status, 303, JSON.stringify(opened.data));
  const authorize = new URL(opened.location);
  const result = await browser.student('/auth/callback/wechat?state=' + authorize.searchParams.get('state') + '&code=mock-native-code');
  assert.equal(result.status, 302, JSON.stringify(result.data));
  assert.match(result.location, /account\/finish\?intent=/);
  const finished = await browser.student(app.path(result.location));
  assert.equal(finished.status, 303, JSON.stringify(finished.data));
  const callback = new URL(finished.location);
  assert.equal(callback.protocol, 'freeimprostudent:'); assert.equal(callback.hostname, 'auth'); assert.equal(callback.pathname, '/callback');
  assert.deepEqual([...callback.searchParams.keys()], ['ticket']);
  const ticket = callback.searchParams.get('ticket'); assert.match(ticket, /^[a-f0-9]{64}$/);
  assert.equal(finished.cookies.some(cookie => cookie.includes('fi_session_student=')), false, 'System browser must not gain a classroom session');
  return { ticket, opened, finished };
}

async function register(device, username = 'native_account') {
  const response = await device.student('/account/register', { username, name: '原生账号学生', password });
  assert.equal(response.status, 200, JSON.stringify(response.data)); return response.data.user;
}

async function guest(app, device) {
  const teacher = app.client(false);
  assert.equal((await teacher.teacher('/register', { username: 'native_teacher', name: '测试教师', password, role: 'teacher' })).status, 200);
  const room = (await teacher.teacher('/classrooms', { name: '原生授权课堂', capacity: 15, background: '教室' })).data.classroom;
  const result = await device.student('/enter-classroom', { name: '原课堂学生', code: room.code });
  assert.equal(result.status, 200); return { user: result.data.user, room };
}

test('native start exposes true platform availability and validates proof, method, role and origin', async t => {
  const app = await setup(t, { env: {} }), native = app.client();
  for (const provider of ['wechat', 'apple']) assert.equal((await native.student('/account/native/start', { provider, codeChallenge: pkce().challenge })).status, 503);
  for (const data of [{ provider: 'unknown', codeChallenge: pkce().challenge }, { provider: 'wechat', codeChallenge: 'short' }, { provider: 'wechat', codeChallenge: 'x'.repeat(43) }, { provider: 'wechat', mode: 'teacher', codeChallenge: pkce().challenge }]) assert.equal((await native.student('/account/native/start', data)).status, 400);
  assert.equal((await native.student('/account/native/start')).status, 405);
  assert.equal((await native.teacher('/account/native/start', { provider: 'wechat', codeChallenge: pkce().challenge })).status, 403);
  assert.equal((await native.student('/account/native/start', { provider: 'wechat', codeChallenge: pkce().challenge }, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await native.student('/auth/student-native-session', { grant: 'forged' })).status, 404, 'The private Better Auth session endpoint cannot be reached through HTTP');
  const local = await setup(t, { secureCookies: false });
  assert.equal((await local.client().student('/account/native/start', { provider: 'wechat', codeChallenge: pkce().challenge })).status, 503);
});

test('Apple callbacks reject browser intents and handoffs started for another provider before token exchange', async t => {
  const app = await setup(t), browser = app.client(false), native = app.client();
  const originalFetch = globalThis.fetch;
  let providerRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url || input.toString());
    if (['appleid.apple.com', 'api.weixin.qq.com'].includes(url.hostname)) { providerRequests++; throw new Error('Unexpected provider exchange'); }
    return originalFetch(input, init);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const browserStart = await browser.student('/account/social/start', { provider: 'wechat' });
  assert.equal(browserStart.status, 200, JSON.stringify(browserStart));
  const webState = new URL(browserStart.data.url).searchParams.get('state');
  const webRejected = await browser.student('/auth/callback/apple', new URLSearchParams({ code: 'forged-apple-code', state: webState }).toString(), { headers: { Origin: 'https://appleid.apple.com', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'FreeImproStudent/1 iOS' } });
  assert.equal(webRejected.status, 403); assert.match(webRejected.data.error, /iPhone\/iPad/);
  const flow = await start(native, 'wechat'), systemBrowser = app.client(false);
  const opened = await systemBrowser.student(app.path(flow.browserURL));
  assert.equal(opened.status, 303, JSON.stringify(opened));
  const nativeState = new URL(opened.location).searchParams.get('state');
  const nativeRejected = await systemBrowser.student('/auth/callback/apple?code=forged-apple-code&state=' + nativeState);
  assert.equal(nativeRejected.status, 403); assert.match(nativeRejected.data.error, /iPhone\/iPad/);
  assert.equal(providerRequests, 0, 'An unrelated intent never reaches either provider');
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_user').get().n, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_session').get().n, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
});

test('native WeChat handoff preserves guest UUID and classroom; independent browser never gets a classroom session', async t => {
  mockWechat(t);
  const app = await setup(t), native = app.client(), browser = app.client(false);
  const previous = await guest(app, native), flow = await start(native);
  const completed = await browserFinish(app, browser, flow);
  assert.equal((await browser.student('/me')).status, 401);
  assert.equal((await browser.student(app.path(flow.browserURL))).status, 403, 'Browser bootstrap is one use');
  const wrong = await native.student('/account/native/consume', { ticket: completed.ticket, codeVerifier: pkce().verifier });
  assert.equal(wrong.status, 403); assert.equal(wrong.cookies.length, 0);
  const stranger = app.client();
  assert.equal((await stranger.student('/account/native/consume', { ticket: completed.ticket, codeVerifier: flow.verifier })).status, 409, 'Correct proof still requires the original guest session');
  const consumed = await native.student('/account/native/consume', { ticket: completed.ticket, codeVerifier: flow.verifier });
  assert.equal(consumed.status, 200, JSON.stringify(consumed.data)); assert.equal(consumed.data.user.id, previous.user.id);
  assert.equal(consumed.data.user.role, 'student');
  assert.ok(consumed.cookies.some(cookie => cookie.includes('fi_session_student=') && cookie.includes('HttpOnly')));
  assert.ok(consumed.cookies.some(cookie => cookie.includes('fi_student_auth.session_token=') && cookie.includes('HttpOnly')));
  assert.deepEqual(Object.keys(consumed.data), ['user']);
  assert.equal((await native.student('/classrooms')).data.classrooms[0].id, previous.room.id);
  assert.equal((await native.student('/account/options')).data.account.providers.includes('wechat'), true);
  assert.equal((await browser.student('/me')).status, 401);
  assert.equal((await native.student('/account/native/consume', { ticket: completed.ticket, codeVerifier: flow.verifier })).status, 403);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_native_handoffs').get().n, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_intents').get().n, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_session').get().n, 1, 'Browser session is destroyed after native transfer');
  const next = app.client(), nextBrowser = app.client(false), nextFlow = await start(next), nextCompleted = await browserFinish(app, nextBrowser, nextFlow);
  const returned = await next.student('/account/native/consume', { ticket: nextCompleted.ticket, codeVerifier: nextFlow.verifier });
  assert.equal(returned.status, 200); assert.equal(returned.data.user.id, previous.user.id);
});

test('native linking delegates original library identity despite unrelated browser cookies', async t => {
  mockWechat(t, { subject: 'native-linked-subject' });
  const app = await setup(t), native = app.client(), browser = app.client(false);
  const original = await register(native), unrelated = await register(browser, 'unrelated_browser');
  assert.notEqual(original.id, unrelated.id);
  const flow = await start(native, 'wechat', 'link'), completed = await browserFinish(app, browser, flow);
  const consumed = await native.student('/account/native/consume', { ticket: completed.ticket, codeVerifier: flow.verifier });
  assert.equal(consumed.status, 200, JSON.stringify(consumed.data)); assert.equal(consumed.data.user.id, original.id);
  const options = (await native.student('/account/options')).data;
  assert.ok(options.account.providers.includes('credential')); assert.ok(options.account.providers.includes('wechat'));
  const unrelatedId = app.db.prepare('SELECT auth_user_id FROM student_auth_links WHERE student_id=?').get(unrelated.id).auth_user_id;
  assert.equal(app.db.prepare("SELECT COUNT(*) n FROM student_auth_account WHERE userId=? AND providerId='wechat'").get(unrelatedId).n, 0);
  assert.equal((await browser.student('/me')).data.user.id, unrelated.id, 'The unrelated browser classroom session is not changed');
  const invalid = app.client();
  assert.equal((await invalid.student('/account/native/start', { provider: 'wechat', mode: 'link', codeChallenge: pkce().challenge })).status, 401);
});

test('native cancellation invalidates pending, browser and completed handoffs; incorrect proof cannot cancel', async t => {
  mockWechat(t);
  for (const stage of ['pending', 'browser', 'callback', 'ready']) await t.test(stage, async sub => {
    const app = await setup(sub), native = app.client(), browser = app.client(false), flow = await start(native);
    let opened, completed;
    if (['browser', 'callback'].includes(stage)) { opened = await browser.student(app.path(flow.browserURL)); assert.equal(opened.status, 303); }
    if (stage === 'callback') {
      const result = await browser.student('/auth/callback/wechat?state=' + new URL(opened.location).searchParams.get('state') + '&code=completed-before-cancel');
      assert.equal(result.status, 302); assert.match(result.location, /account\/finish/);
    }
    if (stage === 'ready') completed = await browserFinish(app, browser, flow);
    assert.equal((await native.student('/account/native/cancel', { handoffId: flow.handoffId, codeVerifier: pkce().verifier })).status, 403);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_native_handoffs').get().n, 1);
    const cancelled = await native.student('/account/native/cancel', { handoffId: flow.handoffId, codeVerifier: flow.verifier });
    assert.equal(cancelled.status, 200); assert.equal(cancelled.data.cancelled, true);
    assert.equal((await browser.student(app.path(flow.browserURL))).status, 403);
    if (completed) assert.equal((await native.student('/account/native/consume', { ticket: completed.ticket, codeVerifier: flow.verifier })).status, 403);
    if (opened) assert.equal((await browser.student('/auth/callback/wechat?state=' + new URL(opened.location).searchParams.get('state') + '&code=cancelled-code')).status, 403);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_native_handoffs').get().n, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_intents').get().n, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_session').get().n, 0);
    assert.equal((await native.student('/account/native/cancel', { handoffId: flow.handoffId, codeVerifier: flow.verifier })).status, 200, 'Cancellation is safely repeatable');
  });
});

test('expired handoffs and revoked browser verification cannot mint native cookies', async t => {
  mockWechat(t);
  for (const stage of ['pending-expiry', 'ready-expiry', 'library-revoked']) await t.test(stage, async sub => {
    const app = await setup(sub), native = app.client(), browser = app.client(false), flow = await start(native);
    const completed = stage !== 'pending-expiry' ? await browserFinish(app, browser, flow) : null;
    if (stage === 'library-revoked') app.db.prepare('DELETE FROM student_auth_session').run();
    else app.db.prepare('UPDATE student_auth_native_handoffs SET expires=0').run();
    const result = completed ? await native.student('/account/native/consume', { ticket: completed.ticket, codeVerifier: flow.verifier }) : await browser.student(app.path(flow.browserURL));
    assert.equal(result.status, stage === 'library-revoked' ? 401 : 403); assert.equal(result.cookies.length, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_links').get().n, 0);
    assert.equal((await native.student('/me')).status, 401);
  });
});

test('guest sign-out cancels a ready native handoff and library sessions before consume', async t => {
  mockWechat(t);
  const app = await setup(t), native = app.client(), browser = app.client(false);
  const previous = await guest(app, native), flow = await start(native), completed = await browserFinish(app, browser, flow);
  assert.equal((await native.student('/logout', {})).status, 200);
  assert.equal((await native.student('/account/native/consume', { ticket: completed.ticket, codeVerifier: flow.verifier })).status, 403);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_native_handoffs').get().n, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_session').get().n, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(previous.user.id).n, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_links WHERE student_id=?').get(previous.user.id).n, 0);
});

test('sign-out during native OAuth token exchange prevents provider binding and fresh library sessions', { timeout: 15000 }, async t => {
  let release, began;
  const blocked = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { began = resolve; });
  mockWechat(t, { subject: 'cancelled-link-subject', block: async () => { began(); await blocked; } });
  t.after(() => release());
  const app = await setup(t), native = app.client(), browser = app.client(false), original = await register(native);
  const flow = await start(native, 'wechat', 'link'), opened = await browser.student(app.path(flow.browserURL));
  assert.equal(opened.status, 303);
  const pending = browser.student('/auth/callback/wechat?state=' + new URL(opened.location).searchParams.get('state') + '&code=blocked-code');
  await Promise.race([started, pending.then(result => assert.fail('Expected platform token exchange before callback: ' + JSON.stringify(result)))]);
  assert.equal((await native.student('/logout', {})).status, 200);
  release();
  const returned = await pending;
  assert.ok(!returned.location?.includes('/account/finish'), JSON.stringify(returned));
  const authId = app.db.prepare('SELECT auth_user_id FROM student_auth_links WHERE student_id=?').get(original.id).auth_user_id;
  assert.equal(app.db.prepare("SELECT COUNT(*) n FROM student_auth_account WHERE userId=? AND providerId='wechat'").get(authId).n, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_session WHERE userId=?').get(authId).n, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(original.id).n, 0);
});

test('two simultaneous native consumes produce exactly one session grant', async t => {
  mockWechat(t);
  const app = await setup(t), native = app.client(), browser = app.client(false), flow = await start(native), completed = await browserFinish(app, browser, flow);
  const results = await Promise.all([native.student('/account/native/consume', { ticket: completed.ticket, codeVerifier: flow.verifier }), native.student('/account/native/consume', { ticket: completed.ticket, codeVerifier: flow.verifier })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 403]);
  assert.equal(results.filter(result => result.cookies.some(cookie => cookie.includes('fi_session_student='))).length, 1);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 1);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_session').get().n, 1);
});

test('administrator revocation during the native library session write cannot restore cookies or identity', async t => {
  mockWechat(t);
  const app = await setup(t), native = app.client(), browser = app.client(false);
  const original = await register(native), flow = await start(native, 'wechat', 'link'), completed = await browserFinish(app, browser, flow);
  const authId = app.db.prepare('SELECT auth_user_id FROM student_auth_links WHERE student_id=?').get(original.id).auth_user_id;
  const prepare = app.db.prepare.bind(app.db);
  let revoked = false;
  app.db.prepare = sql => {
    const statement = prepare(sql);
    if (/insert into\s+["`]?student_auth_session/i.test(sql)) for (const method of ['get', 'all', 'run']) {
      const execute = statement[method].bind(statement);
      statement[method] = (...args) => {
        const result = execute(...args);
        if (!revoked) { revoked = true; queueMicrotask(() => { prepare('DELETE FROM sessions WHERE user_id=?').run(original.id); prepare('DELETE FROM student_auth_session WHERE userId=?').run(authId); prepare('DELETE FROM student_auth_intents WHERE student_id=?').run(original.id); }); }
        return result;
      };
    }
    return statement;
  };
  t.after(() => { app.db.prepare = prepare; });
  const result = await native.student('/account/native/consume', { ticket: completed.ticket, codeVerifier: flow.verifier });
  assert.equal(revoked, true, 'Revocation occurs while the library session creation is awaiting completion');
  assert.ok([401, 403].includes(result.status), JSON.stringify(result));
  assert.equal(result.cookies.length, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(original.id).n, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) n FROM student_auth_session WHERE userId=?').get(authId).n, 0);
  assert.equal((await native.student('/me')).status, 401);
});

test('Apple native linking verifies signed ID token and returns only a proof-bound native ticket', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'native-apple-provider-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const clientKeys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const keyPath = join(directory, 'AuthKey.p8'); writeFileSync(keyPath, clientKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = { APPLE_CLIENT_ID: 'native.test.apple.service', APPLE_TEAM_ID: 'TESTTEAM', APPLE_KEY_ID: 'NATIVECLIENTKEY', APPLE_PRIVATE_KEY_FILE: keyPath };
  const app = await setup(t, { env }), native = app.client(), browser = app.client(false), original = await register(native);
  const originalFetch = globalThis.fetch;
  let nonce, invalid = false;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url || input.toString());
    if (url.hostname !== 'appleid.apple.com') return originalFetch(input, init);
    if (url.pathname === '/auth/keys') return Response.json({ keys: [{ ...keys.publicKey.export({ format: 'jwk' }), kid: 'NATIVE_APPLE_TEST_KEY', alg: 'RS256', use: 'sig' }] });
    assert.equal(url.pathname, '/auth/token');
    const now = Math.floor(Date.now() / 1000);
    const inputJwt = encode({ alg: 'RS256', kid: 'NATIVE_APPLE_TEST_KEY' }) + '.' + encode({ iss: 'https://appleid.apple.com', aud: invalid ? 'forged.native.service' : env.APPLE_CLIENT_ID, sub: 'native-apple-subject', email: 'native.apple@example.com', email_verified: true, iat: now, exp: now + 600, nonce });
    return Response.json({ access_token: 'native-apple-access', token_type: 'Bearer', expires_in: 3600, refresh_token: 'native-apple-refresh', id_token: inputJwt + '.' + sign('RSA-SHA256', Buffer.from(inputJwt), keys.privateKey).toString('base64url') });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  async function appleFlow(mode) {
    const flow = await start(native, 'apple', mode), opened = await browser.student(app.path(flow.browserURL));
    assert.equal(opened.status, 303, JSON.stringify(opened));
    const authorize = new URL(opened.location); nonce = authorize.searchParams.get('nonce'); assert.ok(nonce);
    const post = await browser.student('/auth/callback/apple', new URLSearchParams({ code: 'native-apple-code', state: authorize.searchParams.get('state') }).toString(), { headers: { Origin: 'https://appleid.apple.com', 'Content-Type': 'application/x-www-form-urlencoded' } });
    assert.equal(post.status, 302, JSON.stringify(post));
    const authorized = await browser.student(app.path(post.location));
    return { flow, authorized };
  }
  const success = await appleFlow('link');
  assert.equal(success.authorized.status, 302); assert.match(success.authorized.location, /account\/finish/);
  const finished = await browser.student(app.path(success.authorized.location));
  assert.equal(finished.status, 303, JSON.stringify(finished)); assert.match(finished.location, /^freeimprostudent:\/\/auth\/callback\?ticket=[a-f0-9]{64}$/);
  const ticket = new URL(finished.location).searchParams.get('ticket');
  const consumed = await native.student('/account/native/consume', { ticket, codeVerifier: success.flow.verifier });
  assert.equal(consumed.status, 200, JSON.stringify(consumed)); assert.equal(consumed.data.user.id, original.id);
  assert.ok((await native.student('/account/options')).data.account.providers.includes('apple'));
  invalid = true;
  const rejected = await appleFlow('login');
  assert.match(rejected.authorized.location, /student_auth=error/);
  const record = app.db.prepare('SELECT ticket_digest FROM student_auth_native_handoffs WHERE digest=?').get(sha(rejected.flow.handoffId));
  assert.equal(record.ticket_digest, null, 'Invalid audience cannot obtain a native result ticket');
  assert.equal((await native.student('/account/native/cancel', { handoffId: rejected.flow.handoffId, codeVerifier: rejected.flow.verifier })).status, 200);
});
