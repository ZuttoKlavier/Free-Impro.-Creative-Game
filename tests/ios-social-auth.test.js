import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('compiled native OAuth validates proof, origin, callbacks, cookies and cancelled exchanges', { skip: process.platform !== 'darwin' }, t => {
  const directory = mkdtempSync(join(tmpdir(), 'empvc-ios-social-auth-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'main.swift'), String.raw`import Foundation

let policy = StudentPolicy("https://class.empfreeimpro.xyz/")!
let handoffId = String(repeating: "a", count: 64)
let ticket = String(repeating: "b", count: 64)
let browserURL = "https://class.empfreeimpro.xyz/api/student/account/native/open?handoffId=" + handoffId
let callbackURL = "freeimprostudent://auth/callback?ticket=" + ticket
let valid = ["handoffId": handoffId, "browserURL": browserURL]
assert(ClassroomConnection.nativeHandoff(valid, for: policy)?.id == handoffId)
assert(ClassroomConnection.nativeHandoff(valid, for: StudentPolicy("https://localhost:8443/")!) == nil)
for url in [browserURL + "&evil=1", browserURL + "#fragment", browserURL + "&handoffId=" + handoffId,
            browserURL.replacingOccurrences(of: "/native/open", with: "/native/consume"),
            browserURL.replacingOccurrences(of: "class.empfreeimpro.xyz", with: "class.empfreeimpro.xyz.evil.example"),
            browserURL.replacingOccurrences(of: "https://", with: "https://user@"),
            browserURL.replacingOccurrences(of: "https://", with: "http://")] {
    assert(ClassroomConnection.nativeHandoff(["handoffId": handoffId, "browserURL": url], for: policy) == nil)
}
assert(ClassroomConnection.nativeCallbackTicket(URL(string: callbackURL)!) == ticket)
for url in [callbackURL + "&code=private", callbackURL + "#fragment", callbackURL + "&ticket=" + ticket,
            callbackURL.replacingOccurrences(of: "//auth/", with: "//evil/"),
            callbackURL.replacingOccurrences(of: "//auth/", with: "//user@auth/"),
            callbackURL.replacingOccurrences(of: "//auth/", with: "//auth:443/"),
            callbackURL.replacingOccurrences(of: "/callback?", with: "/callback/?"),
            callbackURL.replacingOccurrences(of: "ticket=", with: "ticket=%62"),
            callbackURL.replacingOccurrences(of: "freeimprostudent:", with: "https:"),
            "freeimprostudent://auth/callback?ticket=" + String(repeating: "B", count: 64)] {
    assert(ClassroomConnection.nativeCallbackTicket(URL(string: url)!) == nil)
}
// RFC 7636 Appendix B: native PKCE must implement S256, not plain proof.
assert(StudentSocialAuthProof.challenge(for: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
var proofs: Set<String> = []
for _ in 0..<100 {
    let proof = StudentSocialAuthProof()!
    assert(proof.verifier.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil)
    assert(proof.challenge.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil)
    assert(proof.verifier != proof.challenge)
    proofs.insert(proof.verifier)
}
assert(proofs.count == 100)

final class FixtureProtocol: URLProtocol {
    static var handle: ((URLRequest, FixtureProtocol) -> Void)!
    private(set) var stopped = false
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "class.empfreeimpro.xyz" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { Self.handle(request, self) }
    override func stopLoading() { stopped = true }
    func respond(_ fields: [String: Any], status: Int = 200, cookie: String? = nil) {
        guard !stopped else { return }
        var headers = ["Content-Type": "application/json"]
        if let cookie { headers["Set-Cookie"] = cookie }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: fields))
        client?.urlProtocolDidFinishLoading(self)
    }
}
func wait(_ predicate: () -> Bool) {
    let until = Date().addingTimeInterval(5)
    while !predicate() && Date() < until { RunLoop.main.run(until: Date().addingTimeInterval(0.01)) }
    assert(predicate(), "Native completion timed out")
}
func result<T>(_ start: (@escaping (Result<T, Error>) -> Void) -> Void) -> Result<T, Error> {
    var result: Result<T, Error>?
    start { result = $0 }
    wait { result != nil }
    return result!
}
func success<T>(_ result: Result<T, Error>) -> T {
    switch result { case .success(let value): return value; case .failure(let error): fatalError(error.localizedDescription) }
}
func fails<T>(_ result: Result<T, Error>) -> Bool { if case .failure = result { return true }; return false }
func captured(_ input: URLRequest) -> URLRequest {
    var request = input
    if request.httpBody == nil, let stream = request.httpBodyStream {
        stream.open(); defer { stream.close() }
        var data = Data(), buffer = [UInt8](repeating: 0, count: 1024)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }; data.append(contentsOf: buffer.prefix(count))
        }
        request.httpBody = data
    }
    return request
}
let configuration = URLSessionConfiguration.ephemeral
configuration.protocolClasses = [FixtureProtocol.self]
let storage = configuration.httpCookieStorage!
let connection = ClassroomConnection(configuration: configuration)
connection.configure()
let proof = StudentSocialAuthProof()!
var seen: [URLRequest] = []
FixtureProtocol.handle = { request, fixture in
    seen.append(captured(request))
    fixture.respond(valid)
}
assert(fails(result { connection.startSocial(provider: "apple", mode: "link", challenge: proof.challenge, completion: $0) }))
assert(fails(result { connection.startSocial(provider: "github", mode: "login", challenge: proof.challenge, completion: $0) }))
assert(seen.isEmpty)
let started = success(result { connection.startSocial(provider: "wechat", mode: "login", challenge: proof.challenge, completion: $0) })
assert(started.browserURL.absoluteString == browserURL)
let sent = (try! JSONSerialization.jsonObject(with: seen[0].httpBody!)) as! [String: String]
assert(sent == ["provider": "wechat", "mode": "login", "codeChallenge": proof.challenge])
assert(seen[0].url?.path == "/api/student/account/native/start")
assert(seen[0].value(forHTTPHeaderField: "Origin") == "https://class.empfreeimpro.xyz")
assert(!seen[0].httpShouldHandleCookies)
assert(ClassroomConnection.studentCookies(in: storage, for: policy.origin).isEmpty)

let sessionCookies = "__Secure-fi_student_auth.session_token=library_fixture; Path=/api/student; HttpOnly; Secure, fi_session_student=classroom_fixture; Path=/api/student; HttpOnly; Secure"
FixtureProtocol.handle = { request, fixture in
    seen.append(captured(request))
    fixture.respond(["user": ["id": "student_fixture", "role": "student", "name": "测试学生"]], cookie: sessionCookies)
}
let loggedIn = success(result { connection.consumeSocial(ticket: ticket, verifier: proof.verifier, completion: $0) })
assert(Set(loggedIn.keys) == ["user"])
assert((loggedIn["user"] as? [String: String])?["id"] == "student_fixture")
let cookies = ClassroomConnection.studentCookies(in: storage, for: policy.origin)
assert(Set(cookies.map(\.name)) == ["__Secure-fi_student_auth.session_token", "fi_session_student"])
let consume = (try! JSONSerialization.jsonObject(with: seen.last!.httpBody!)) as! [String: String]
assert(consume == ["ticket": ticket, "codeVerifier": proof.verifier])
FixtureProtocol.handle = { request, fixture in
    seen.append(captured(request))
    fixture.respond(valid)
}
_ = success(result { connection.startSocial(provider: "apple", mode: "link", challenge: proof.challenge, completion: $0) })
assert(seen.last!.value(forHTTPHeaderField: "Cookie")?.contains("library_fixture") == true)

connection.disconnect()
_ = ClassroomConnection.removeStudentCookies(in: storage, for: policy.origin)
FixtureProtocol.handle = { _, fixture in fixture.respond(["user": ["id": "teacher_fixture", "role": "teacher"]], cookie: sessionCookies) }
assert(fails(result { connection.consumeSocial(ticket: ticket, verifier: proof.verifier, completion: $0) }))
assert(ClassroomConnection.studentCookies(in: storage, for: policy.origin).isEmpty)
assert(fails(result { connection.startSocial(provider: "apple", mode: "link", challenge: proof.challenge, completion: $0) }))
FixtureProtocol.handle = { _, fixture in fixture.respond(["user": ["id": "student_fixture", "role": "student"]], cookie: "fi_session_student=partial; Path=/api/student; Secure") }
assert(fails(result { connection.consumeSocial(ticket: ticket, verifier: proof.verifier, completion: $0) }))
assert(ClassroomConnection.studentCookies(in: storage, for: policy.origin).isEmpty)
assert(fails(result { connection.startSocial(provider: "apple", mode: "link", challenge: proof.challenge, completion: $0) }))
FixtureProtocol.handle = { _, fixture in fixture.respond(["error": "登录平台尚未配置。"], status: 503, cookie: sessionCookies) }
assert(fails(result { connection.consumeSocial(ticket: ticket, verifier: proof.verifier, completion: $0) }))
assert(ClassroomConnection.studentCookies(in: storage, for: policy.origin).isEmpty)

// A cancelled consume cannot reopen the account or install response cookies.
var pending: FixtureProtocol?
var stale: Result<[String: Any], Error>?
FixtureProtocol.handle = { _, fixture in pending = fixture }
connection.consumeSocial(ticket: ticket, verifier: proof.verifier) { stale = $0 }
wait { pending != nil }
connection.invalidateSocial()
wait { stale != nil }
assert(fails(stale!))
pending?.respond(["user": ["id": "stale_student", "role": "student"]], cookie: sessionCookies)
assert(ClassroomConnection.studentCookies(in: storage, for: policy.origin).isEmpty)

var cancelled = false
FixtureProtocol.handle = { request, fixture in
    let fields = (try! JSONSerialization.jsonObject(with: captured(request).httpBody!)) as! [String: String]
    assert(request.url?.path == "/api/student/account/native/cancel")
    assert(fields == ["handoffId": handoffId, "codeVerifier": proof.verifier])
    fixture.respond(["cancelled": true]); cancelled = true
}
connection.cancelSocial(handoff: started, verifier: proof.verifier)
wait { cancelled }
connection.configure()
assert(connection.policy?.origin.absoluteString == StudentPolicy.publicClassroomURL)
assert(fails(result { connection.startSocial(provider: "apple", mode: "link", challenge: proof.challenge, completion: $0) }))
print("Native OAuth security and transport checks passed")
`);
  const binary = join(directory, 'social-auth');
  const compiled = spawnSync('xcrun', ['swiftc', '-module-cache-path', join(directory, 'cache'), resolve('ios/StudentPolicy.swift'), resolve('ios/ClassroomConnection.swift'), resolve('ios/StudentSocialAuth.swift'), join(directory, 'main.swift'), '-o', binary], { encoding: 'utf8', timeout: 60000 });
  assert.equal(compiled.status, 0, compiled.stderr);
  const checked = spawnSync(binary, [], { encoding: 'utf8', timeout: 15000 });
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /Native OAuth security and transport checks passed/);
});
