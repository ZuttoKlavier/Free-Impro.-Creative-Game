import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync, chmodSync, symlinkSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough, Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { configureImageRuntimeKey, saveImageRuntimeKey } from '../scripts/image-mcp.js';

const valid = 'sk-proj-' + 'A'.repeat(64);

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'empvc-runtime-key-'));
  const directory = join(root, 'data/image-mcp');
  const file = join(directory, 'runtime-key');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, directory, file };
}

function seed(f, text = 'existing-runtime-key') {
  mkdirSync(f.directory, { recursive: true, mode: 0o700 });
  writeFileSync(f.file, text, { mode: 0o600 });
}

function promptStreams() {
  const input = new PassThrough(); input.isTTY = true;
  let text = '';
  const output = new Writable({ write(chunk, _encoding, done) { text += chunk.toString(); done(); } });
  return { input, output, text: () => text };
}

test('runtime key saves atomically with a private parent directory and file', t => {
  const f = fixture(t); seed(f); chmodSync(f.directory, 0o755); chmodSync(f.file, 0o644);
  assert.equal(saveImageRuntimeKey(valid, f.root), f.file);
  assert.equal(readFileSync(f.file, 'utf8'), valid);
  if (process.platform !== 'win32') {
    assert.equal(statSync(f.directory).mode & 0o777, 0o700);
    assert.equal(statSync(f.file).mode & 0o777, 0o600);
  }
  assert.deepEqual(readdirSync(f.directory), ['runtime-key']);
});

test('invalid runtime key input retains the original file without creating temporary files', t => {
  const f = fixture(t); seed(f);
  for (const input of ['', 'sk-short', 'not-a-key-' + 'A'.repeat(40), 'sk-' + 'A'.repeat(510), valid + '\n', valid + 'é', valid + ' ', valid + '\u0000', null]) {
    assert.throws(() => saveImageRuntimeKey(input, f.root), /格式无效/);
    assert.equal(readFileSync(f.file, 'utf8'), 'existing-runtime-key');
    assert.deepEqual(readdirSync(f.directory), ['runtime-key']);
  }
});

test('runtime key destination symlinks are rejected and their targets retained', t => {
  const f = fixture(t);
  mkdirSync(f.directory, { recursive: true });
  const target = join(f.root, 'original'); writeFileSync(target, 'do-not-change');
  symlinkSync(target, f.file);
  assert.throws(() => saveImageRuntimeKey(valid, f.root), /符号链接/);
  assert.equal(readFileSync(target, 'utf8'), 'do-not-change');
  assert.deepEqual(readdirSync(f.directory), ['runtime-key']);
});

test('runtime key rejects symlink directories and broken destination symlinks', t => {
  for (const linked of ['data', 'image-mcp', 'runtime-key']) {
    const f = fixture(t);
    const target = join(f.root, 'target'); mkdirSync(target);
    if (linked === 'data') symlinkSync(target, join(f.root, 'data'));
    else if (linked === 'image-mcp') { mkdirSync(join(f.root, 'data')); symlinkSync(target, f.directory); }
    else { mkdirSync(f.directory, { recursive: true }); symlinkSync(join(target, 'missing'), f.file); }
    assert.throws(() => saveImageRuntimeKey(valid, f.root), /符号链接/);
    assert.deepEqual(readdirSync(target), []);
  }
});

test('runtime key configuration requires an interactive terminal', async t => {
  const f = fixture(t); seed(f);
  const input = new PassThrough(); input.isTTY = false;
  const { output, text } = promptStreams();
  await assert.rejects(configureImageRuntimeKey({ input, output, projectRoot: f.root }), /交互终端/);
  assert.equal(text(), '');
  assert.equal(readFileSync(f.file, 'utf8'), 'existing-runtime-key');
});

test('interactive runtime key entry never echoes the key and states format-only validation', async t => {
  const f = fixture(t); const s = promptStreams();
  const configured = configureImageRuntimeKey({ ...s, projectRoot: f.root });
  s.input.write(valid + '\n'); await configured;
  assert.equal(readFileSync(f.file, 'utf8'), valid);
  assert.equal(s.text().includes(valid), false);
  assert.match(s.text(), /仅通过格式校验；尚未验证网络授权/);
});

test('cancelled or closed interactive runtime key input retains the original file', async t => {
  for (const ending of ['interrupt', 'end']) {
    const f = fixture(t); seed(f); const s = promptStreams();
    const configured = configureImageRuntimeKey({ ...s, projectRoot: f.root });
    s.input.write(valid);
    if (ending === 'interrupt') s.input.write('\u0003'); else s.input.end();
    await assert.rejects(configured, /已取消/);
    assert.equal(readFileSync(f.file, 'utf8'), 'existing-runtime-key');
    assert.equal(s.text().includes(valid), false);
    assert.deepEqual(readdirSync(f.directory), ['runtime-key']);
  }
});

test('runtime key CLI rejects redirected input and command-line values without disclosing them', t => {
  const script = new URL('../scripts/image-mcp.js', import.meta.url).pathname;
  for (const args of [['--configure-runtime-key'], ['--configure-runtime-key', valid]]) {
    const result = spawnSync(process.execPath, [script, ...args], { input: valid + '\n', encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal((result.stdout + result.stderr).includes(valid), false);
    assert.match(result.stderr, /交互终端|不接受命令行/);
  }
});
