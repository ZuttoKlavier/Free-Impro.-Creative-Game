import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { PNG } from 'pngjs';
import { createApp } from '../server/app.js';
import { appleClientSecret, normalizePhone } from '../server/student-auth.js';
import { aliyunSmsRequest } from '../server/student-sms.js';
import { IMAGE_PROJECT } from '../server/image-workflow.js';

const password = 'StudentTest123!';
const png = new PNG({ width: 32, height: 32 }); png.data.fill(150);
const photo = 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');
async function setup(t, options = {}) {
  const app = createApp({ dbPath: ':memory:', studentAuthOptions: { env: {}, ...options.studentAuthOptions }, ...options });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  const target = 'http://127.0.0.1:' + app.server.address().port;
  const origin = options.secureCookies ? 'https://login.example.com' : target;
  t.after(async () => { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.db.close(); });
  function client(shared = new Map()) {
    const request = async (role, path, data, extra = {}) => {
      const response = await new Promise((resolve, reject) => {
        const request = httpRequest(target + '/api/' + role + path, { method: data === undefined ? 'GET' : 'POST', headers: { Host: new URL(origin).host, Origin: origin, Cookie: [...shared].map(([name, value]) => name + '=' + value).join('; '), 'Content-Type': 'application/json', ...extra.headers } }, incoming => {
          const chunks = []; incoming.on('data', chunk => chunks.push(chunk)); incoming.on('end', () => {
            const headers = new Headers(); for (const [name, value] of Object.entries(incoming.headers)) for (const item of [].concat(value || [])) headers.append(name, item);
            resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers }));
          });
        });
        request.on('error', reject); request.end(data === undefined ? undefined : typeof data === 'string' ? data : JSON.stringify(data));
      });
      for (const cookie of response.headers.getSetCookie()) { const [name, ...value] = cookie.split(';')[0].split('='); if (value.join('=')) shared.set(name, value.join('=')); else shared.delete(name); }
      const type = response.headers.get('content-type');
      const text = await response.text();
      return { status: response.status, data: text && type?.includes('json') ? JSON.parse(text) : text, location: response.headers.get('location'), cookies: response.headers.getSetCookie(), raw: response };
    };
    return { student: (path, data, extra) => request('student', path, data, extra), teacher: (path, data, extra) => request('teacher', path, data, extra), cookies: shared };
  }
  return { ...app, target, origin, client };
}
async function classroom(client) {
  assert.equal((await client.teacher('/register', { username: 'teacher_' + randomUUID().slice(0, 8), name: '测试教师', role: 'teacher', password })).status, 200);
  return (await client.teacher('/classrooms', { name: '登录验证课堂', capacity: 15, background: '教室' })).data.classroom;
}
async function register(client, username = 'test_student') {
  const result = await client.student('/account/register', { username, name: '测试学生', password });
  assert.equal(result.status, 200, JSON.stringify(result.data)); return result.data.user;
}

test('four login methods expose truthful availability; unconfigured providers cannot issue sessions', async t => {
  const { client, db } = await setup(t), guest = client();
  const result = await guest.student('/account/options');
  assert.equal(result.status, 200); assert.equal(result.data.password.enabled, true);
  for (const provider of ['wechat', 'apple', 'phone']) assert.equal(result.data[provider].enabled, false);
  assert.equal((await guest.student('/account/social/start', { provider: 'wechat' })).status, 503);
  const apple = await guest.student('/account/social/start', { provider: 'apple' });
  assert.equal(apple.status, 403); assert.match(apple.data.error, /iPhone\/iPad/);
  assert.equal((await guest.student('/account/phone/send', { phoneNumber: '13800000000' })).status, 503);
  assert.equal((await guest.student('/auth/sign-up/email', { email: 'attacker@example.com', password, name: '攻击者' })).status, 404);
  assert.equal((await guest.student('/account/register', { username: 'bad_user', name: 'bad', password, role: 'teacher' }, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
});

test('guest upgrade, password login on another device and logout retain UUID, classroom, avatar, completed job and quota', async t => {
  const { client, db } = await setup(t), shared = client();
  const room = await classroom(shared);
  const old = (await shared.student('/enter-classroom', { name: '原学生', code: room.code })).data.user;
  await shared.student('/image-profile/register', {});
  const requestId = randomUUID();
  assert.equal((await shared.student('/image-jobs', { requestId, classId: room.id, kind: 'identity', photo })).status, 201);
  await shared.teacher('/image-jobs/' + requestId + '/conversation', { projectUrl: IMAGE_PROJECT.url, conversationUrl: 'https://chatgpt.com/c/' + randomUUID() });
  assert.equal((await shared.teacher('/image-jobs/' + requestId + '/complete', { image: photo })).status, 200);
  const upgraded = await register(shared);
  assert.equal(upgraded.id, old.id);
  assert.equal((await shared.student('/login', { username: 'test_student', password })).status, 409, 'A linked student must not bypass the library password verifier');
  const status = (await shared.student('/image-status')).data;
  assert.equal(status.hasAvatar, true); assert.equal(status.remaining, 0);
  assert.equal((await shared.student('/enter-classroom', { name: '另一名字', code: room.code })).data.user.id, old.id);
  assert.equal((await shared.student('/logout', {})).status, 200);
  assert.equal((await shared.student('/me')).status, 401);
  assert.equal((await shared.teacher('/me')).status, 200, 'Student sign out preserves the teacher cookie');
  const otherDevice = client();
  assert.equal((await otherDevice.student('/account/login', { username: 'test_student', password: 'WrongPassword' })).status, 401);
  assert.equal((await otherDevice.student('/account/login', { username: 'TEST_STUDENT', password })).data.user.id, old.id);
  assert.equal((await otherDevice.student('/image-status')).data.remaining, 0);
  assert.equal((await otherDevice.student('/classrooms')).data.classrooms[0].id, room.id);
  assert.equal((await otherDevice.student('/image-jobs')).data.jobs[0].id, requestId);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_profiles').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_auth_links').get().n, 1);
});

test('legacy student password migrates only after verification; teacher roles cannot enter student auth', async t => {
  const { client, db } = await setup(t), old = client();
  const user = (await old.student('/register', { username: 'legacy_student', name: '旧学生', password, role: 'student' })).data.user;
  await old.student('/logout', {});
  assert.equal((await old.student('/account/login', { username: 'legacy_student', password: 'WrongPassword' })).status, 401);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_auth_links').get().n, 0);
  assert.equal((await old.student('/account/login', { username: 'legacy_student', password })).data.user.id, user.id);
  assert.equal((await old.student('/account/options')).data.account.linked, true);
  const teacher = client(); await classroom(teacher);
  const teacherUser = (await teacher.teacher('/me')).data.user;
  assert.equal((await teacher.student('/account/login', { username: teacherUser.username, password })).status, 403);
  assert.equal((await teacher.student('/account/register', { username: teacherUser.username, password, name: '假教师' })).status, 409);
});

test('a credential owned by another student cannot replace current identity or claim their profile', async t => {
  const { client } = await setup(t), first = client(), second = client();
  const owner = await register(first, 'owned_account'), room = await classroom(second);
  const temporary = (await second.student('/enter-classroom', { name: '相同名字', code: room.code })).data.user;
  assert.equal((await second.student('/account/register', { username: 'owned_account', password, name: '相同名字' })).status, 409);
  assert.equal((await second.student('/me')).data.user.id, temporary.id);
  assert.notEqual(owner.id, temporary.id);
  assert.equal((await second.student('/account/login', { username: 'owned_account', password })).data.user.id, owner.id);
  assert.equal((await second.student('/classrooms')).data.classrooms.length, 0, 'Signing in does not merge the unrelated guest classroom');
});

test('phone OTP uses the real plugin: normalize, wrong code, verification, single use and send rate limits', async t => {
  const delivered = [];
  const { client } = await setup(t, { studentAuthOptions: { env: {}, sendOTP: async data => delivered.push(data) } }), student = client();
  assert.equal((await student.student('/account/phone/send', { phoneNumber: '13800000000' })).status, 200);
  assert.equal(delivered[0].phoneNumber, '+8613800000000'); assert.match(delivered[0].code, /^\d{6}$/);
  assert.equal((await student.student('/account/phone/send', { phoneNumber: '13800000000' })).status, 429);
  const wrong = delivered[0].code === '000000' ? '000001' : '000000';
  assert.equal((await student.student('/account/phone/verify', { phoneNumber: '13800000000', code: wrong })).status, 400);
  const verified = await student.student('/account/phone/verify', { phoneNumber: '13800000000', code: delivered[0].code, name: '手机同学' });
  assert.equal(verified.status, 200, JSON.stringify(verified.data));
  assert.equal(verified.data.user.role, 'student');
  assert.equal((await student.student('/account/options')).data.account.phone, '+8613****0000');
  assert.equal((await student.student('/account/phone/verify', { phoneNumber: '13800000000', code: delivered[0].code })).status, 400);
  assert.equal((await student.student('/account/phone/send', { phoneNumber: 'fake' })).status, 400);
});

test('phone can bind to password account and log into same student; cannot bind an owned phone to someone else', async t => {
  const delivered = [];
  let now = Date.now();
  const { client } = await setup(t, { studentAuthOptions: { env: {}, now: () => now, sendOTP: async data => delivered.push(data) } }), student = client();
  const original = await register(student);
  await student.student('/account/phone/send', { phoneNumber: '13900000000' });
  const code = delivered[0].code;
  const linked = await student.student('/account/phone/verify', { phoneNumber: '13900000000', code, mode: 'link' });
  assert.equal(linked.status, 200, JSON.stringify(linked.data)); assert.equal(linked.data.user.id, original.id);
  await student.student('/logout', {});
  const phoneOnly = client();
  const identifier = '+8613900000000';
  assert.equal((await phoneOnly.student('/account/phone/verify', { phoneNumber: identifier, code })).status, 400, 'Consumed OTP cannot log in from another device');
  now += 61000;
  assert.equal((await phoneOnly.student('/account/phone/send', { phoneNumber: identifier })).status, 200);
  const login = await phoneOnly.student('/account/phone/verify', { phoneNumber: identifier, code: delivered[1].code });
  assert.equal(login.status, 200); assert.equal(login.data.user.id, original.id);
  const other = client(); await register(other, 'other_student');
  now += 61000;
  assert.equal((await other.student('/account/phone/send', { phoneNumber: identifier })).status, 200);
  const conflict = await other.student('/account/phone/verify', { phoneNumber: identifier, code: delivered[2].code, mode: 'link' });
  assert.equal(conflict.status, 400); assert.match(conflict.data.error, /已绑定/);
});

test('expired OTP and exhausted attempts cannot create a classroom session; sender failures surface safely', async t => {
  const delivered = [];
  const { client, db } = await setup(t, { studentAuthOptions: { env: {}, sendOTP: async data => delivered.push(data) } }), student = client();
  await student.student('/account/phone/send', { phoneNumber: '13700000000' });
  db.prepare('UPDATE student_auth_verification SET expiresAt=0 WHERE identifier=?').run('+8613700000000');
  assert.equal((await student.student('/account/phone/verify', { phoneNumber: '13700000000', code: delivered[0].code })).status, 400);
  await student.student('/account/phone/send', { phoneNumber: '13600000000' });
  const valid = delivered[1].code, wrong = valid === '000000' ? '000001' : '000000';
  for (let i = 0; i < 3; i++) assert.equal((await student.student('/account/phone/verify', { phoneNumber: '13600000000', code: wrong })).status, 400);
  assert.equal((await student.student('/account/phone/verify', { phoneNumber: '13600000000', code: valid })).status, 403);
  assert.equal((await student.student('/me')).status, 401);
  const failure = await setup(t, { studentAuthOptions: { env: {}, sendOTP: async () => { throw new Error('private-provider-failure'); } } });
  const result = await failure.client().student('/account/phone/send', { phoneNumber: '13500000000' });
  assert.equal(result.status, 503); assert.ok(!JSON.stringify(result.data).includes('private-provider-failure'));
});

test('WeChat real provider code exchanges mocked tokens, validates state, preserves guest and recovers same identity', async t => {
  const { client, db, target } = await setup(t, { secureCookies: true, studentAuthOptions: { env: { WECHAT_APP_ID: 'test-wechat-app', WECHAT_APP_SECRET: 'test-wechat-secret' } } });
  const student = client(), room = await classroom(student);
  const previous = (await student.student('/enter-classroom', { name: '微信同学', code: room.code })).data.user;
  const actualFetch = globalThis.fetch;
  let exchanges = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url || input.toString());
    if (url.hostname === 'api.weixin.qq.com') {
      if (url.pathname.endsWith('/access_token')) { exchanges++; assert.equal(url.searchParams.get('appid'), 'test-wechat-app'); return Response.json({ access_token: 'provider-test-token', expires_in: 7200, refresh_token: 'provider-test-refresh', openid: 'verified-openid', scope: 'snsapi_login' }); }
      assert.equal(url.searchParams.get('openid'), 'verified-openid');
      return Response.json({ openid: 'verified-openid', unionid: 'verified-unionid', nickname: '微信同学' });
    }
    return actualFetch(input, init);
  };
  t.after(() => { globalThis.fetch = actualFetch; });
  const start = await student.student('/account/social/start', { provider: 'wechat' });
  assert.equal(start.status, 200, JSON.stringify(start.data));
  const url = new URL(start.data.url);
  assert.equal(url.hostname, 'open.weixin.qq.com'); assert.equal(url.searchParams.get('appid'), 'test-wechat-app');
  assert.match(url.searchParams.get('redirect_uri'), /\/api\/student\/auth\/callback\/wechat$/);
  assert.match(start.cookies.find(cookie => cookie.includes('.state=')), /SameSite=None/i);
  const state = url.searchParams.get('state');
  const bad = await student.student('/auth/callback/wechat?state=forged&code=mock-code');
  assert.equal(bad.status, 302); assert.equal(exchanges, 0);
  const callback = await student.student('/auth/callback/wechat?state=' + state + '&code=mock-code');
  assert.equal(callback.status, 302, JSON.stringify(callback.data)); assert.match(callback.location, /account\/finish\?intent=/);
  const finish = await student.student(callback.location.replace('https://login.example.com/api/student', ''));
  assert.equal(finish.status, 303, JSON.stringify(finish.data));
  assert.equal((await student.student('/me')).data.user.id, previous.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_auth_links').get().n, 1);
  assert.equal((await student.student(callback.location.replace('https://login.example.com/api/student', ''))).status, 403);
  await student.student('/logout', {});
  const second = client(), secondStart = await second.student('/account/social/start', { provider: 'wechat' });
  const nextState = new URL(secondStart.data.url).searchParams.get('state');
  const secondCallback = await second.student('/auth/callback/wechat?state=' + nextState + '&code=mock-code');
  await second.student(secondCallback.location.replace('https://login.example.com/api/student', ''));
  assert.equal((await second.student('/me')).data.user.id, previous.id);
  assert.equal((await second.student('/classrooms')).data.classrooms[0].id, room.id);
  assert.equal(exchanges, 2); assert.ok(target);
});

test('Apple client secret uses valid ES256, bounded expiry and correct claims; SMS RPC signature and phone validation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apple-auth-key-'));
  try {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const path = join(directory, 'AuthKey.p8'); writeFileSync(path, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    const jwt = appleClientSecret({ APPLE_CLIENT_ID: 'test.service', APPLE_TEAM_ID: 'TESTTEAM', APPLE_KEY_ID: 'KEY123', APPLE_PRIVATE_KEY_FILE: path }, 1800000000000);
    const [header, payload, signature] = jwt.split('.');
    assert.equal(verify('sha256', Buffer.from(header + '.' + payload), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true);
    const claims = JSON.parse(Buffer.from(payload, 'base64url'));
    assert.equal(claims.sub, 'test.service'); assert.equal(claims.iss, 'TESTTEAM'); assert.equal(claims.exp - claims.iat, 300); assert.equal(claims.aud, 'https://appleid.apple.com');
  } finally { rmSync(directory, { recursive: true, force: true }); }
  const request = aliyunSmsRequest({ phoneNumber: '+8613800000000', code: '123456' }, { ALIYUN_SMS_ACCESS_KEY_ID: 'id', ALIYUN_SMS_ACCESS_KEY_SECRET: 'secret', ALIYUN_SMS_SIGN_NAME: '测试签名', ALIYUN_SMS_TEMPLATE_CODE: 'SMS_TEST' }, new Date('2026-10-13T04:00:00Z'), 'test-nonce');
  assert.equal(request.get('Timestamp'), '2026-10-13T04:00:00Z'); assert.equal(request.get('TemplateParam'), '{"code":"123456"}'); assert.equal(request.get('PhoneNumbers'), '13800000000'); assert.ok(request.get('Signature'));
  assert.equal(normalizePhone('138 0000 0000'), '+8613800000000');
  assert.throws(() => aliyunSmsRequest({ phoneNumber: '+15555555555', code: '123456' }, {}), /中国大陆/);
});

test('Apple native form POST and signed ID tokens preserve a guest UUID and recover it on another device', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'apple-provider-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const clientKeys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const keyPath = join(directory, 'AuthKey.p8');
  writeFileSync(keyPath, clientKeys.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
  const signingKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = { APPLE_CLIENT_ID: 'student.test.service', APPLE_TEAM_ID: 'TESTTEAM', APPLE_KEY_ID: 'CLIENTKEY', APPLE_PRIVATE_KEY_FILE: keyPath };
  const { client, db } = await setup(t, { secureCookies: true, studentAuthOptions: { env } });
  const student = client(), room = await classroom(student);
  const original = (await student.student('/enter-classroom', { name: 'Apple 同学', code: room.code })).data.user;
  for (const userAgent of ['Browser/1', 'FreeImproStudent/1 iOS', 'FreeImproStudent/1 Android']) {
    const blocked = await student.student('/account/social/start', { provider: 'apple' }, { headers: { 'User-Agent': userAgent } });
    assert.equal(blocked.status, 403); assert.match(blocked.data.error, /iPhone\/iPad/);
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_auth_intents').get().n, 0, 'Web Apple attempts must not start authorization');
  const actualFetch = globalThis.fetch;
  let nonce, invalidAudience = false, tokenCalls = 0;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url || input.toString());
    if (url.hostname === 'appleid.apple.com') {
      if (url.pathname === '/auth/keys') return Response.json({ keys: [{ ...signingKeys.publicKey.export({ format: 'jwk' }), kid: 'APPLE_TEST_KEY', alg: 'RS256', use: 'sig' }] });
      assert.equal(url.pathname, '/auth/token'); tokenCalls++;
      const form = new URLSearchParams(init.body);
      assert.equal(form.get('client_id'), env.APPLE_CLIENT_ID);
      assert.match(form.get('redirect_uri'), /\/api\/student\/auth\/callback\/apple$/);
      const secret = form.get('client_secret'), parts = secret.split('.');
      assert.equal(verify('sha256', Buffer.from(parts[0] + '.' + parts[1]), { key: clientKeys.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url')), true);
      const now = Math.floor(Date.now() / 1000);
      const message = encode({ alg: 'RS256', kid: 'APPLE_TEST_KEY' }) + '.' + encode({ iss: 'https://appleid.apple.com', aud: invalidAudience ? 'untrusted.service' : env.APPLE_CLIENT_ID, sub: 'verified-apple-subject', email: 'apple-user@example.com', email_verified: 'true', iat: now, exp: now + 600, nonce });
      return Response.json({ access_token: 'apple-test-access', token_type: 'Bearer', expires_in: 3600, refresh_token: 'apple-test-refresh', id_token: message + '.' + sign('RSA-SHA256', Buffer.from(message), signingKeys.privateKey).toString('base64url') });
    }
    return actualFetch(input, init);
  };
  t.after(() => { globalThis.fetch = actualFetch; });
  async function flow(device, mode) {
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const start = await device.student('/account/native/start', { provider: 'apple', mode, codeChallenge });
    assert.equal(start.status, 200, JSON.stringify(start.data));
    const browser = client();
    const opened = await browser.student(start.data.browserURL.replace('https://login.example.com/api/student', ''));
    assert.equal(opened.status, 303, JSON.stringify(opened.data));
    const authorize = new URL(opened.location);
    assert.equal(authorize.hostname, 'appleid.apple.com'); assert.equal(authorize.searchParams.get('response_mode'), 'form_post');
    nonce = authorize.searchParams.get('nonce'); assert.ok(nonce, 'Authorization binds ID tokens to a nonce');
    const post = await browser.student('/auth/callback/apple', new URLSearchParams({ code: 'mock-apple-code', state: authorize.searchParams.get('state') }).toString(), { headers: { Origin: 'https://appleid.apple.com', 'Content-Type': 'application/x-www-form-urlencoded' } });
    assert.equal(post.status, 302); assert.match(post.location, /callback\/apple\?/);
    const authorized = await browser.student(post.location.replace('https://login.example.com/api/student', ''));
    return { authorized, browser, codeVerifier, handoffId: start.data.handoffId };
  }
  async function consume(device, result) {
    assert.equal(result.authorized.status, 302); assert.match(result.authorized.location, /account\/finish\?intent=/);
    const finished = await result.browser.student(result.authorized.location.replace('https://login.example.com/api/student', ''));
    assert.equal(finished.status, 303, JSON.stringify(finished.data));
    assert.match(finished.location, /^freeimprostudent:\/\/auth\/callback\?ticket=[a-f0-9]{64}$/);
    assert.equal((await result.browser.student('/me')).status, 401, 'System browser never gets a classroom session');
    const ticket = new URL(finished.location).searchParams.get('ticket');
    const consumed = await device.student('/account/native/consume', { ticket, codeVerifier: result.codeVerifier });
    assert.equal(consumed.status, 200, JSON.stringify(consumed.data));
    assert.equal((await device.student('/account/native/consume', { ticket, codeVerifier: result.codeVerifier })).status, 403, 'Native ticket is single use');
    return consumed;
  }
  const linked = await flow(student, 'login');
  assert.equal((await consume(student, linked)).data.user.id, original.id);
  assert.equal((await student.student('/me')).data.user.id, original.id);
  assert.ok((await student.student('/account/options')).data.account.providers.includes('apple'));
  await student.student('/logout', {});
  const rejected = client(); invalidAudience = true;
  const bad = await flow(rejected, 'login');
  assert.match(bad.authorized.location, /student_auth=error/);
  assert.equal((await rejected.student('/me')).status, 401);
  assert.equal((await rejected.student('/account/native/cancel', { handoffId: bad.handoffId, codeVerifier: bad.codeVerifier })).status, 200);
  invalidAudience = false;
  const otherDevice = client(), callback = await flow(otherDevice, 'login');
  assert.equal((await consume(otherDevice, callback)).data.user.id, original.id);
  assert.equal((await otherDevice.student('/me')).data.user.id, original.id);
  assert.equal((await otherDevice.student('/classrooms')).data.classrooms[0].id, room.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_auth_links').get().n, 1);
  assert.equal(tokenCalls, 3);
});
