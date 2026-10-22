import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { encryptSnapshot, decryptSnapshot } from '../scripts/cloud-migration-envelope.js';

test('encrypted classroom chunks restore a real SQLite snapshot and reject corruption or overwrite', t => {
  const root = mkdtempSync(join(tmpdir(), 'classroom-envelope-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source.sqlite'), db = new DatabaseSync(source);
  db.exec('CREATE TABLE sample (id TEXT PRIMARY KEY, audio BLOB)');
  const audio = randomBytes(64000); db.prepare('INSERT INTO sample VALUES (?, ?)').run('same-identity', audio); db.close();
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const info = encryptSnapshot({ source, publicKey: keys.publicKey, directory: join(root, 'chunks') });
  assert.ok(info.parts.length >= 3);
  for (const part of info.parts) assert.ok(readFileSync(join(info.directory, part)).length <= 24 * 1024);
  const options = { directory: info.directory, privateKey: keys.privateKey, expectedSha256: info.sha256, envelopeSha256: info.envelopeSha256, partCount: info.parts.length, output: join(root, 'restored.sqlite') };
  decryptSnapshot(options);
  const restored = new DatabaseSync(options.output, { readOnly: true });
  assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  const row = restored.prepare('SELECT * FROM sample').get(); assert.equal(row.id, 'same-identity'); assert.deepEqual(Buffer.from(row.audio), audio); restored.close();
  assert.throws(() => decryptSnapshot(options), /EEXIST/);
  assert.throws(() => decryptSnapshot({ ...options, partCount: info.parts.length + 1 }), /数量/);
  const changed = readFileSync(join(info.directory, info.parts.at(-1))); changed[0] ^= 1; writeFileSync(join(info.directory, info.parts.at(-1)), changed);
  assert.throws(() => decryptSnapshot({ ...options, output: join(root, 'bad.sqlite') }), /校验失败/);
});
