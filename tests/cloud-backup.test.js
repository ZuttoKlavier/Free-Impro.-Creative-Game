import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { backupClassroom } from '../scripts/cloud-backup.js';

test('live cloud backup includes committed WAL data and restores original account and binary records', async t => {
  const root = mkdtempSync(join(tmpdir(), 'classroom-backup-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'classroom.sqlite'), db = new DatabaseSync(path); t.after(() => db.close());
  db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE records(id TEXT PRIMARY KEY, bytes BLOB);');
  db.prepare('INSERT INTO records VALUES(?,?)').run('existing-student-id', Buffer.from([0, 1, 127, 255]));
  assert.ok(statSync(path + '-wal').size > 0);
  const snapshot = await backupClassroom({ dbPath: path, directory: join(root, 'backups') });
  const restored = new DatabaseSync(snapshot, { readOnly: true });
  assert.equal(restored.prepare('SELECT id FROM records').get().id, 'existing-student-id');
  assert.deepEqual(Buffer.from(restored.prepare('SELECT bytes FROM records').get().bytes), Buffer.from([0, 1, 127, 255]));
  restored.close();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM records').get().n, 1);
  assert.equal(readdirSync(join(root, 'backups')).length, 1);
  if (process.platform !== 'win32') assert.equal(statSync(snapshot).mode & 0o777, 0o600);
});

test('missing database cannot create an empty replacement or misleading backup', async t => {
  const root = mkdtempSync(join(tmpdir(), 'classroom-backup-missing-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  await assert.rejects(backupClassroom({ dbPath: join(root, 'missing.sqlite'), directory: join(root, 'backup') }));
  assert.deepEqual(readdirSync(root), []);
});
