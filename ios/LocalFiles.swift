import Foundation

final class LocalFiles {
    private struct Pending { let url: URL; let destination: URL; var size: Int }
    private var pending: [String: Pending] = [:]
    private let root: URL
    init() throws {
        root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("LocalExports", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        var directory = root, values = URLResourceValues(); values.isExcludedFromBackup = true; try directory.setResourceValues(values)
    }
    func begin(name: String, mime: String) throws -> String {
        guard pending.count < 3, name.count <= 160, !name.contains("/"), !name.contains("\\"),
              (name.lowercased().hasSuffix(".json") && mime == "application/json") || (name.lowercased().hasSuffix(".wav") && mime == "audio/wav") else { throw failure("文件类型无效。") }
        let id = UUID().uuidString, path = root.appendingPathComponent(id + ".partial")
        try Data().write(to: path, options: .atomic)
        pending[id] = Pending(url: path, destination: root.appendingPathComponent(id + "_" + name), size: 0)
        return id
    }
    func append(id: String, encoded: String) throws -> Bool {
        guard var item = pending[id], encoded.count <= 65536, let data = Data(base64Encoded: encoded), item.size + data.count <= 250 * 1024 * 1024 else { cancel(id); throw failure("文件超过大小限制。") }
        do {
            let handle = try FileHandle(forWritingTo: item.url); defer { try? handle.close() }
            try handle.seekToEnd(); try handle.write(contentsOf: data); item.size += data.count; pending[id] = item; return true
        } catch { cancel(id); throw error }
    }
    func finish(_ id: String) throws -> Bool {
        guard let item = pending[id] else { return false }
        do { try FileManager.default.moveItem(at: item.url, to: item.destination); pending[id] = nil; return true }
        catch { cancel(id); throw error }
    }
    func cancel(_ id: String) { if let item = pending.removeValue(forKey: id) { try? FileManager.default.removeItem(at: item.url) } }
    func cancelAll() { for id in Array(pending.keys) { cancel(id) } }
    func list(backup: Bool) throws -> [String] {
        try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).filter { $0.pathExtension == (backup ? "json" : "wav") }.map(\.lastPathComponent).sorted().reversed()
    }
    func read(name: String, offset: Int) throws -> String {
        guard !name.contains("/"), !name.contains("\\"), ["json", "wav"].contains((name as NSString).pathExtension), offset >= 0, offset <= 250 * 1024 * 1024 else { throw failure("文件路径无效。") }
        let file = root.appendingPathComponent(name), handle = try FileHandle(forReadingFrom: file); defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(offset)); return (try handle.read(upToCount: 48 * 1024) ?? Data()).base64EncodedString()
    }
    private func failure(_ text: String) -> NSError { NSError(domain: "FreeImpro", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
}
