import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createAdminDatabase } from '../server/admin-database.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const python = process.platform === 'win32' ? resolve(root, 'data/admin/venv/Scripts/python.exe') : resolve(root, 'data/admin/venv/bin/python');
const prefix = '/api/admin/database';

test('database viewer initialization allows memory and relative classroom databases', () => {
  createAdminDatabase({ dbPath: ':memory:' }).close();
  createAdminDatabase({ dbPath: 'data/classroom.sqlite' }).close();
  createAdminDatabase().close();
});

test('actual sqlite-web reads temporary data and masks credentials across query and export', { skip: !existsSync(python) }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'empvc-admin-sqlite-'));
  const dbPath = join(directory, 'classroom.sqlite');
  const secretPath = join(directory, 'private.txt');
  const secondDb = join(directory, 'other.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT, password TEXT, salt TEXT);
    CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id TEXT);
    CREATE TABLE image_jobs (id TEXT PRIMARY KEY, claim_id TEXT);
    CREATE TABLE image_mcp_tokens (digest TEXT PRIMARY KEY);
    CREATE TABLE image_mcp_activity (digest TEXT PRIMARY KEY);
    CREATE TABLE admin_accounts (id TEXT PRIMARY KEY, password TEXT, salt TEXT);
    CREATE TABLE admin_sessions (token TEXT PRIMARY KEY);
    INSERT INTO users VALUES ('fixture', 'Admin test teacher', 'fixture-password-private', 'fixture-salt-private');
    INSERT INTO sessions VALUES ('fixture-session-private', 'fixture');
    INSERT INTO image_jobs VALUES ('fixture-job', 'fixture-claim-private');
    INSERT INTO image_mcp_tokens VALUES ('fixture-digest-private');
    INSERT INTO image_mcp_activity VALUES ('fixture-activity-private');
    INSERT INTO admin_accounts VALUES ('fixture-admin', 'fixture-admin-password-private', 'fixture-admin-salt-private');
    INSERT INTO admin_sessions VALUES ('fixture-admin-session-private');`);
  db.exec(`CREATE TABLE student_recovery_codes (digest TEXT PRIMARY KEY, issuer_session TEXT, student_id TEXT);
    INSERT INTO student_recovery_codes VALUES ('fixture-recovery-private', 'fixture-issuer-private', 'fixture');`);
  const authTables = ['student_auth_user', 'student_auth_session', 'student_auth_account', 'student_auth_verification', 'student_auth_links', 'student_auth_settings', 'student_auth_intents', 'student_auth_future_credentials'];
  for (const table of authTables) {
    db.exec(`CREATE TABLE ${table} (id TEXT PRIMARY KEY, private_value TEXT)`);
    db.prepare(`INSERT INTO ${table} VALUES (?,?)`).run('fixture', 'fixture-auth-private');
  }
  writeFileSync(secretPath, 'fixture-file-private');
  const browser = createAdminDatabase({ dbPath: relative(process.cwd(), dbPath) });
  const server = http.createServer((req, res) => { browser.proxy(req, res); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    browser.close();
    server.closeAllConnections();
    await new Promise(resolveClose => server.close(resolveClose));
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const request = async (path, options) => {
    const response = await fetch(base + prefix + path, options);
    return { status: response.status, headers: response.headers, body: await response.text() };
  };
  const query = sql => request('/query/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: 'teacher_session=private', authorization: 'Bearer private', 'sec-fetch-site': 'same-origin' }, body: new URLSearchParams({ sql }) });
  const home = await request('/');
  assert.equal(home.status, 200);
  assert.match(home.body, /users/);
  assert.equal(home.headers.get('set-cookie'), null);
  const content = await request('/users/content/');
  assert.equal(content.status, 200);
  assert.match(content.body, /Admin test teacher/);
  assert.doesNotMatch(content.body, /fixture-(password|salt)-private/);
  const credentials = await query('SELECT users.display_name, users.password, users.salt, sessions.token, image_jobs.claim_id, image_mcp_tokens.digest, image_mcp_activity.digest, admin_accounts.password, admin_accounts.salt, admin_sessions.token FROM users CROSS JOIN sessions CROSS JOIN image_jobs CROSS JOIN image_mcp_tokens CROSS JOIN image_mcp_activity CROSS JOIN admin_accounts CROSS JOIN admin_sessions');
  assert.equal(credentials.status, 200);
  assert.match(credentials.body, /Admin test teacher/);
  assert.doesNotMatch(credentials.body, /fixture-[a-z-]+-private/);
  const csv = await request('/users/export/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams([['export_format', 'csv'], ['columns', 'display_name'], ['columns', 'password'], ['columns', 'salt']]) });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /csv/);
  assert.match(csv.body, /Admin test teacher/);
  assert.doesNotMatch(csv.body, /fixture-(password|salt)-private/);
  const recovery = await query('SELECT digest,issuer_session,student_id FROM student_recovery_codes');
  assert.equal(recovery.status, 200);
  assert.doesNotMatch(recovery.body, /fixture-(recovery|issuer)-private/);
  for (const table of authTables) {
    const result = await query(`SELECT * FROM "${table.toUpperCase()}"`);
    assert.equal(result.status, 200);
    assert.match(result.body, /not authorized|authorization denied|prohibited/i);
    assert.doesNotMatch(result.body, /fixture-auth-private/);
    assert.equal((await request(`/${table}/content/`)).status, 403);
    assert.equal((await request(`/${table}/export/`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ export_format: 'csv' }) })).status, 403);
  }
  const joinedAuth = await query('WITH private AS (SELECT private_value FROM student_auth_settings) SELECT users.display_name,private.private_value FROM users CROSS JOIN private');
  assert.equal(joinedAuth.status, 200);
  assert.match(joinedAuth.body, /not authorized|authorization denied|prohibited/i);
  assert.doesNotMatch(joinedAuth.body, /fixture-auth-private/);
  for (const sql of [
    "UPDATE users SET display_name='Hacked'",
    'PRAGMA user_version=77',
    'PRAGMA query_only=OFF',
    "CREATE TABLE hacked (id TEXT)",
    `ATTACH DATABASE '${secondDb.replaceAll("'", "''")}' AS other`,
    `SELECT readfile('${secretPath.replaceAll("'", "''")}')`,
    "SELECT load_extension('unsafe')",
    'SELECT data FROM sqlite_dbpage',
  ]) {
    const result = await query(sql);
    assert.equal(result.status, 200);
    assert.doesNotMatch(result.body, /fixture-file-private/);
    assert.match(result.body, /not authorized|authorization denied|no such function|no such table|readonly|read-only/i);
  }
  assert.equal(db.prepare('SELECT display_name FROM users').get().display_name, 'Admin test teacher');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 0);
  assert.equal(existsSync(secondDb), false);
  assert.equal((await request('/download/')).status, 403);
  assert.equal((await request('/load/')).status, 403);
  assert.equal((await request('/users/insert/')).status, 403);
  assert.equal((await query('PRAGMA table_info(users)')).status, 200);
  const redirected = await fetch(base + prefix + '/users/content', { redirect: 'manual' });
  assert.equal(redirected.status, 308);
  assert.equal(redirected.headers.get('location'), prefix + '/users/content/');
});
