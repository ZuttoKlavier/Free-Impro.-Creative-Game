import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, scryptSync } from 'node:crypto';
import { verifyPassword } from 'better-auth/crypto';
import { createApp } from '../server/app.js';
import { provisionAdmin } from '../server/admin.js';

const password = 'synthetic-student-password-123';
const adminPassword = 'synthetic-admin-password-123';

async function fixture(t) {
  const otp = new Map();
  const app = createApp({ dbPath: ':memory:', studentAuthOptions: { env: {}, sendOTP: ({ phoneNumber, code }) => otp.set(phoneNumber, code) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.db.close(); });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  function client(role) {
    const jar = new Map();
    const request = async (path, data) => {
      const response = await fetch(`${origin}/api/${role}${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { Origin: origin, Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '), 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
      for (const entry of response.headers.getSetCookie()) {
        const pair = entry.split(';')[0], equals = pair.indexOf('=');
        if (/Max-Age=0(?:;|$)/i.test(entry)) jar.delete(pair.slice(0, equals));
        else jar.set(pair.slice(0, equals), pair.slice(equals + 1));
      }
      return { status: response.status, data: await response.json() };
    };
    return request;
  }
  await provisionAdmin(app.db, { username: 'auth_admin', password: adminPassword });
  const admin = client('admin');
  assert.equal((await admin('/login', { username: 'auth_admin', password: adminPassword })).status, 200);
  async function register(username) {
    const request = client('student');
    const result = await request('/account/register', { username, password, name: username });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    const user = result.data.user, authId = app.db.prepare('SELECT auth_user_id FROM student_auth_links WHERE student_id=?').get(user.id).auth_user_id;
    return { request, user, authId };
  }
  function verification(identifier, value = '123456:0') {
    app.db.prepare('INSERT INTO student_auth_verification (id,identifier,value,expiresAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?)').run(randomUUID(), identifier, value, Date.now() + 600000, Date.now(), Date.now());
  }
  return { ...app, origin, client, admin, register, verification, otp };
}

test('admin password reset changes both hashes and revokes all linked sessions without affecting other students', async t => {
  const f = await fixture(t), student = await f.register('reset_student'), other = await f.register('other_student');
  const nextPassword = 'synthetic-new-student-password-456';
  f.db.prepare('INSERT INTO student_auth_intents(digest,student_id,mode,origin,expires) VALUES (?,?,?,?,?)').run('reset-intent', student.user.id, 'link', f.origin, Date.now() + 600000);
  const reset = await f.admin(`/users/${student.user.id}/password`, { password: nextPassword });
  assert.equal(reset.status, 200, JSON.stringify(reset.data));
  assert.equal((await student.request('/me')).status, 401);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM student_auth_session WHERE userId=?').get(student.authId).n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM student_auth_intents WHERE student_id=?').get(student.user.id).n, 0);
  const legacy = f.db.prepare('SELECT salt,password FROM users WHERE id=?').get(student.user.id);
  assert.equal(scryptSync(nextPassword, legacy.salt, 64).toString('hex'), legacy.password);
  const credential = f.db.prepare("SELECT password FROM student_auth_account WHERE userId=? AND providerId='credential'").get(student.authId);
  assert.equal(await verifyPassword({ hash: credential.password, password: nextPassword }), true);
  assert.equal(await verifyPassword({ hash: credential.password, password }), false);
  const fresh = f.client('student');
  assert.equal((await fresh('/account/login', { username: student.user.username, password })).status, 401);
  const login = await fresh('/account/login', { username: student.user.username, password: nextPassword });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.user.id, student.user.id);
  assert.equal((await other.request('/me')).status, 200);
  assert.ok(f.db.prepare('SELECT COUNT(*) AS n FROM student_auth_session WHERE userId=?').get(other.authId).n > 0);
});

test('admin session revoke removes both login stores and pending callback intents while keeping account credentials', async t => {
  const f = await fixture(t), student = await f.register('revoked_student'), other = await f.register('kept_student');
  f.db.prepare('INSERT INTO student_auth_intents(digest,student_id,mode,origin,expires) VALUES (?,?,?,?,?)').run('revoke-intent', student.user.id, 'link', f.origin, Date.now() + 600000);
  assert.equal((await f.admin(`/users/${student.user.id}/revoke`, {})).status, 200);
  assert.equal((await student.request('/me')).status, 401);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(student.user.id).n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM student_auth_session WHERE userId=?').get(student.authId).n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM student_auth_intents WHERE student_id=?').get(student.user.id).n, 0);
  assert.ok(f.db.prepare('SELECT 1 FROM student_auth_account WHERE userId=?').get(student.authId));
  assert.equal((await other.request('/me')).status, 200);
  const login = await f.client('student')('/account/login', { username: student.user.username, password });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.id, student.user.id);
});

test('admin account deletion cleans only the owned auth identity, OTPs and callback state', async t => {
  const f = await fixture(t), student = await f.register('deleted_student'), other = await f.register('retained_student');
  const phone = '+8613800000000', otherPhone = '+8613900000000';
  f.db.prepare('UPDATE student_auth_user SET phoneNumber=?,phoneNumberVerified=1 WHERE id=?').run(phone, student.authId);
  const email = f.db.prepare('SELECT email FROM student_auth_user WHERE id=?').get(student.authId).email;
  for (const identifier of [phone, phone + '-request-password-reset', email, otherPhone]) f.verification(identifier);
  f.verification('reset-password:owned-fixture', student.authId);
  f.verification('reset-password:other-fixture', other.authId);
  f.db.prepare('INSERT INTO student_auth_intents(digest,student_id,mode,origin,expires) VALUES (?,?,?,?,?)').run('delete-intent', student.user.id, 'link', f.origin, Date.now() + 600000);
  const removed = await f.admin(`/users/${student.user.id}/delete`, { confirmation: student.user.id });
  assert.equal(removed.status, 200, JSON.stringify(removed.data));
  for (const [table, column, value] of [['users', 'id', student.user.id], ['student_auth_user', 'id', student.authId], ['student_auth_links', 'student_id', student.user.id], ['student_auth_account', 'userId', student.authId], ['student_auth_session', 'userId', student.authId], ['student_auth_intents', 'student_id', student.user.id]]) {
    assert.equal(f.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column}=?`).get(value).n, 0, table);
  }
  const remaining = f.db.prepare('SELECT identifier FROM student_auth_verification ORDER BY identifier').all().map(row => row.identifier);
  assert.deepEqual(remaining, [otherPhone, 'reset-password:other-fixture'].sort());
  assert.equal((await other.request('/me')).status, 200);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal((await f.client('student')('/account/login', { username: student.user.username, password })).status, 401);
});

test('admin password management cannot add credential login to a phone-only account', async t => {
  const f = await fixture(t), phoneNumber = '+8613700000000', student = f.client('student');
  assert.equal((await student('/account/phone/send', { phoneNumber })).status, 200);
  const login = await student('/account/phone/verify', { phoneNumber, code: f.otp.get(phoneNumber), name: '手机测试学生' });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  const before = f.db.prepare('SELECT password,salt FROM users WHERE id=?').get(login.data.user.id);
  const reset = await f.admin(`/users/${login.data.user.id}/password`, { password });
  assert.equal(reset.status, 409);
  assert.match(reset.data.error, /尚未设置密码/);
  assert.deepEqual(f.db.prepare('SELECT password,salt FROM users WHERE id=?').get(login.data.user.id), before);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM student_auth_account WHERE providerId='credential'").get().n, 0);
  assert.equal((await student('/me')).status, 200);
});
