import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
const opaque = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const proof = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) && Buffer.from(value, 'base64url').length === 32 && Buffer.from(value, 'base64url').toString('base64url') === value;
const callback = 'freeimprostudent://auth/callback?ticket=';

// The system browser and native cookie jar have independent sessions. A
// browser callback can only prepare a result; only the native, private PKCE
// verifier can exchange it for a classroom session.
export function createStudentNativeAuth({ db, session, activeSession, instance, invoke, mintSession, authHeaders, appendCookies, intentCookie, options, originFor, resolveStudent, grant }) {
  db.exec(`CREATE TABLE IF NOT EXISTS student_auth_native_handoffs(
    digest TEXT PRIMARY KEY, student_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, mode TEXT NOT NULL, origin TEXT NOT NULL, expires INTEGER NOT NULL,
    challenge TEXT NOT NULL, session_digest TEXT, initial_auth_user_id TEXT, initial_auth_session_id TEXT,
    state TEXT NOT NULL DEFAULT 'pending', intent_digest TEXT UNIQUE REFERENCES student_auth_intents(digest) ON DELETE CASCADE,
    delegated_session_id TEXT, verified_auth_user_id TEXT, verified_session_id TEXT, ticket_digest TEXT UNIQUE
  )`);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const librarySession = (id, userId) => id && one('SELECT 1 FROM student_auth_session WHERE id=? AND userId=? AND expiresAt>?', id, userId, Date.now());
  function remove(record) {
    // Initial library sessions belong to the native caller. Only sessions
    // delegated to this browser flow are destroyed here.
    for (const id of new Set([record.delegated_session_id, record.verified_session_id].filter(Boolean))) run('DELETE FROM student_auth_session WHERE id=?', id);
    if (record.intent_digest) run('DELETE FROM student_auth_intents WHERE digest=?', record.intent_digest);
    run('DELETE FROM student_auth_native_handoffs WHERE digest=?', record.digest);
  }
  function active(record, origin) {
    const fresh = record && one('SELECT * FROM student_auth_native_handoffs WHERE digest=? AND origin=? AND expires>?', record.digest, origin, Date.now());
    if (!fresh) { if (record?.origin === origin && record.expires <= Date.now()) remove(record); throw fail(403, '客户端授权已过期或已取消，请重新登录。'); }
    if (fresh.student_id && (!activeSession(fresh.session_digest, fresh.student_id) || one('SELECT role FROM users WHERE id=?', fresh.student_id)?.role !== 'student')) throw fail(401, '原学生连接已退出，请重新发起登录。');
    if (fresh.mode === 'link' && (!librarySession(fresh.initial_auth_session_id, fresh.initial_auth_user_id) || one('SELECT auth_user_id FROM student_auth_links WHERE student_id=?', fresh.student_id)?.auth_user_id !== fresh.initial_auth_user_id)) throw fail(401, '学生账号验证已变更，请重新登录后绑定。');
    return fresh;
  }
  function verified(record, origin) {
    const fresh = active(record, origin);
    if (!librarySession(fresh.verified_session_id, fresh.verified_auth_user_id)) throw fail(401, '平台登录验证已失效，请重新登录。');
    if (fresh.mode === 'link' && fresh.verified_auth_user_id !== fresh.initial_auth_user_id) throw fail(409, '平台账号与当前学生账号不符，请重新绑定。');
    const authUser = one('SELECT * FROM student_auth_user WHERE id=?', fresh.verified_auth_user_id);
    if (!authUser) throw fail(401, '学生账号验证已变更，请重新登录。');
    const target = one('SELECT u.role FROM users u JOIN student_auth_links l ON l.student_id=u.id WHERE l.auth_user_id=?', authUser.id);
    if (target && target.role !== 'student') throw fail(403, '请使用学生账号。');
    return { record: fresh, authUser };
  }
  function assertProof(record, verifier) {
    if (!proof(verifier)) throw fail(403, '客户端授权凭证无效，请重新登录。');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    if (!timingSafeEqual(Buffer.from(challenge), Buffer.from(record.challenge))) throw fail(403, '客户端授权凭证无效，请重新登录。');
  }
  function sameInitiator(req, record) {
    const current = session(req);
    if ((current.user?.id || null) !== record.student_id || (current.token || null) !== record.session_digest) throw fail(409, '学生连接已更改，请重新发起登录。');
  }
  function prune() {
    for (const record of db.prepare('SELECT * FROM student_auth_native_handoffs WHERE expires<=?').all(Date.now())) remove(record);
  }
  async function start(req, res, data, send) {
    if (!['wechat', 'apple'].includes(data.provider) || !['login', 'link'].includes(data.mode || 'login') || !proof(data.codeChallenge)) throw fail(400, '客户端授权参数无效，请重新登录。');
    const available = await options(req);
    if (!available[data.provider].enabled) throw fail(503, available[data.provider].reason);
    const initiating = session(req), mode = data.mode || 'login', origin = originFor(req);
    if (initiating.user && (!activeSession(initiating.token, initiating.user.id) || initiating.user.role !== 'student')) throw fail(401, '请重新登录学生账号。');
    let initial;
    if (mode === 'link') {
      const auth = await instance(req);
      initial = await auth.api.getSession({ headers: authHeaders(req) });
      if (!initiating.user || !initial || one('SELECT auth_user_id FROM student_auth_links WHERE student_id=?', initiating.user.id)?.auth_user_id !== initial.user.id || !activeSession(initiating.token, initiating.user.id)) throw fail(401, '请先重新登录学生账号，再绑定平台账号。');
    }
    prune();
    const handoffId = randomBytes(32).toString('hex');
    run('INSERT INTO student_auth_native_handoffs(digest,student_id,provider,mode,origin,expires,challenge,session_digest,initial_auth_user_id,initial_auth_session_id) VALUES(?,?,?,?,?,?,?,?,?,?)', digest(handoffId), initiating.user?.id || null, data.provider, mode, origin, Date.now() + 600000, data.codeChallenge, initiating.token || null, initial?.user.id || null, initial?.session.id || null);
    send(200, { handoffId, browserURL: origin + '/api/student/account/native/open?handoffId=' + handoffId });
  }
  async function open(req, res) {
    const url = new URL(req.url, originFor(req)), handoffId = url.searchParams.get('handoffId');
    if (!opaque(handoffId) || [...url.searchParams].length !== 1) throw fail(400, '客户端授权地址无效。');
    let record = active(one('SELECT * FROM student_auth_native_handoffs WHERE digest=?', digest(handoffId)), originFor(req));
    if (run("UPDATE student_auth_native_handoffs SET state='opening' WHERE digest=? AND state='pending'", record.digest).changes !== 1) throw fail(403, '客户端授权地址已使用，请重新登录。');
    try {
      let cookies = [], cookieHeader = '';
      if (record.mode === 'link') {
        const delegated = await mintSession(req, record.initial_auth_user_id, () => { record = active(record, originFor(req)); });
        cookies = delegated.cookies;
        cookieHeader = cookies.map(cookie => cookie.split(';')[0]).join('; ');
        run('UPDATE student_auth_native_handoffs SET delegated_session_id=? WHERE digest=?', delegated.sessionId, record.digest);
      }
      record = active(record, originFor(req));
      const token = randomBytes(32).toString('hex'), intentDigest = digest(token);
      run('INSERT INTO student_auth_intents(digest,student_id,mode,origin,expires,session_digest) VALUES(?,?,?,?,?,?)', intentDigest, record.student_id, record.mode, record.origin, record.expires, record.session_digest);
      run("UPDATE student_auth_native_handoffs SET intent_digest=?,state='browser' WHERE digest=?", intentDigest, record.digest);
      record.intent_digest = intentDigest;
      // Ignore the browser's existing auth identity. Linking is delegated from
      // the authenticated native session; login starts with an empty identity.
      const result = await invoke(req, record.mode === 'link' ? '/link-social' : '/sign-in/social', { provider: record.provider, callbackURL: record.origin + '/api/student/account/finish?intent=' + token, errorCallbackURL: record.origin + '/?student_auth=error', disableRedirect: true }, res, cookieHeader);
      active(record, originFor(req));
      appendCookies(res, [...cookies, intentCookie(token, 600)]);
      res.writeHead(303, { Location: result.url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end();
    } catch (error) { remove(record); throw error; }
  }
  async function finish(req, res, intent, authenticated) {
    const record = one('SELECT * FROM student_auth_native_handoffs WHERE intent_digest=?', intent.digest);
    if (!record) return false;
    active(record, originFor(req));
    if (record.state !== 'browser' || !authenticated || authenticated.user.id !== intent.verified_auth_user_id || record.verified_auth_user_id !== authenticated.user.id || record.verified_session_id !== authenticated.session.id || !librarySession(authenticated.session.id, authenticated.user.id)) throw fail(401, '平台登录未完成，请重新登录。');
    if (record.mode === 'link' && authenticated.user.id !== record.initial_auth_user_id) throw fail(409, '平台账号与当前学生账号不符，请重新绑定。');
    const ticket = randomBytes(32).toString('hex');
    if (run("UPDATE student_auth_native_handoffs SET state='ready',verified_auth_user_id=?,verified_session_id=?,ticket_digest=? WHERE digest=? AND state='browser'", authenticated.user.id, authenticated.session.id, digest(ticket), record.digest).changes !== 1) throw fail(403, '客户端授权已使用。');
    appendCookies(res, [intentCookie('', 0)]);
    res.writeHead(303, { Location: callback + ticket, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end(); return true;
  }
  async function consume(req, res, data, send) {
    if (!opaque(data.ticket)) throw fail(400, '客户端授权回调无效。');
    const stored = one('SELECT * FROM student_auth_native_handoffs WHERE ticket_digest=?', digest(data.ticket));
    if (!stored) throw fail(403, '客户端授权已过期或已使用，请重新登录。');
    assertProof(stored, data.codeVerifier);
    let { record, authUser } = verified(stored, originFor(req));
    sameInitiator(req, record);
    if (run("UPDATE student_auth_native_handoffs SET state='consuming' WHERE digest=? AND state='ready'", record.digest).changes !== 1) throw fail(403, '客户端授权已使用。');
    let native;
    try {
      native = await mintSession(req, authUser.id, () => { ({ record, authUser } = verified(record, originFor(req))); sameInitiator(req, record); });
      ({ record, authUser } = verified(record, originFor(req)));
      sameInitiator(req, record);
      // Everything after the final revocation check is synchronous. Concurrent
      // consume, sign-out or an administrator reset cannot interleave a grant.
      const previous = record.student_id ? one('SELECT * FROM users WHERE id=?', record.student_id) : null;
      const student = resolveStudent(authUser, previous);
      remove(record);
      appendCookies(res, native.cookies);
      send(200, grant(req, res, student));
    } catch (error) {
      if (native?.sessionId) run('DELETE FROM student_auth_session WHERE id=?', native.sessionId);
      remove(record); throw error;
    }
  }
  async function cancel(req, res, data, send) {
    if (!opaque(data.handoffId)) throw fail(400, '客户端授权参数无效。');
    const record = one('SELECT * FROM student_auth_native_handoffs WHERE digest=? AND origin=?', digest(data.handoffId), originFor(req));
    if (record) { assertProof(record, data.codeVerifier); sameInitiator(req, record); remove(record); }
    send(200, { cancelled: true });
  }
  return {
    open, finish, start, consume, cancel,
    isIntent(intent) { return Boolean(one('SELECT 1 FROM student_auth_native_handoffs WHERE intent_digest=?', intent.digest)); },
    markVerified(intent, authenticated, origin) {
      const record = active(one('SELECT * FROM student_auth_native_handoffs WHERE intent_digest=?', intent.digest), origin);
      if (record.state !== 'browser' || !librarySession(authenticated.session.id, authenticated.user.id) || (record.mode === 'link' && record.initial_auth_user_id !== authenticated.user.id)) throw fail(401, '平台登录验证已失效，请重新登录。');
      if (run("UPDATE student_auth_native_handoffs SET verified_auth_user_id=?,verified_session_id=? WHERE digest=? AND state='browser'", authenticated.user.id, authenticated.session.id, record.digest).changes !== 1) throw fail(403, '客户端授权已取消。');
    },
    assertIntent(intent, origin) { const record = one('SELECT * FROM student_auth_native_handoffs WHERE intent_digest=?', intent.digest); if (record) active(record, origin); },
    assertProviderIntent(intent, origin, provider) {
      const record = one('SELECT * FROM student_auth_native_handoffs WHERE intent_digest=?', intent.digest);
      if (!record || record.provider !== provider) throw fail(403, 'Apple 登录仅在 iPhone/iPad 客户端提供，请重新发起登录。');
      if (active(record, origin).state !== 'browser') throw fail(403, '客户端授权已过期或已使用，请重新登录。');
    },
    signOut(token) { for (const record of db.prepare('SELECT * FROM student_auth_native_handoffs WHERE session_digest=?').all(token)) remove(record); },
  };
}
