import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyCloudRelease } from '../scripts/verify-cloud-release.js';
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'empvc-release-check-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'server'));
  writeFileSync(join(directory, 'server/cloud.js'), 'candidate source');
  const save = files => {
    const bytes = JSON.stringify({ sourceState: 'candidate', files });
    writeFileSync(join(directory, 'release-manifest.json'), bytes);
    return hash(bytes);
  };
  return { directory, save };
}
test('release verification requires the externally reviewed manifest and exact source bytes', t => {
  const f = fixture(t), expectedManifestSha256 = f.save({ 'server/cloud.js': hash('candidate source') });
  assert.equal(verifyCloudRelease({ directory: f.directory, expectedManifestSha256 }).checkedFiles, 1);
  assert.throws(() => verifyCloudRelease({ directory: f.directory }), /SHA256/);
  assert.throws(() => verifyCloudRelease({ directory: f.directory, expectedManifestSha256: '0'.repeat(64) }), /不匹配/);
});
test('modified release bytes cannot pass the reviewed manifest', t => {
  const f = fixture(t), expectedManifestSha256 = f.save({ 'server/cloud.js': hash('candidate source') });
  writeFileSync(join(f.directory, 'server/cloud.js'), 'modified source');
  assert.throws(() => verifyCloudRelease({ directory: f.directory, expectedManifestSha256 }), /完整性/);
});
test('the server rhythm dependency is allowed without including unrelated client source', t => {
  const f = fixture(t);
  mkdirSync(join(f.directory, 'src'));
  writeFileSync(join(f.directory, 'src/rhythm-data.js'), 'runtime rhythm helpers');
  const expectedManifestSha256 = f.save({ 'src/rhythm-data.js': hash('runtime rhythm helpers') });
  assert.equal(verifyCloudRelease({ directory: f.directory, expectedManifestSha256 }).checkedFiles, 1);
  const disallowed = f.save({ 'src/private.js': hash('private') });
  assert.throws(() => verifyCloudRelease({ directory: f.directory, expectedManifestSha256: disallowed }), /不允许/);
});
test('database, actual environment and traversing paths are rejected before reading them', t => {
  const f = fixture(t);
  for (const relative of ['data/classroom.sqlite', '.env', 'server/.env', 'server/private.key', 'scripts/private.p8', 'server/../private.txt', '/private.txt', 'server\\cloud.js']) {
    const expectedManifestSha256 = f.save({ [relative]: hash('private synthetic value') });
    assert.throws(() => verifyCloudRelease({ directory: f.directory, expectedManifestSha256 }));
  }
});
test('an in-scope symlink cannot redirect release verification to another file', { skip: process.platform === 'win32' }, t => {
  const f = fixture(t);
  writeFileSync(join(f.directory, 'outside.txt'), 'candidate source');
  rmSync(join(f.directory, 'server/cloud.js'));
  symlinkSync(join(f.directory, 'outside.txt'), join(f.directory, 'server/cloud.js'));
  const expectedManifestSha256 = f.save({ 'server/cloud.js': hash('candidate source') });
  assert.throws(() => verifyCloudRelease({ directory: f.directory, expectedManifestSha256 }), /受控/);
});
