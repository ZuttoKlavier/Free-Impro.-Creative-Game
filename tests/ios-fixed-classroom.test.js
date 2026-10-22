import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('compiled iOS keeps legacy offline storage while classroom requests use only the fixed public origin', { skip: process.platform !== 'darwin' }, t => {
  const directory = mkdtempSync(join(tmpdir(), 'empvc-ios-fixed-classroom-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'main.swift'), String.raw`import Foundation
import WebKit

let suite = "empvc.fixed-classroom.fixture." + UUID().uuidString
let defaults = UserDefaults(suiteName: suite)!
defer { defaults.removePersistentDomain(forName: suite) }
let oldClassroom = "https://192.168.1.20:8443/"
let libraryOrigin = "https://10.0.0.8:9443/"
defaults.set(oldClassroom, forKey: "classroom")
defaults.set(libraryOrigin, forKey: "localOrigin")
defaults.set("offline-library-fixture", forKey: "libraryMarker")
let before = defaults.persistentDomain(forName: suite)!
let existing = StudentPolicy.preservedLocalOrigin(in: defaults, legacyAddress: oldClassroom)
assert(existing?.origin.absoluteString == libraryOrigin)
assert(NSDictionary(dictionary: defaults.persistentDomain(forName: suite)!).isEqual(to: before))

// An older installation without localOrigin keeps its original library origin.
defaults.removeObject(forKey: "localOrigin")
let migrated = StudentPolicy.preservedLocalOrigin(in: defaults, legacyAddress: defaults.string(forKey: "classroom"))
assert(migrated?.origin.absoluteString == oldClassroom)
assert(defaults.string(forKey: "localOrigin") == oldClassroom)
assert(defaults.string(forKey: "classroom") == oldClassroom)
assert(defaults.string(forKey: "libraryMarker") == "offline-library-fixture")

// Never replace an existing storage source, even if it needs separate repair.
defaults.set("invalid-storage-origin", forKey: "localOrigin")
assert(StudentPolicy.preservedLocalOrigin(in: defaults, legacyAddress: StudentPolicy.publicClassroomURL) == nil)
assert(defaults.string(forKey: "localOrigin") == "invalid-storage-origin")
defaults.removeObject(forKey: "localOrigin")
assert(StudentPolicy.preservedLocalOrigin(in: defaults, legacyAddress: nil)?.origin.absoluteString == StudentPolicy.publicClassroomURL)

final class FixtureProtocol: URLProtocol {
    static var requests: [URLRequest] = []
    static var failureCode = NSURLErrorCannotConnectToHost
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.requests.append(request)
        client?.urlProtocol(self, didFailWithError: NSError(domain: NSURLErrorDomain, code: Self.failureCode))
    }
    override func stopLoading() {}
}
let configuration = URLSessionConfiguration.ephemeral
configuration.protocolClasses = [FixtureProtocol.self]
let connection = ClassroomConnection(configuration: configuration)
connection.configure()
assert(connection.policy?.origin.absoluteString == StudentPolicy.publicClassroomURL)
assert(connection.policy?.usesSystemTrust == true)
defaults.set("https://another-old-classroom.invalid:9443/", forKey: "classroom")
connection.configure()
assert(connection.policy?.origin.absoluteString == StudentPolicy.publicClassroomURL)

let store = WKWebsiteDataStore.nonPersistent().httpCookieStore
for code in [NSURLErrorCannotConnectToHost, NSURLErrorTimedOut, NSURLErrorNotConnectedToInternet, NSURLErrorServerCertificateUntrusted] {
    FixtureProtocol.failureCode = code
    var finished = false
    var hint: String?
    connection.request(["id": UUID().uuidString, "path": "/api/student/account/options", "method": "GET"], cookieStore: store) { _, error in
        hint = error; finished = true
    }
    let deadline = Date().addingTimeInterval(5)
    while !finished && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.01)) }
    assert(finished && hint != nil)
    assert(!hint!.contains("同一 Wi-Fi"))
    assert(!hint!.contains("连接设置"))
    assert(hint!.contains(code == NSURLErrorServerCertificateUntrusted ? "安全连接" : "检查网络"))
}
assert(FixtureProtocol.requests.count == 4)
for request in FixtureProtocol.requests {
    assert(request.url?.absoluteString == "https://class.empfreeimpro.xyz/api/student/account/options")
    assert(request.value(forHTTPHeaderField: "Origin") == "https://class.empfreeimpro.xyz")
    assert(request.httpMethod == "GET")
}
print("Fixed public classroom and legacy storage checks passed")
`);
  const binary = join(directory, 'fixed-classroom');
  const compiled = spawnSync('xcrun', ['swiftc', '-module-cache-path', join(directory, 'cache'), resolve('ios/StudentPolicy.swift'), resolve('ios/ClassroomConnection.swift'), join(directory, 'main.swift'), '-o', binary], { encoding: 'utf8', timeout: 60000 });
  assert.equal(compiled.status, 0, compiled.stderr);
  const checked = spawnSync(binary, [], { encoding: 'utf8', timeout: 30000 });
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /Fixed public classroom and legacy storage checks passed/);
});
