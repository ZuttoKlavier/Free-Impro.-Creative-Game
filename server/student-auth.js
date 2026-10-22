import { betterAuth } from 'better-auth';
import { username, phoneNumber } from 'better-auth/plugins';
import { getMigrations } from 'better-auth/db/migration';
import { verifyProviderIdToken } from 'better-auth/oauth2';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { randomBytes, randomUUID, createHash, sign, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { isIP } from 'node:net';
import { sendAliyunSms, aliyunSmsConfigured } from './student-sms.js';
import { createStudentNativeAuth } from './student-native-auth.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const sha = value => createHash('sha256').update(value).digest('hex');
const passwordHash = promisify(scrypt);
const basePath = '/api/student/auth';
const safeName = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 30 && !/[\p{Cc}]/u.test(value);
const publicUser = user => ({ id: user.id, username: user.username, name: user.name, role: user.role });
export function normalizePhone(value) {
  if (typeof value !== 'string') throw fail(400, '请填写有效的手机号。');
  const phone = value.trim().replace(/[ -]/g, '');
  const normalized = /^1[3-9]\d{9}$/.test(phone) ? '+86' + phone : phone;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw fail(400, '请使用手机号或带国家区号的手机号。');
  return normalized;
}

// A short-lived Apple client secret is signed on the server; the .p8 never
// reaches the browser, database, logs or committed application bundle.
export function appleClientSecret(env, now = Date.now()) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const seconds = Math.floor(now / 1000);
  const input = encode({ alg: 'ES256', kid: env.APPLE_KEY_ID }) + '.' + encode({ iss: env.APPLE_TEAM_ID, iat: seconds, exp: seconds + 300, aud: 'https://appleid.apple.com', sub: env.APPLE_CLIENT_ID });
  const signature = sign('sha256', Buffer.from(input), { key: readFileSync(env.APPLE_PRIVATE_KEY_FILE), dsaEncoding: 'ieee-p1363' });
  return input + '.' + signature.toString('base64url');
}

export function createStudentAuth({ db, secureCookies, session, setSession, body, env = process.env, sendOTP, now: authNow = Date.now, socialProviders: testProviders } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS student_auth_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS student_auth_links(auth_user_id TEXT PRIMARY KEY, student_id TEXT UNIQUE NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS student_auth_intents(digest TEXT PRIMARY KEY, student_id TEXT REFERENCES users(id), mode TEXT NOT NULL, origin TEXT NOT NULL, expires INTEGER NOT NULL, session_digest TEXT, verified_auth_user_id TEXT);`);
  if (!db.prepare('PRAGMA table_info(student_auth_intents)').all().some(column => column.name === 'session_digest')) db.exec('ALTER TABLE student_auth_intents ADD COLUMN session_digest TEXT');
  if (!db.prepare('PRAGMA table_info(student_auth_intents)').all().some(column => column.name === 'verified_auth_user_id')) db.exec('ALTER TABLE student_auth_intents ADD COLUMN verified_auth_user_id TEXT');
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  let secret = env.STUDENT_AUTH_SECRET || one("SELECT value FROM student_auth_settings WHERE key='secret'")?.value;
  if (!secret) {
    run("INSERT OR IGNORE INTO student_auth_settings VALUES('secret',?)", randomBytes(48).toString('base64url'));
    secret = one("SELECT value FROM student_auth_settings WHERE key='secret'").value;
  }
  if (secret.length < 32) throw new Error('STUDENT_AUTH_SECRET 至少需要 32 个字符。');
  const appleConfigured = ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY_FILE'].every(key => Boolean(env[key]));
  const wechatConfigured = Boolean(env.WECHAT_APP_ID && env.WECHAT_APP_SECRET);
  const smsConfigured = Boolean(sendOTP || aliyunSmsConfigured(env));
  const instances = new Map(), limits = new Map(), authRateStorage = new Map(), nativeGrants = new Map();
  const intentCookieName = (secureCookies ? '__Secure-' : '') + 'fi_student_auth.intent';
  const intentCookie = (value, maxAge) => `${intentCookieName}=${value}; HttpOnly; SameSite=${secureCookies ? 'None' : 'Lax'}; Path=/api/student; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
  const readIntentCookie = headers => new RegExp('(?:^|;\\s*)' + intentCookieName.replace(/\./g, '\\.') + '=([a-f0-9]{64})(?:;|$)').exec(headers.get('cookie') || '')?.[1];
  let migrations;
  const authHeaders = req => new Headers({ cookie: req.headers.cookie || '', origin: originFor(req), 'content-type': 'application/json', 'x-student-auth-ip': req.socket.remoteAddress });
  function originFor(req) {
    const origin = new URL(`${secureCookies ? 'https' : 'http'}://${req.headers.host}`).origin;
    if (env.STUDENT_AUTH_ORIGIN && origin !== new URL(env.STUDENT_AUTH_ORIGIN).origin) throw fail(421, '请使用配置的账号服务地址。');
    return origin;
  }
  async function instance(req) {
    const origin = originFor(req);
    if (!instances.has(origin) || (appleConfigured && Date.now() - instances.get(origin).created > 240000)) {
      const providers = testProviders || {
        ...(wechatConfigured ? { wechat: { clientId: env.WECHAT_APP_ID, clientSecret: env.WECHAT_APP_SECRET, lang: 'cn' } } : {}),
        ...(appleConfigured ? { apple: () => ({ clientId: env.APPLE_CLIENT_ID, clientSecret: appleClientSecret(env) }) } : {}),
      };
      const auth = betterAuth({
        appName: 'Free Impro Student', database: db, secret, baseURL: origin, basePath,
        trustedOrigins: [origin, 'https://appleid.apple.com'],
        user: { modelName: 'student_auth_user' }, session: { modelName: 'student_auth_session', cookieCache: { enabled: false } },
        verification: { modelName: 'student_auth_verification' },
        account: { modelName: 'student_auth_account', encryptOAuthTokens: true, accountLinking: { enabled: true, disableImplicitLinking: true, trustedProviders: ['wechat', 'apple'], allowDifferentEmails: true } },
        emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128 },
        socialProviders: providers,
        databaseHooks: { session: { create: { before: (data, ctx) => {
          if (isProviderCallback(ctx)) assertCallbackIntent(ctx, origin);
          return { data };
        } } }, user: { create: { before: (data, ctx) => {
          if (isProviderCallback(ctx)) assertCallbackIntent(ctx, origin);
          return { data };
        } }, update: { before: (data, ctx) => {
          if (ctx?.body?.updatePhoneNumber && data.phoneNumber) {
            const token = session({ clientRole: 'student', headers: { cookie: ctx.request?.headers.get('cookie') || '' } });
            if (!token.user || !activeSession(token.token, token.user.id)) throw new APIError('UNAUTHORIZED', { message: 'Student session ended' });
          }
          return { data };
        } } }, account: { create: { before: (account, ctx) => {
          // Recheck after the asynchronous provider token exchange too. A
          // callback that finishes after sign-out cannot add a new login.
          if (['wechat', 'apple'].includes(account.providerId)) {
            assertCallbackIntent(ctx, origin);
          }
          return { data: account };
        } } } },
        advanced: { ipAddress: { ipAddressHeaders: ['x-student-auth-ip'] }, useSecureCookies: secureCookies, cookiePrefix: 'fi_student_auth', defaultCookieAttributes: { path: '/api/student', httpOnly: true, sameSite: 'lax', secure: secureCookies }, cookies: {
          state: { attributes: { sameSite: secureCookies ? 'none' : 'lax', secure: secureCookies } },
          oauth_state: { attributes: { sameSite: secureCookies ? 'none' : 'lax', secure: secureCookies } },
        } },
        rateLimit: { enabled: true, window: 60, max: 60, customRules: {
          '/sign-up/email': { window: 900, max: 60 }, '/sign-in/username': { window: 900, max: 60 }, '/sign-in/social': { window: 900, max: 60 },
        }, customStorage: {
          // The library requires one atomic consume operation. This storage is
          // per classroom app, rather than the library's process-global map.
          consume: (key, rule) => {
            const now = Date.now();
            for (const [id, entry] of authRateStorage) if (now >= entry.expiresAt) authRateStorage.delete(id);
            const entry = authRateStorage.get(key);
            if (entry && now < entry.expiresAt && entry.count >= rule.max) return { allowed: false, retryAfter: Math.ceil((entry.expiresAt - now) / 1000) };
            authRateStorage.set(key, entry && now < entry.expiresAt ? { ...entry, count: entry.count + 1 } : { count: 1, expiresAt: now + rule.window * 1000 });
            return { allowed: true, retryAfter: null };
          },
        } },
        logger: { disabled: true },
        plugins: [{ id: 'student-native-session', endpoints: { studentNativeSession: createAuthEndpoint('/student-native-session', { method: 'POST' }, async ctx => {
          const data = ctx.body || await ctx.request.json();
          const authorization = nativeGrants.get(data.grant);
          nativeGrants.delete(data.grant);
          // This endpoint is never exposed by the student facade. Even an
          // internal request needs a one-use grant issued by the verified flow.
          if (!authorization) throw new APIError('FORBIDDEN', { message: 'Native authorization missing' });
          const check = () => { try { authorization.check(); } catch (error) { throw new APIError(error.status === 401 ? 'UNAUTHORIZED' : error.status === 409 ? 'CONFLICT' : 'FORBIDDEN', { message: 'Native authorization ended' }); } };
          check();
          const user = await ctx.context.internalAdapter.findUserById(authorization.userId);
          check();
          if (!user) throw new APIError('UNAUTHORIZED', { message: 'Native identity ended' });
          const session = await ctx.context.internalAdapter.createSession(user.id, false);
          if (!session) throw new APIError('UNAUTHORIZED', { message: 'Native session ended' });
          try {
            check();
            await setSessionCookie(ctx, { session, user });
            check();
            return ctx.json({ sessionId: session.id });
          } catch (error) { await ctx.context.internalAdapter.deleteSession(session.token); throw error; }
        }) } }, username({ minUsernameLength: 3, maxUsernameLength: 32, usernameValidator: value => /^[A-Za-z0-9_]+$/.test(value) }), phoneNumber({
          otpLength: 6, expiresIn: 300, allowedAttempts: 3, phoneNumberValidator: value => /^\+[1-9]\d{7,14}$/.test(value),
          sendOTP: async value => {
            if (!smsConfigured) throw fail(503, '短信登录尚未配置。');
            try { await (sendOTP ? sendOTP(value) : sendAliyunSms(value, env)); }
            catch { throw new APIError('SERVICE_UNAVAILABLE', { message: 'SMS delivery unavailable' }); }
          },
          signUpOnVerification: { getTempEmail: phone => `${sha(phone)}@phone.student.invalid`, getTempName: () => '学生' },
        })],
      });
      const ready = auth.$context.then(context => {
        const provider = context.socialProviders.find(provider => provider.id === 'apple');
        if (!provider) return;
        // Better Auth 1.7.7 verifies mobile ID tokens but its built-in Apple
        // authorization-code profile reader only decodes them. Use its public
        // verifier here as well, and bind the verified token to this flow.
        provider.requiresIdTokenNonce = true;
        const authorize = provider.createAuthorizationURL.bind(provider), profile = provider.getUserInfo.bind(provider);
        provider.createAuthorizationURL = async input => { const url = await authorize(input); url.searchParams.set('nonce', input.idTokenNonce); return url; };
        provider.getUserInfo = async tokens => {
          if (!tokens.idToken || !tokens.expectedIdTokenNonce || !await verifyProviderIdToken(provider, tokens.idToken, tokens.expectedIdTokenNonce)) return null;
          return profile(tokens);
        };
      });
      instances.set(origin, { auth, created: Date.now(), ready });
      migrations ||= getMigrations(auth.options).then(migration => migration.runMigrations());
    }
    await migrations;
    await instances.get(origin).ready;
    return instances.get(origin).auth;
  }
  function limit(req, kind, key = '') {
    const now = authNow(), duration = kind === 'sms-phone' ? 60000 : 900000;
    for (const [id, value] of limits) if (now >= value.until) limits.delete(id);
    const id = kind + ':' + (key || req.socket.remoteAddress);
    const entry = limits.get(id) || { count: 0, until: now + duration };
    limits.set(id, entry);
    const max = kind === 'sms-phone' ? 1 : kind === 'sms-ip' ? 10 : 60;
    if (++entry.count > max) throw fail(429, kind.startsWith('sms') ? '验证码请求过于频繁，请稍后再试。' : '登录操作过于频繁，请稍后再试。');
  }
  function appendCookies(res, cookies) {
    if (cookies.length) res.setHeader('Set-Cookie', [...(res.getHeader('Set-Cookie') ? [].concat(res.getHeader('Set-Cookie')) : []), ...cookies]);
  }
  async function invoke(req, endpoint, data, res, cookieOverride) {
    const auth = await instance(req), headers = authHeaders(req);
    if (cookieOverride !== undefined) headers.set('cookie', cookieOverride);
    const response = await auth.handler(new Request(originFor(req) + basePath + endpoint, { method: 'POST', headers, body: JSON.stringify(data) }));
    let result;
    try { result = await response.json(); } catch { throw fail(503, '账号服务暂不可用，请稍后重试。'); }
    if (!response.ok) {
      const messages = { INVALID_USERNAME_OR_PASSWORD: '账号或密码不正确。', INVALID_OTP: '验证码不正确或已过期。', OTP_EXPIRED: '验证码已过期，请重新获取。', TOO_MANY_ATTEMPTS: '验证码尝试次数过多，请重新获取。', PHONE_NUMBER_EXIST: '这个手机号已绑定其他账号。', USERNAME_IS_ALREADY_TAKEN: '这个账号已被使用。', USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: '这个账号已被使用。' };
      throw fail(response.status, messages[result.code] || (endpoint.includes('send-otp') && response.status >= 500 ? '短信发送失败，请稍后重试或使用账号密码。' : endpoint.includes('sign-in') ? '账号或密码不正确。' : '账号验证未完成，请检查填写内容后重试。'));
    }
    if (res) appendCookies(res, response.headers.getSetCookie());
    return result;
  }
  function linked(user) { return user && one('SELECT auth_user_id FROM student_auth_links WHERE student_id=?', user.id); }
  function activeSession(token, studentId) { return token && one('SELECT 1 FROM sessions WHERE token=? AND user_id=? AND expires>?', token, studentId, Date.now()); }
  function isProviderCallback(ctx) { return ctx?.request && /\/callback\/(wechat|apple)$/.test(new URL(ctx.request.url).pathname); }
  function assertCallbackIntent(ctx, origin) {
    try {
      const { intent } = assertIntent(ctx?.request?.headers, origin);
      if (ctx?.request && new URL(ctx.request.url).pathname.endsWith('/callback/apple')) nativeAuth.assertProviderIntent(intent, origin, 'apple');
    }
    catch { throw new APIError('FORBIDDEN', { message: 'Student authentication intent ended' }); }
  }
  function assertIntent(headers, origin) {
    const token = headers && readIntentCookie(headers);
    const intent = token && one('SELECT * FROM student_auth_intents WHERE digest=? AND expires>? AND origin=?', sha(token), Date.now(), origin);
    if (!intent) throw fail(403, '登录回调已过期或已使用，请重新登录。');
    if (intent.student_id && !activeSession(intent.session_digest, intent.student_id)) throw fail(401, '原学生连接已退出，请重新发起登录。');
    nativeAuth.assertIntent(intent, origin);
    return { token, intent };
  }
  function discardUnlinked(authUserId) {
    if (one('SELECT 1 FROM student_auth_links WHERE auth_user_id=?', authUserId)) return;
    run('DELETE FROM student_auth_session WHERE userId=?', authUserId);
    run('DELETE FROM student_auth_account WHERE userId=?', authUserId);
    run('DELETE FROM student_auth_user WHERE id=?', authUserId);
  }
  // Only a verified Better Auth identity reaches this function. Never identify
  // a student by a submitted name, phone, email or OAuth subject.
  function resolveStudent(authUser, previous, name, requirePromotion = false) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = one('SELECT u.* FROM users u JOIN student_auth_links l ON l.student_id=u.id WHERE l.auth_user_id=?', authUser.id);
      if (existing) { db.exec('COMMIT'); return existing; }
      if (requirePromotion && previous && linked(previous)) throw fail(409, '当前学生身份已绑定账号，请登录已绑定的账号。');
      const candidate = previous?.role === 'student' && !linked(previous) ? previous : null;
      const actualName = safeName(name) ? name.trim() : candidate?.name || (safeName(authUser.name) ? authUser.name.trim() : '学生');
      const accountName = authUser.username || 'student_' + randomBytes(10).toString('hex');
      const collision = one('SELECT id FROM users WHERE username=?', accountName);
      if (collision && collision.id !== candidate?.id) throw fail(409, '这个账号已被使用，请登录原账号。');
      let student;
      if (candidate) {
        run('UPDATE users SET username=?,name=? WHERE id=?', authUser.username || candidate.username, actualName, candidate.id);
        student = one('SELECT * FROM users WHERE id=?', candidate.id);
      } else {
        student = { id: randomUUID(), username: accountName, name: actualName, role: 'student', salt: randomBytes(16).toString('hex'), password: randomBytes(64).toString('hex') };
        run('INSERT INTO users VALUES(?,?,?,?,?,?)', ...Object.values(student));
      }
      run('INSERT INTO student_auth_links VALUES(?,?)', authUser.id, student.id);
      db.exec('COMMIT'); return student;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  function grant(req, res, student) {
    const previous = session(req);
    if (previous.token) run('DELETE FROM sessions WHERE token=?', previous.token);
    setSession(res, student.id, 'student');
    return { user: publicUser(student) };
  }
  async function options(req) {
    await instance(req);
    const current = session(req).user, link = linked(current);
    const account = link && one('SELECT username,phoneNumber FROM student_auth_user WHERE id=?', link.auth_user_id);
    const host = new URL(originFor(req)).hostname;
    const publicHttps = secureCookies && host.includes('.') && !isIP(host) && !host.startsWith('[') && !/\.(local|internal|invalid|test)$/.test(host);
    const enabled = (value, reason) => ({ enabled: Boolean(value), reason: value ? '' : reason });
    return {
      password: enabled(true), phone: enabled(smsConfigured, '短信服务尚未配置，请先使用账号密码。'),
      wechat: enabled((wechatConfigured || testProviders?.wechat) && publicHttps, !wechatConfigured && !testProviders?.wechat ? '微信开放平台应用尚未配置。' : '微信登录需要已登记的公开 HTTPS 回调地址。'),
      apple: enabled((appleConfigured || testProviders?.apple) && publicHttps, !appleConfigured && !testProviders?.apple ? 'Apple 登录应用尚未配置。' : 'Apple 登录需要已登记的公开 HTTPS 回调地址。'),
      account: current ? { linked: Boolean(link), username: account?.username || (current.username.includes('#') ? null : current.username), phone: account?.phoneNumber ? account.phoneNumber.slice(0, 5) + '****' + account.phoneNumber.slice(-4) : null, providers: link ? db.prepare('SELECT providerId FROM student_auth_account WHERE userId=?').all(link.auth_user_id).map(row => row.providerId) : [] } : null,
    };
  }
  async function mintNativeSession(req, userId, check) {
    const auth = await instance(req), key = randomBytes(32).toString('hex');
    nativeGrants.set(key, { userId, check });
    let created;
    try {
      const response = await auth.handler(new Request(originFor(req) + basePath + '/student-native-session', { method: 'POST', headers: authHeaders(req), body: JSON.stringify({ grant: key }) }));
      if (!response.ok) throw fail(response.status, '客户端账号验证已失效，请重新登录。');
      const result = await response.json();
      if (!result.sessionId) throw fail(503, '客户端账号服务暂不可用。');
      created = result.sessionId;
      check();
      return { sessionId: result.sessionId, cookies: response.headers.getSetCookie() };
    } catch (error) {
      if (created) run('DELETE FROM student_auth_session WHERE id=?', created);
      throw error;
    } finally { nativeGrants.delete(key); }
  }
  const nativeAuth = createStudentNativeAuth({ db, session, activeSession, instance, invoke, mintSession: mintNativeSession, authHeaders, appendCookies, intentCookie, options, originFor, resolveStudent, grant });
  async function handle(req, res, path, send) {
    if (req.clientRole !== 'student') return false;
    if (path === '/api/account/options' && req.method === 'GET') { send(200, await options(req)); return true; }
    if (path === '/api/account/native/open' && req.method === 'GET') { await nativeAuth.open(req, res); return true; }
    if (path === '/api/account/finish' && req.method === 'GET') {
      const token = new URL(req.url, originFor(req)).searchParams.get('intent');
      const cookie = readIntentCookie(authHeaders(req));
      if (!token || token !== cookie) throw fail(403, '登录回调无效，请重新发起登录。');
      const intent = one('SELECT * FROM student_auth_intents WHERE digest=? AND expires>? AND origin=?', sha(token), Date.now(), originFor(req));
      if (!intent) throw fail(403, '登录回调已过期或已使用。');
      const auth = await instance(req), verified = await auth.api.getSession({ headers: authHeaders(req) });
      if (!verified || intent.verified_auth_user_id !== verified.user.id) throw fail(401, '平台登录未完成，请重新登录。');
      if (await nativeAuth.finish(req, res, intent, verified)) return true;
      // The initiating Strict cookie may be absent after a cross-site callback.
      // Check its server-side digest instead, including sign-out/revocation.
      if (intent.student_id && !activeSession(intent.session_digest, intent.student_id)) throw fail(401, '原学生连接已退出，请重新发起登录。');
      const current = session(req).user;
      if (current && current.id !== intent.student_id) throw fail(409, '学生连接已更改，请重新发起登录。');
      const previous = intent.student_id ? one('SELECT * FROM users WHERE id=?', intent.student_id) : null;
      if (intent.mode === 'link' && linked(previous)?.auth_user_id !== verified.user.id) throw fail(409, '平台账号与当前学生账号不符，请重新绑定。');
      if (run('DELETE FROM student_auth_intents WHERE digest=?', sha(token)).changes !== 1) throw fail(403, '登录回调已使用。');
      const student = resolveStudent(verified.user, previous);
      if (intent.session_digest) run('DELETE FROM sessions WHERE token=?', intent.session_digest);
      grant(req, res, student);
      appendCookies(res, [intentCookie('', 0)]);
      res.writeHead(303, { Location: '/?student_auth=success', 'Referrer-Policy': 'no-referrer' }); res.end(); return true;
    }
    if (path.startsWith('/api/auth/')) {
      // Expose only provider callbacks. Signup, linking, token/session APIs and
      // arbitrary callback URLs stay behind our student-only facade.
      if (!/^\/api\/auth\/callback\/(wechat|apple)$/.test(path) || !['GET', 'POST'].includes(req.method)) throw fail(404, '没有找到这个登录操作。');
      const { token, intent: callbackIntent } = assertIntent(authHeaders(req), originFor(req));
      if (path === '/api/auth/callback/apple') nativeAuth.assertProviderIntent(callbackIntent, originFor(req), 'apple');
      const nativeCallback = nativeAuth.isIntent(callbackIntent);
      const auth = await instance(req);
      let data;
      if (req.method === 'POST') {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 16384) throw fail(413, '登录回调内容过大。'); chunks.push(chunk); }
        data = Buffer.concat(chunks);
      }
      const headers = new Headers({ cookie: req.headers.cookie || '', ...(req.headers.origin ? { origin: req.headers.origin } : {}), 'content-type': req.headers['content-type'] || 'application/x-www-form-urlencoded', 'x-student-auth-ip': req.socket.remoteAddress });
      const response = await auth.handler(new Request(originFor(req) + req.url, { method: req.method, headers, body: data }));
      const location = response.headers.get('location');
      if (location === originFor(req) + '/api/student/account/finish?intent=' + token) {
        const cookieJar = new Map((req.headers.cookie || '').split(';').filter(Boolean).map(pair => { const equal = pair.indexOf('='); return [pair.slice(0, equal).trim(), pair.slice(equal + 1)]; }));
        for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], equal = pair.indexOf('='); cookieJar.set(pair.slice(0, equal), pair.slice(equal + 1)); }
        const verifiedHeaders = authHeaders(req); verifiedHeaders.set('cookie', [...cookieJar].map(([name, value]) => name + '=' + value).join('; '));
        const verified = await auth.api.getSession({ headers: verifiedHeaders });
        if (!verified) throw fail(401, '平台登录未完成，请重新登录。');
        try {
          assertIntent(authHeaders(req), originFor(req));
          if (nativeCallback) nativeAuth.markVerified(callbackIntent, verified, originFor(req));
        } catch (error) {
          if (nativeCallback) run('DELETE FROM student_auth_session WHERE id=?', verified.session.id);
          throw error;
        }
        run('UPDATE student_auth_intents SET verified_auth_user_id=? WHERE digest=?', verified.user.id, sha(token));
      }
      appendCookies(res, response.headers.getSetCookie());
      if (location) res.setHeader('Location', location);
      res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json', 'Referrer-Policy': 'no-referrer' });
      res.end(Buffer.from(await response.arrayBuffer())); return true;
    }
    if (!path.startsWith('/api/account/')) return false;
    if (req.method !== 'POST') throw fail(405, '不支持的登录操作。');
    limit(req, 'auth');
    const data = await body(req), initiating = session(req), current = initiating.user;
    if (current && current.role !== 'student') throw fail(403, '请使用学生账号。');
    if (path === '/api/account/native/start') { await nativeAuth.start(req, res, data, send); return true; }
    if (path === '/api/account/native/consume') { await nativeAuth.consume(req, res, data, send); return true; }
    if (path === '/api/account/native/cancel') { await nativeAuth.cancel(req, res, data, send); return true; }
    if (path === '/api/account/register') {
      if (!/^[A-Za-z0-9_]{3,32}$/.test(data.username || '') || !safeName(data.name) || typeof data.password !== 'string' || data.password.length < 8 || data.password.length > 128) throw fail(400, '请填写姓名、3–32 位字母数字账号和至少 8 位密码。');
      if (linked(current)) throw fail(409, '当前学生已有可登录账号，请先退出后注册其他账号。');
      if (one('SELECT id FROM users WHERE username=?', data.username.toLowerCase())?.id && one('SELECT id FROM users WHERE username=?', data.username.toLowerCase()).id !== current?.id) throw fail(409, '这个账号已被使用。');
      const result = await invoke(req, '/sign-up/email', { username: data.username.toLowerCase(), email: data.username.toLowerCase() + '@account.student.invalid', password: data.password, name: data.name.trim() }, res, '');
      if (current && !activeSession(initiating.token, current.id)) { discardUnlinked(result.user.id); throw fail(401, '原学生连接已退出，请重新注册。'); }
      send(200, grant(req, res, resolveStudent(result.user, current, data.name, true))); return true;
    }
    if (path === '/api/account/login') {
      if (!/^[A-Za-z0-9_]{3,32}$/.test(data.username || '') || typeof data.password !== 'string' || data.password.length < 8 || data.password.length > 128) throw fail(400, '请填写有效的账号和密码。');
      await instance(req);
      const legacy = one('SELECT * FROM users WHERE username=?', data.username.toLowerCase());
      if (legacy && !linked(legacy)) {
        const check = await passwordHash(data.password, legacy.salt, 64);
        const fresh = one('SELECT salt,password,role FROM users WHERE id=?', legacy.id);
        if (!fresh || fresh.password !== legacy.password || fresh.salt !== legacy.salt || fresh.role !== legacy.role || !timingSafeEqual(check, Buffer.from(legacy.password, 'hex'))) throw fail(401, '账号或密码不正确。');
        if (legacy.role !== 'student') throw fail(403, '请使用学生账号登录学生端。');
        // Authenticate the legacy password before creating its library identity.
        const result = await invoke(req, '/sign-up/email', { username: legacy.username, email: legacy.username + '@account.student.invalid', password: data.password, name: legacy.name }, res, '');
        const after = one('SELECT salt,password,role FROM users WHERE id=?', legacy.id);
        if (!after || after.password !== legacy.password || after.salt !== legacy.salt || after.role !== legacy.role) { discardUnlinked(result.user.id); throw fail(401, '账号验证已变更，请使用当前密码重新登录。'); }
        send(200, grant(req, res, resolveStudent(result.user, legacy))); return true;
      }
      const link = linked(legacy);
      const credential = link && one("SELECT password FROM student_auth_account WHERE userId=? AND providerId='credential'", link.auth_user_id);
      const result = await invoke(req, '/sign-in/username', { username: data.username.toLowerCase(), password: data.password }, res, '');
      if (link) {
        const fresh = one('SELECT password,salt,role FROM users WHERE id=?', legacy.id);
        const afterCredential = one("SELECT password FROM student_auth_account WHERE userId=? AND providerId='credential'", link.auth_user_id);
        if (result.user.id !== link.auth_user_id || !fresh || fresh.password !== legacy.password || fresh.salt !== legacy.salt || fresh.role !== legacy.role || afterCredential?.password !== credential?.password) {
          if (result.token) run('DELETE FROM student_auth_session WHERE token=?', result.token);
          throw fail(401, '账号验证已变更，请使用当前密码重新登录。');
        }
      }
      send(200, grant(req, res, resolveStudent(result.user))); return true;
    }
    if (['/api/account/phone/send', '/api/account/phone/verify'].includes(path)) {
      if (!smsConfigured) throw fail(503, '短信登录尚未配置，请先使用账号密码。');
      const number = normalizePhone(data.phoneNumber);
      if (!sendOTP && !/^\+861[3-9]\d{9}$/.test(number)) throw fail(400, '当前短信服务仅支持中国大陆手机号。');
      if (path.endsWith('/send')) {
        limit(req, 'sms-ip'); limit(req, 'sms-phone', number);
        await invoke(req, '/phone-number/send-otp', { phoneNumber: number }, null, ''); send(200, { sent: true, retryAfter: 60 }); return true;
      }
      if (!/^\d{6}$/.test(data.code || '')) throw fail(400, '请输入 6 位短信验证码。');
      const isLink = data.mode === 'link';
      if (isLink) {
        const auth = await instance(req), verified = await auth.api.getSession({ headers: authHeaders(req) });
        if (!current || !verified || linked(current)?.auth_user_id !== verified.user.id) throw fail(401, '请先重新登录学生账号，再绑定手机号。');
      }
      const result = await invoke(req, '/phone-number/verify', { phoneNumber: number, code: data.code, updatePhoneNumber: isLink }, res, isLink ? undefined : '');
      if (current && !activeSession(initiating.token, current.id)) { if (!isLink) discardUnlinked(result.user.id); throw fail(401, '原学生连接已退出，请重新登录。'); }
      send(200, grant(req, res, resolveStudent(result.user, current, data.name))); return true;
    }
    if (path === '/api/account/social/start') {
      if (!['wechat', 'apple'].includes(data.provider)) throw fail(400, '不支持的登录方式。');
      if (data.provider === 'apple') throw fail(403, 'Apple 登录仅在 iPhone/iPad 客户端提供。');
      const availability = await options(req);
      if (!availability[data.provider].enabled) throw fail(503, availability[data.provider].reason);
      if ((req.headers['user-agent'] || '').includes('FreeImproStudent/')) throw fail(409, '请通过浏览器完成平台登录，原生授权连接尚未配置。');
      const mode = data.mode === 'link' ? 'link' : 'login';
      if (mode === 'link') {
        const auth = await instance(req), verified = await auth.api.getSession({ headers: authHeaders(req) });
        if (!current || !verified || linked(current)?.auth_user_id !== verified.user.id) throw fail(401, '请先重新登录学生账号，再绑定平台账号。');
      }
      const token = randomBytes(32).toString('hex'), origin = originFor(req);
      run('DELETE FROM student_auth_intents WHERE expires<?', Date.now());
      run('INSERT INTO student_auth_intents(digest,student_id,mode,origin,expires,session_digest) VALUES(?,?,?,?,?,?)', sha(token), current?.id || null, mode, origin, Date.now() + 600000, initiating.token || null);
      const result = await invoke(req, mode === 'link' ? '/link-social' : '/sign-in/social', { provider: data.provider, callbackURL: origin + '/api/student/account/finish?intent=' + token, errorCallbackURL: origin + '/?student_auth=error', disableRedirect: true }, res, mode === 'login' ? '' : undefined);
      appendCookies(res, [intentCookie(token, 600)]);
      send(200, { url: result.url }); return true;
    }
    throw fail(404, '没有找到这个登录操作。');
  }
  async function signOut(req, res) {
    const previous = session(req);
    if (previous.token) nativeAuth.signOut(previous.token);
    if (previous.token) run('DELETE FROM student_auth_intents WHERE session_digest=?', previous.token);
    appendCookies(res, [intentCookie('', 0)]);
    const auth = await instance(req);
    const response = await auth.handler(new Request(originFor(req) + basePath + '/sign-out', { method: 'POST', headers: authHeaders(req), body: '{}' }));
    appendCookies(res, response.headers.getSetCookie());
  }
  return { handle, signOut, isLinked: user => Boolean(linked(user)), options };
}
