import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveLocalImageToken } from '../server/local-image-token.js';

const valid = 'a1'.repeat(32);
const original = 'b2'.repeat(32);

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'empvc-local-image-token-'));
  const data = join(root, 'data');
  const parent = join(data, 'image-mcp');
  const file = join(parent, 'teacher.token');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, data, parent, file };
}

function seed(f) {
  mkdirSync(f.parent, { recursive: true, mode: 0o700 });
  writeFileSync(f.file, original, { mode: 0o600 });
}

test('local image token replaces the file atomically with private permissions', t => {
  const f = fixture(t); seed(f);
  chmodSync(f.data, 0o755); chmodSync(f.parent, 0o755); chmodSync(f.file, 0o644);
  const oldInode = statSync(f.file).ino;
  saveLocalImageToken(valid, f.file);
  assert.equal(readFileSync(f.file, 'utf8'), valid);
  assert.notEqual(statSync(f.file).ino, oldInode);
  if (process.platform !== 'win32') {
    assert.equal(statSync(f.parent).mode & 0o777, 0o700);
    assert.equal(statSync(f.file).mode & 0o777, 0o600);
    assert.equal(statSync(f.data).mode & 0o777, 0o755);
  }
  assert.deepEqual(readdirSync(f.parent), ['teacher.token']);
});

test('local image token creates only the missing direct parent and retains grandparent permissions', t => {
  const f = fixture(t); mkdirSync(f.data); chmodSync(f.data, 0o755);
  saveLocalImageToken(valid, f.file);
  assert.equal(readFileSync(f.file, 'utf8'), valid);
  if (process.platform !== 'win32') {
    assert.equal(statSync(f.parent).mode & 0o777, 0o700);
    assert.equal(statSync(f.file).mode & 0o777, 0o600);
    assert.equal(statSync(f.data).mode & 0o777, 0o755);
  }
});

test('invalid local image token values leave the existing file and permissions intact', t => {
  const f = fixture(t); seed(f); chmodSync(f.parent, 0o755);
  for (const token of [null, '', 'a'.repeat(63), valid + 'a', valid.toUpperCase(), valid + '\n', 'sk-' + 'a'.repeat(61), valid.slice(1) + 'é']) {
    assert.throws(() => saveLocalImageToken(token, f.file), error => {
      assert.equal(error.code, 'IMAGE_TOKEN_INVALID');
      if (typeof token === 'string' && token) assert.equal(error.message.includes(token), false);
      return true;
    });
    assert.equal(readFileSync(f.file, 'utf8'), original);
    assert.deepEqual(readdirSync(f.parent), ['teacher.token']);
    if (process.platform !== 'win32') assert.equal(statSync(f.parent).mode & 0o777, 0o755);
  }
});

test('local image token requires an absolute server-configured path', t => {
  const f = fixture(t); seed(f);
  for (const path of [null, '', 'data/image-mcp/teacher.token']) {
    assert.throws(() => saveLocalImageToken(valid, path), error => error.code === 'IMAGE_TOKEN_PATH_INVALID' && !error.message.includes(valid));
  }
  assert.equal(readFileSync(f.file, 'utf8'), original);
});

test('local image token rejects ordinary and broken destination symlinks', t => {
  for (const broken of [false, true]) {
    const f = fixture(t); mkdirSync(f.parent, { recursive: true });
    const target = join(f.root, 'symlink-target');
    if (!broken) writeFileSync(target, original);
    symlinkSync(target, f.file);
    assert.throws(() => saveLocalImageToken(valid, f.file), error => error.code === 'IMAGE_TOKEN_PATH_UNSAFE');
    assert.equal(lstatSync(f.file).isSymbolicLink(), true);
    if (broken) assert.equal(existsSync(target), false); else assert.equal(readFileSync(target, 'utf8'), original);
    assert.deepEqual(readdirSync(f.parent), ['teacher.token']);
  }
});

test('local image token rejects symlink direct parents and symlink grandparents when creating a parent', t => {
  for (const linked of ['parent', 'grandparent']) {
    const f = fixture(t); const target = join(f.root, 'symlink-target'); mkdirSync(target);
    if (linked === 'parent') {
      mkdirSync(f.data); writeFileSync(join(target, 'teacher.token'), original);
      symlinkSync(target, f.parent);
    } else symlinkSync(target, f.data);
    assert.throws(() => saveLocalImageToken(valid, f.file), error => error.code === 'IMAGE_TOKEN_PATH_UNSAFE');
    assert.deepEqual(readdirSync(target), linked === 'parent' ? ['teacher.token'] : []);
    if (linked === 'parent') assert.equal(readFileSync(join(target, 'teacher.token'), 'utf8'), original);
  }
});

test('local image token refuses missing ancestors and invalid target file types', t => {
  const missing = fixture(t);
  assert.throws(() => saveLocalImageToken(valid, missing.file), error => error.code === 'IMAGE_TOKEN_DIRECTORY_MISSING');
  assert.equal(existsSync(missing.data), false);
  const directory = fixture(t); mkdirSync(directory.file, { recursive: true });
  assert.throws(() => saveLocalImageToken(valid, directory.file), error => error.code === 'IMAGE_TOKEN_PATH_UNSAFE');
  assert.equal(statSync(directory.file).isDirectory(), true);
  assert.deepEqual(readdirSync(directory.parent), ['teacher.token']);
});

test('local image token rejects paths not owned by the current user', { skip: typeof process.getuid !== 'function' }, t => {
  const f = fixture(t); seed(f);
  const uid = process.getuid();
  t.mock.method(process, 'getuid', () => uid + 1);
  assert.throws(() => saveLocalImageToken(valid, f.file), error => error.code === 'IMAGE_TOKEN_PATH_UNSAFE');
  assert.equal(readFileSync(f.file, 'utf8'), original);
  assert.deepEqual(readdirSync(f.parent), ['teacher.token']);
});

test('local image token wraps filesystem failures without credential or path disclosures', t => {
  const f = fixture(t); seed(f);
  const path = join(f.parent, 'x'.repeat(300));
  assert.throws(() => saveLocalImageToken(valid, path), error => {
    assert.equal(error.code, 'IMAGE_TOKEN_SAVE_FAILED');
    assert.equal(error.message.includes(valid), false);
    assert.equal(error.message.includes(path), false);
    return true;
  });
  assert.equal(readFileSync(f.file, 'utf8'), original);
  assert.deepEqual(readdirSync(f.parent), ['teacher.token']);
});
