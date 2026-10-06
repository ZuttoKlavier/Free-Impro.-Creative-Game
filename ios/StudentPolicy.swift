import Foundation

struct StudentPolicy {
    let origin: URL
    init?(_ text: String) {
        guard var parts = URLComponents(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
              parts.scheme == "https", let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil,
              ["", "/"].contains(parts.path), (parts.port ?? 443) > 0, (parts.port ?? 443) <= 65535 else { return nil }
        parts.path = "/"
        guard let url = parts.url else { return nil }; origin = url
    }
    func sameOrigin(_ url: URL) -> Bool {
        url.scheme == "https" && url.host == origin.host && (url.port ?? 443) == (origin.port ?? 443) && url.user == nil && url.password == nil
    }
    func navigation(_ url: URL) -> Bool {
        guard sameOrigin(url), ["/", "/index.html"].contains(url.path), let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        let query = parts.queryItems ?? []
        return query.isEmpty || (query.count == 1 && query[0].name == "class" && (query[0].value?.range(of: "^[0-9]{6}$", options: .regularExpression) != nil))
    }
    var contentRules: String {
        // WebKit content blockers do not accept ICU's escaped '/' syntax.
        let prefix = NSRegularExpression.escapedPattern(for: origin.absoluteString).replacingOccurrences(of: "\\/", with: "/")
        var rules: [[String: Any]] = [
            ["trigger": ["url-filter": "^https?://"], "action": ["type": "block"]]
        ]
        // Content blocker expressions support a restricted regex grammar, without alternation.
        for path in ["", "index\\.html", "assets/[^?]*", "api/student/[^?]*", "student-sw\\.js", "icon\\.svg", "manifest\\.webmanifest"] {
            rules.append(["trigger": ["url-filter": "^" + prefix + path + "([?#].*)?$"], "action": ["type": "ignore-previous-rules"]])
        }
        return String(data: try! JSONSerialization.data(withJSONObject: rules), encoding: .utf8)!
    }
}
