import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { initializeAdmin } from '../server/admin.js';

const script = fileURLToPath(new URL('../scripts/admin-setup.js', import.meta.url));
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'empvc-admin-setup-'));
  const dbPath = join(directory, 'classroom.sqlite');
  const login = join(directory, 'data/admin/initial-login.txt');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const run = () => spawnSync(process.execPath, [script, '--generate'], { cwd: directory, env: { ...process.env, FREE_IMPRO_DB: dbPath }, encoding: 'utf8' });
  return { dbPath, login, run };
}

test('local admin setup keeps generated credentials private and does not overwrite them', t => {
  const f = fixture(t), result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const contents = readFileSync(f.login, 'utf8');
  const password = /管理员密码：(.+)/.exec(contents)[1];
  assert.ok(password.length >= 12);
  assert.ok(!result.stdout.includes(password));
  assert.ok(!result.stderr.includes(password));
  if (process.platform !== 'win32') assert.equal(statSync(f.login).mode & 0o777, 0o600);
  const db = new DatabaseSync(f.dbPath);
  try { assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_accounts').get().n, 1); assert.notEqual(db.prepare('SELECT password FROM admin_accounts').get().password, password); } finally { db.close(); }
  assert.equal(f.run().status, 1);
  assert.equal(readFileSync(f.login, 'utf8'), contents);
});

test('failed local setup rolls back the account and removes only its newly created credential file', t => {
  const f = fixture(t), db = new DatabaseSync(f.dbPath);
  initializeAdmin(db);
  db.exec("CREATE TRIGGER block_fixture BEFORE INSERT ON admin_accounts BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  assert.equal(f.run().status, 1);
  assert.equal(existsSync(f.login), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_accounts').get().n, 0);
  db.exec('DROP TRIGGER block_fixture'); db.close();
  assert.equal(f.run().status, 0);
  assert.equal(existsSync(f.login), true);
});
