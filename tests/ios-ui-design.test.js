import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('compiled iOS fetches published appearance only after explicit entry and rejects write/admin routes', { skip: process.platform !== 'darwin' }, t => {
  const directory = mkdtempSync(join(tmpdir(), 'empvc-ios-ui-design-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'main.swift'), String.raw`import Foundation
import WebKit

final class FixtureProtocol: URLProtocol {
    static var requests: [URLRequest] = []
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.requests.append(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{\"design\":{\"revision\":0}}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
let configuration = URLSessionConfiguration.ephemeral
configuration.protocolClasses = [FixtureProtocol.self]
let connection = ClassroomConnection(configuration: configuration)
connection.configure()
let cookies = WKWebsiteDataStore.nonPersistent().httpCookieStore

func request(_ path: String, _ method: String = "GET", body: String? = nil) -> (Any?, String?) {
    var input: [String: Any] = ["id": UUID().uuidString, "path": path, "method": method]
    if let body { input["body"] = body }
    var finished = false
    var result: (Any?, String?) = (nil, nil)
    connection.request(input, cookieStore: cookies) { value, failure in result = (value, failure); finished = true }
    let deadline = Date().addingTimeInterval(5)
    while !finished && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.01)) }
    assert(finished)
    return result
}

assert(FixtureProtocol.requests.isEmpty)
assert(request("/api/student/ui-design").1 != nil)
assert(FixtureProtocol.requests.isEmpty)
assert(request("/api/student/enter-classroom", "POST", body: "{\"name\":\"Synthetic student\",\"code\":\"123456\"}").1 == nil)
let appearance = request("/api/student/ui-design")
assert(appearance.1 == nil)
let reply = appearance.0 as! [String: Any]
assert(reply["status"] as? Int == 200)
assert(String(data: Data(base64Encoded: reply["encoded"] as! String)!, encoding: .utf8) == "{\"design\":{\"revision\":0}}")
assert(FixtureProtocol.requests.count == 2)
let sent = FixtureProtocol.requests.last!
assert(sent.url?.absoluteString == "https://class.empfreeimpro.xyz/api/student/ui-design")
assert(sent.httpMethod == "GET")
assert(sent.value(forHTTPHeaderField: "Origin") == "https://class.empfreeimpro.xyz")

for (path, method) in [
    ("/api/student/ui-design", "POST"),
    ("/api/student/ui-design?preview=1", "GET"),
    ("/api/ui-design", "GET"),
    ("/api/admin/ui-design", "GET"),
    ("/api/teacher/ui-design", "GET"),
    ("https://example.com/api/student/ui-design", "GET")
] { assert(request(path, method).1 != nil) }
assert(FixtureProtocol.requests.count == 2)
connection.disconnect()
assert(request("/api/student/ui-design").1 != nil)
assert(FixtureProtocol.requests.count == 2)
print("Published appearance native boundary passed")
`);
  const binary = join(directory, 'ui-design');
  const compiled = spawnSync('xcrun', ['swiftc', '-module-cache-path', join(directory, 'cache'), resolve('ios/StudentPolicy.swift'), resolve('ios/ClassroomConnection.swift'), join(directory, 'main.swift'), '-o', binary], { encoding: 'utf8', timeout: 60000 });
  assert.equal(compiled.status, 0, compiled.stderr);
  const checked = spawnSync(binary, [], { encoding: 'utf8', timeout: 30000 });
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /Published appearance native boundary passed/);
});
