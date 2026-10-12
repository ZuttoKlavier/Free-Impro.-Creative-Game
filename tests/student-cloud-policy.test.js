import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('compiled iOS policy separates the exact public TLS endpoint from LAN and similar domains', { skip: process.platform !== 'darwin' }, t => {
  const root = mkdtempSync(join(tmpdir(), 'student-cloud-policy-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'main.swift'), `import Foundation
let cases: [(String, Bool)] = [
 ("https://class.empfreeimpro.xyz/", true),
 ("https://class.empfreeimpro.xyz:443/", true),
 ("https://class.empfreeimpro.xyz:8443/", false),
 ("https://sub.class.empfreeimpro.xyz/", false),
 ("https://class.empfreeimpro.xyz.evil.example/", false),
 ("https://empfreeimpro.xyz/", false),
 ("https://localhost:8443/", false),
 ("https://192.168.31.217:8443/", false)
]
for (url, expected) in cases { guard let policy = StudentPolicy(url), policy.usesSystemTrust == expected else { fatalError("Trust boundary failed") } }
assert(StudentPolicy("http://class.empfreeimpro.xyz/") == nil)
assert(StudentPolicy("https://user:pass@class.empfreeimpro.xyz/") == nil)
assert(StudentPolicy("https://class.empfreeimpro.xyz/teacher.html") == nil)
let policy = StudentPolicy("https://class.empfreeimpro.xyz/")!
assert(!policy.sameOrigin(URL(string: "https://class.empfreeimpro.xyz:8443/")!))
assert(!policy.sameOrigin(URL(string: "https://sub.class.empfreeimpro.xyz/")!))
print("Policy passed")
`);
  const binary = join(root, 'policy');
  const compiled = spawnSync('xcrun', ['swiftc', '-module-cache-path', join(root, 'cache'), resolve('ios/StudentPolicy.swift'), join(root, 'main.swift'), '-o', binary], { encoding: 'utf8', timeout: 60000 });
  assert.equal(compiled.status, 0, compiled.stderr);
  const checked = spawnSync(binary, [], { encoding: 'utf8', timeout: 5000 });
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /Policy passed/);
});
