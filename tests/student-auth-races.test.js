import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { request as httpRequest } from 'node:http';
import { createApp } from '../server/app.js';
import { hashPassword as hashLibraryPassword } from 'better-auth/crypto';

const hashPassword = promisify(scrypt);
const password = 'StudentTest123!';

async function setup(t, options = {}) {
  const app = createApp({ dbPath: ':memory:', studentAuthOptions: { env: {}, ...options.studentAuthOptions }, ...options });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  const target = 'http://127.0.0.1:' + app.server.address().port;
  const origin = options.secureCookies ? 'https://login.example.com' : target;
  t.after(async () => { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.db.close(); });
  function client() {
    const cookies = new Map();
    async function request(role, path, data) {
      const response = await new Promise((resolve, reject) => {
        const outgoing = httpRequest(target + '/api/' + role + path, { method: data === undefined ? 'GET' : 'POST', headers: { Host: new URL(origin).host, Origin: origin, Cookie: [...cookies].map(([name, value]) => name + '=' + value).join('; '), 'Content-Type': 'application/json' } }, incoming => {
          const chunks = []; incoming.on('data', chunk => chunks.push(chunk)); incoming.on('end', () => {
            const headers = new Headers(); for (const [name, value] of Object.entries(incoming.headers)) for (const item of [].concat(value || [])) headers.append(name, item);
            resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers }));
          });
        });
        outgoing.on('error', reject); outgoing.end(data === undefined ? undefined : JSON.stringify(data));
      });
      for (const cookie of response.headers.getSetCookie()) { const [name, ...value] = cookie.split(';')[0].split('='); if (value.join('=')) cookies.set(name, value.join('=')); else cookies.delete(name); }
      const type = response.headers.get('content-type');
      const text = await response.text();
      return { status: response.status, data: type?.includes('json') && text ? JSON.parse(text) : text, location: response.headers.get('location'), cookies: response.headers.getSetCookie() };
    }
    return { student: (path, data) => request('student', path, data), teacher: (path, data) => request('teacher', path, data), cookies };
  }
  return { ...app, origin, client };
}

// Place an administrator password change exactly after the selected database
// read, while the authentication operation is suspended at an await boundary.
function changePasswordAfterRead(db, matches, userId, salt, hashed, authPassword, authUserId) {
  const prepare = db.prepare.bind(db);
  let changed = false;
  db.prepare = sql => {
    const statement = prepare(sql);
    if (matches(sql)) for (const name of ['get', 'all']) {
      const read = statement[name].bind(statement);
      statement[name] = (...args) => {
        const value = read(...args);
        if (!changed) {
          changed = true;
          queueMicrotask(() => {
            prepare('UPDATE users SET salt=?,password=? WHERE id=?').run(salt, hashed, userId);
            if (authUserId) prepare("UPDATE student_auth_account SET password=?,updatedAt=? WHERE userId=? AND providerId='credential'").run(authPassword, Date.now(), authUserId);
          });
        }
        return value;
      };
    }
    return statement;
  };
  return { get changed() { return changed; }, restore: () => { db.prepare = prepare; } };
}

for (const phase of ['legacy password hash', 'library account creation']) test(`a legacy password reset during ${phase} cannot migrate the old password or issue sessions`, async t => {
  const { db, client } = await setup(t), student = client();
  const registered = await student.student('/register', { username: 'legacy_race', name: '旧学生', role: 'student', password });
  assert.equal(registered.status, 200);
  const userId = registered.data.user.id;
  await student.student('/logout', {});
  await student.student('/account/options');
  const salt = randomBytes(16).toString('hex'), hashed = (await hashPassword('ReplacementPassword123!', salt, 64)).toString('hex');
  const instrumentation = changePasswordAfterRead(db, sql => phase === 'legacy password hash' ? sql === 'SELECT * FROM users WHERE username=?' : /^select/i.test(sql) && /student_auth_user/.test(sql) && /email/.test(sql), userId, salt, hashed);
  t.after(instrumentation.restore);
  const result = await student.student('/account/login', { username: 'legacy_race', password });
  assert.equal(instrumentation.changed, true, 'The password changed while authentication was awaiting work');
  assert.equal(result.status, 401, JSON.stringify(result.data));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_auth_links WHERE student_id=?').get(userId).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(userId).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_auth_user').get().n, 0, 'A failed migration must not leave an old-password credential behind');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_auth_session').get().n, 0);
  assert.equal((await student.student('/me')).status, 401);
});

test('an administrator reset during a linked account password check cannot create a fresh old-password session', async t => {
  const { db, client } = await setup(t), student = client();
  const registered = await student.student('/account/register', { username: 'linked_reset_race', name: '账号学生', password });
  assert.equal(registered.status, 200, JSON.stringify(registered.data));
  const userId = registered.data.user.id;
  const authUserId = db.prepare('SELECT auth_user_id FROM student_auth_links WHERE student_id=?').get(userId).auth_user_id;
  await student.student('/logout', {});
  const salt = randomBytes(16).toString('hex'), replacement = 'ReplacementPassword123!';
  const [passwordBytes, authPassword] = await Promise.all([hashPassword(replacement, salt, 64), hashLibraryPassword(replacement)]);
  const instrumentation = changePasswordAfterRead(db, sql => /^select/i.test(sql) && /student_auth_account/.test(sql), userId, salt, passwordBytes.toString('hex'), authPassword, authUserId);
  t.after(instrumentation.restore);
  const result = await student.student('/account/login', { username: 'linked_reset_race', password });
  assert.equal(instrumentation.changed, true);
  assert.equal(result.status, 401, JSON.stringify(result.data));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(userId).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_auth_session WHERE userId=?').get(authUserId).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_auth_links WHERE student_id=?').get(userId).n, 1, 'Rejecting an obsolete password must preserve the valid linked identity');
  assert.equal((await student.student('/me')).status, 401);
});

test('a pending guest OAuth callback cannot reclaim the former classroom identity after sign out', async t => {
  const { db, client, origin } = await setup(t, { secureCookies: true, studentAuthOptions: { env: { WECHAT_APP_ID: 'test-wechat-app', WECHAT_APP_SECRET: 'test-wechat-secret' } } });
  const student = client();
  await student.teacher('/register', { username: 'race_teacher', name: '测试教师', role: 'teacher', password });
  const room = (await student.teacher('/classrooms', { name: '退出保护课堂', capacity: 15, background: '教室' })).data.classroom;
  const previous = (await student.student('/enter-classroom', { name: '原课堂学生', code: room.code })).data.user;
  const actualFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url || input.toString());
    if (url.hostname === 'api.weixin.qq.com') {
      if (url.pathname.endsWith('/access_token')) return Response.json({ access_token: 'test-provider-token', expires_in: 7200, refresh_token: 'test-provider-refresh', openid: 'verified-logout-subject', scope: 'snsapi_login' });
      return Response.json({ openid: 'verified-logout-subject', unionid: 'verified-logout-subject', nickname: '平台学生' });
    }
    return actualFetch(input, init);
  };
  t.after(() => { globalThis.fetch = actualFetch; });
  const start = await student.student('/account/social/start', { provider: 'wechat' });
  assert.equal(start.status, 200, JSON.stringify(start.data));
  const state = new URL(start.data.url).searchParams.get('state');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_auth_intents WHERE student_id=?').get(previous.id).n, 1);
  assert.equal((await student.student('/logout', {})).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_auth_intents WHERE student_id=?').get(previous.id).n, 0, 'Sign out cancels the pending classroom binding');
  const callback = await student.student('/auth/callback/wechat?state=' + state + '&code=mock-code');
  if (callback.location?.startsWith(origin + '/api/student/account/finish')) {
    const finished = await student.student(callback.location.replace(origin + '/api/student', ''));
    assert.notEqual(finished.status, 303, 'The revoked flow cannot finish as a student login');
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_auth_links WHERE student_id=?').get(previous.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(previous.id).n, 0);
  assert.equal((await student.student('/me')).status, 401);
});

test('sign out during a platform token exchange prevents a provider from binding to the former account', { timeout: 15000 }, async t => {
  const { db, client } = await setup(t, { secureCookies: true, studentAuthOptions: { env: { WECHAT_APP_ID: 'test-wechat-app', WECHAT_APP_SECRET: 'test-wechat-secret' } } });
  const student = client();
  const registered = await student.student('/account/register', { username: 'link_race', name: '账号学生', password });
  assert.equal(registered.status, 200, JSON.stringify(registered.data));
  const previous = registered.data.user;
  const actualFetch = globalThis.fetch;
  let releaseExchange, began = false, markExchangeStarted;
  const exchangeStarted = new Promise(resolve => { markExchangeStarted = resolve; });
  const tokenResponse = new Promise(resolve => { releaseExchange = resolve; });
  const releasedToken = () => Response.json({ access_token: 'test-link-token', expires_in: 7200, refresh_token: 'test-link-refresh', openid: 'verified-link-subject', scope: 'snsapi_login' });
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url || input.toString());
    if (url.hostname === 'api.weixin.qq.com') {
      if (url.pathname.endsWith('/access_token')) { began = true; markExchangeStarted(); return tokenResponse; }
      return Response.json({ openid: 'verified-link-subject', unionid: 'verified-link-subject', nickname: '平台学生' });
    }
    return actualFetch(input, init);
  };
  t.after(() => { releaseExchange(releasedToken()); globalThis.fetch = actualFetch; });
  const start = await student.student('/account/social/start', { provider: 'wechat', mode: 'link' });
  assert.equal(start.status, 200, JSON.stringify(start.data));
  const state = new URL(start.data.url).searchParams.get('state');
  const callback = student.student('/auth/callback/wechat?state=' + state + '&code=mock-code');
  await Promise.race([exchangeStarted, callback.then(result => { assert.equal(began, true, 'A valid authorized link flow must reach the provider exchange: ' + JSON.stringify(result)); })]);
  const signedOut = await student.student('/logout', {});
  releaseExchange(releasedToken());
  assert.equal(signedOut.status, 200, JSON.stringify(signedOut.data));
  await callback;
  const authUser = db.prepare('SELECT auth_user_id FROM student_auth_links WHERE student_id=?').get(previous.id).auth_user_id;
  assert.equal(db.prepare("SELECT COUNT(*) n FROM student_auth_account WHERE userId=? AND providerId='wechat'").get(authUser).n, 0, 'The provider must not bind after sign out during its asynchronous exchange');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(previous.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_auth_session WHERE userId=?').get(authUser).n, 0);
  assert.equal((await student.student('/me')).status, 401);
});

test('a returning platform login cannot recreate a library session after sign out during token exchange', { timeout: 15000 }, async t => {
  const { db, client, origin } = await setup(t, { secureCookies: true, studentAuthOptions: { env: { WECHAT_APP_ID: 'test-wechat-app', WECHAT_APP_SECRET: 'test-wechat-secret' } } });
  const student = client(), actualFetch = globalThis.fetch;
  let block = false, began = false, releaseExchange, markExchangeStarted;
  const exchangeStarted = new Promise(resolve => { markExchangeStarted = resolve; });
  const blockedToken = new Promise(resolve => { releaseExchange = resolve; });
  const token = () => Response.json({ access_token: 'test-returning-token', expires_in: 7200, refresh_token: 'test-returning-refresh', openid: 'verified-returning-subject', scope: 'snsapi_login' });
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url || input.toString());
    if (url.hostname === 'api.weixin.qq.com') {
      if (url.pathname.endsWith('/access_token')) {
        if (block) { began = true; markExchangeStarted(); return blockedToken; }
        return token();
      }
      return Response.json({ openid: 'verified-returning-subject', unionid: 'verified-returning-subject', nickname: '平台学生' });
    }
    return actualFetch(input, init);
  };
  t.after(() => { releaseExchange(token()); globalThis.fetch = actualFetch; });
  const initial = await student.student('/account/social/start', { provider: 'wechat' });
  const initialState = new URL(initial.data.url).searchParams.get('state');
  const created = await student.student('/auth/callback/wechat?state=' + initialState + '&code=first-code');
  assert.ok(created.location?.startsWith(origin + '/api/student/account/finish'), JSON.stringify(created));
  const finished = await student.student(created.location.replace(origin + '/api/student', ''));
  assert.equal(finished.status, 303, JSON.stringify(finished.data));
  const previous = (await student.student('/me')).data.user;
  const authUser = db.prepare('SELECT auth_user_id FROM student_auth_links WHERE student_id=?').get(previous.id).auth_user_id;

  const start = await student.student('/account/social/start', { provider: 'wechat', mode: 'login' });
  assert.equal(start.status, 200, JSON.stringify(start.data));
  block = true;
  const state = new URL(start.data.url).searchParams.get('state');
  const callback = student.student('/auth/callback/wechat?state=' + state + '&code=second-code');
  await Promise.race([exchangeStarted, callback.then(result => { assert.equal(began, true, 'A valid returning login must reach the provider exchange: ' + JSON.stringify(result)); })]);
  const signedOut = await student.student('/logout', {});
  releaseExchange(token());
  assert.equal(signedOut.status, 200);
  await callback;
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(previous.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_auth_session WHERE userId=?').get(authUser).n, 0, 'Canceling a pending existing-provider login must prevent a fresh library session');
  assert.equal((await student.student('/me')).status, 401);
});
