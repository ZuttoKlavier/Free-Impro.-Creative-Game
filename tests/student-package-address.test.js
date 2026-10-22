import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PUBLIC_CLASSROOM_URL, parseStudentPackageAddress, resolveStudentPackageAddress, validatePublicPackageAddress } from '../scripts/student-package-address.js';

test('the explicit public package address bypasses LAN configuration and stays canonical', () => {
  for (const args of [['--classroom-url', PUBLIC_CLASSROOM_URL], [`--classroom-url=${PUBLIC_CLASSROOM_URL}`]]) {
    const selected = parseStudentPackageAddress(args);
    assert.equal(resolveStudentPackageAddress(selected), PUBLIC_CLASSROOM_URL);
  }
});

test('a plain student package uses the same fixed public classroom', () => {
  assert.equal(parseStudentPackageAddress([]), undefined);
  assert.equal(resolveStudentPackageAddress(), PUBLIC_CLASSROOM_URL);
  assert.equal(resolveStudentPackageAddress(parseStudentPackageAddress([])), PUBLIC_CLASSROOM_URL);
});

test('unsupported public package addresses are rejected rather than weakening native TLS trust', () => {
  for (const value of [
    '', 'http://class.empfreeimpro.xyz/', 'https://class.empfreeimpro.xyz',
    'https://CLASS.EMPFREEIMPRO.XYZ/', 'https://class.empfreeimpro.xyz:443/',
    'https://class.empfreeimpro.xyz:8443/', 'https://sub.class.empfreeimpro.xyz/',
    'https://class.empfreeimpro.xyz.evil.example/', 'https://example.com/',
    'https://user:password@class.empfreeimpro.xyz/', 'https://class.empfreeimpro.xyz/teacher.html',
    'https://class.empfreeimpro.xyz/?class=123456', 'https://class.empfreeimpro.xyz/#',
    ' https://class.empfreeimpro.xyz/', 'https://127.0.0.1/'
  ]) assert.throws(() => validatePublicPackageAddress(value), /公开课堂打包地址仅支持/);
});

test('missing, duplicate and unknown iOS package options fail explicitly', () => {
  for (const args of [
    ['--classroom-url'], ['--classroom-url='], ['--other-option'],
    ['--classroom-url', PUBLIC_CLASSROOM_URL, '--classroom-url', PUBLIC_CLASSROOM_URL],
    ['--classroom-url', PUBLIC_CLASSROOM_URL, 'extra']
  ]) assert.throws(() => parseStudentPackageAddress(args));
});

test('the real iOS preparation entry rejects unsupported addresses before writing assets', t => {
  const directory = mkdtempSync(join(tmpdir(), 'student-package-address-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const script = fileURLToPath(new URL('../scripts/prepare-ios.js', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--classroom-url', 'http://class.empfreeimpro.xyz/'], { cwd: directory, encoding: 'utf8', timeout: 30000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /公开课堂打包地址仅支持/);
  assert.equal(existsSync(join(directory, 'ios')), false);
});
