import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('native student cookie lookup, migration and logout retain exact identity and teacher isolation', { skip: process.platform !== 'darwin' }, t => {
  const directory = mkdtempSync(join(tmpdir(), 'empvc-student-cookies-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'main.swift'), `import Foundation
let origin = URL(string: "https://class.empfreeimpro.xyz/")!
let storage = URLSessionConfiguration.ephemeral.httpCookieStorage!
func cookie(_ name: String, _ path: String = "/api/student", _ domain: String = "class.empfreeimpro.xyz") -> HTTPCookie {
    HTTPCookie(properties: [.name: name, .value: "fixture", .domain: domain, .path: path, .secure: "TRUE"])!
}
let legacy = cookie("fi_session_student")
let auth = cookie("fi_student_auth.session_token")
let secureAuth = cookie("__Secure-fi_student_auth.session_token")
let authCache = cookie("__Secure-fi_student_auth.session_data")
let teacher = cookie("fi_session_teacher", "/api/teacher")
let otherOrigin = cookie("fi_student_auth.session_token", "/api/student", "other.example")
let unrelated = cookie("unrelated", "/")
let spoofed = cookie("fi_student_auth_evil.session_token")
for entry in [legacy, auth, secureAuth, authCache, teacher, otherOrigin, unrelated, spoofed] { storage.setCookie(entry) }
assert(storage.cookies(for: origin)?.contains(where: { $0.name == legacy.name }) != true)
let expected: Set<String> = [legacy.name, auth.name, secureAuth.name, authCache.name]
let found = ClassroomConnection.studentCookies(in: storage, for: origin)
assert(Set(found.map(\\.name)) == expected)
assert(ClassroomConnection.studentCookies(in: nil, for: origin).isEmpty)
let migrated = ClassroomConnection.transferableStudentCookies([legacy, auth, secureAuth, authCache, teacher, otherOrigin, unrelated, spoofed], for: origin)
assert(Set(migrated.map(\\.name)) == expected)
let removed = ClassroomConnection.removeStudentCookies(in: storage, for: origin)
assert(Set(removed.map(\\.name)) == expected)
assert(ClassroomConnection.studentCookies(in: storage, for: origin).isEmpty)
assert(storage.cookies?.contains(where: { $0.name == teacher.name }) == true)
assert(storage.cookies?.contains(where: { $0.domain == "other.example" }) == true)
assert(storage.cookies?.contains(where: { $0.name == unrelated.name }) == true)
assert(storage.cookies?.contains(where: { $0.name == spoofed.name }) == true)
print("Native student cookie isolation passed")
`);
  const binary = join(directory, 'cookies');
  const compiled = spawnSync('xcrun', ['swiftc', '-module-cache-path', join(directory, 'cache'), resolve('ios/StudentPolicy.swift'), resolve('ios/ClassroomConnection.swift'), join(directory, 'main.swift'), '-o', binary], { encoding: 'utf8', timeout: 60000 });
  assert.equal(compiled.status, 0, compiled.stderr);
  const checked = spawnSync(binary, [], { encoding: 'utf8', timeout: 5000 });
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /Native student cookie isolation passed/);
});
