import Foundation
import ImageIO

enum LocalImportKind: String {
    case backup, audio, photo
    var limit: Int { self == .backup ? 250 * 1024 * 1024 : self == .audio ? 25 * 1024 * 1024 : 10 * 1024 * 1024 }
    func mime(extension ext: String) -> String? {
        let types: [String: String]
        switch self {
        case .backup: types = ["json": "application/json"]
        case .audio: types = ["wav": "audio/wav", "mp3": "audio/mpeg", "m4a": "audio/mp4", "aac": "audio/aac", "aif": "audio/aiff", "aiff": "audio/aiff", "flac": "audio/flac", "ogg": "audio/ogg"]
        case .photo: types = ["jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"]
        }
        return types[ext.lowercased()]
    }
}

final class LocalFiles {
    private struct Pending { let url: URL; let destination: URL; var size: Int }
    private let queue = DispatchQueue(label: "org.freeimpro.student.local-files", qos: .userInitiated, autoreleaseFrequency: .workItem)
    private let queueKey = DispatchSpecificKey<Bool>()
    private var pending: [String: Pending] = [:]
    private var imports: [String: URL] = [:]
    private var exportStages: Set<URL> = []
    private let root: URL
    private var importRoot: URL { root.appendingPathComponent("Imports", isDirectory: true) }
    init(root selectedRoot: URL? = nil) throws {
        root = selectedRoot ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("LocalExports", isDirectory: true)
        queue.setSpecific(key: queueKey, value: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        var directory = root, values = URLResourceValues(); values.isExcludedFromBackup = true; try directory.setResourceValues(values)
        try? FileManager.default.removeItem(at: importRoot)
        try FileManager.default.createDirectory(at: importRoot, withIntermediateDirectories: true)
    }
    // Every dictionary and file operation shares this queue. UI callers use perform;
    // synchronous callers are also serialized without deadlocking nested operations.
    func perform<T>(_ operation: @escaping (LocalFiles) throws -> T, completion: @escaping (Result<T, Error>) -> Void) {
        queue.async { [self] in
            let result = Result { try operation(self) }
            DispatchQueue.main.async { completion(result) }
        }
    }
    func schedule(_ operation: @escaping (LocalFiles) -> Void) { queue.async { [self] in operation(self) } }
    private func serialized<T>(_ operation: () throws -> T) rethrows -> T {
        if DispatchQueue.getSpecific(key: queueKey) == true { return try operation() }
        return try queue.sync(execute: operation)
    }
    func begin(name: String, mime: String) throws -> String { try serialized { try beginOnQueue(name: name, mime: mime) } }
    func append(id: String, encoded: String) throws -> Bool { try serialized { try appendOnQueue(id: id, encoded: encoded) } }
    func finish(_ id: String) throws -> URL { try serialized { try finishOnQueue(id) } }
    func cancel(_ id: String) { serialized { cancelOnQueue(id) } }
    func cancelAll() { serialized { for id in Array(pending.keys) { cancelOnQueue(id) } } }
    func list(backup: Bool) throws -> [String] { try serialized { try listOnQueue(backup: backup) } }
    func importFile(_ source: URL, kind: LocalImportKind) throws -> [String: Any] { try serialized { try importFileOnQueue(source, kind: kind) } }
    func importLocal(name: String, kind: LocalImportKind) throws -> [String: Any] { try serialized { try importLocalOnQueue(name: name, kind: kind) } }
    func readImport(id: String, offset: Int) throws -> String { try serialized { try readImportOnQueue(id: id, offset: offset) } }
    func releaseImport(_ id: String) { serialized { releaseImportOnQueue(id) } }
    func releaseAllImports() { serialized { for id in Array(imports.keys) { releaseImportOnQueue(id) } } }
    func prepareExport(_ saved: URL) throws -> URL {
        try serialized {
            guard saved.deletingLastPathComponent().standardizedFileURL.path == root.standardizedFileURL.path, ["json", "wav"].contains(saved.pathExtension.lowercased()) else { throw failure("文件保存请求已失效。") }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("FreeImproExport-" + UUID().uuidString, isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let file = directory.appendingPathComponent(String(saved.lastPathComponent.dropFirst(37)))
                try FileManager.default.copyItem(at: saved, to: file); exportStages.insert(file); return file
            } catch { try? FileManager.default.removeItem(at: directory); throw error }
        }
    }
    func releaseExport(_ file: URL) {
        serialized { if exportStages.remove(file) != nil { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) } }
    }
    func resetForDocument() {
        serialized {
            cancelAll(); releaseAllImports()
            for file in Array(exportStages) { releaseExport(file) }
        }
    }
    private func beginOnQueue(name: String, mime: String) throws -> String {
        guard pending.count < 3, name.count <= 160, !name.contains("/"), !name.contains("\\"),
              (name.lowercased().hasSuffix(".json") && mime == "application/json") || (name.lowercased().hasSuffix(".wav") && mime == "audio/wav") else { throw failure("文件类型无效。") }
        let id = UUID().uuidString, path = root.appendingPathComponent(id + ".partial")
        try Data().write(to: path, options: .atomic)
        pending[id] = Pending(url: path, destination: root.appendingPathComponent(id + "_" + name), size: 0)
        return id
    }
    private func appendOnQueue(id: String, encoded: String) throws -> Bool {
        guard var item = pending[id], encoded.count <= 65536, let data = Data(base64Encoded: encoded), item.size + data.count <= 250 * 1024 * 1024 else { cancel(id); throw failure("文件超过大小限制。") }
        do {
            let handle = try FileHandle(forWritingTo: item.url); defer { try? handle.close() }
            try handle.seekToEnd(); try handle.write(contentsOf: data); item.size += data.count; pending[id] = item; return true
        } catch { cancel(id); throw error }
    }
    private func finishOnQueue(_ id: String) throws -> URL {
        guard let item = pending[id] else { throw failure("文件保存请求已失效。") }
        do { try FileManager.default.moveItem(at: item.url, to: item.destination); pending[id] = nil; return item.destination }
        catch { cancel(id); throw error }
    }
    private func cancelOnQueue(_ id: String) { if let item = pending.removeValue(forKey: id) { try? FileManager.default.removeItem(at: item.url) } }
    private func listOnQueue(backup: Bool) throws -> [String] {
        try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).filter { $0.pathExtension.lowercased() == (backup ? "json" : "wav") }.map(\.lastPathComponent).sorted().reversed()
    }
    // The web page receives a random capability, never an external filesystem path.
    private func importFileOnQueue(_ source: URL, kind: LocalImportKind) throws -> [String: Any] {
        guard source.isFileURL, let mime = kind.mime(extension: source.pathExtension) else { throw failure("请选择符合类型的备份、声音或照片。") }
        guard imports.count < 3 else { throw failure("请先完成当前文件导入。") }
        let access = source.startAccessingSecurityScopedResource()
        defer { if access { source.stopAccessingSecurityScopedResource() } }
        guard try source.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else { throw failure("不能导入符号链接。") }
        let id = UUID().uuidString, destination = importRoot.appendingPathComponent(id + "." + source.pathExtension.lowercased())
        var coordinatedError: NSError?, result: Error?, size = 0
        let copy: (URL) -> Void = { [self] url in
            do {
                let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
                guard values.isRegularFile == true, values.isSymbolicLink != true, let expected = values.fileSize, expected > 0, expected <= kind.limit else { throw failure("文件为空、不是普通文件或超过大小限制。") }
                let input = try FileHandle(forReadingFrom: url); defer { try? input.close() }
                try Data().write(to: destination, options: .atomic)
                let output = try FileHandle(forWritingTo: destination); defer { try? output.close() }
                while let data = try input.read(upToCount: 48 * 1024), !data.isEmpty {
                    size += data.count; guard size <= kind.limit else { throw failure("文件超过大小限制。") }
                    try output.write(contentsOf: data)
                }
                guard size > 0 else { throw failure("文件为空。") }
            } catch { result = error }
        }
        // asCopy picker results and legacy archives already live in our sandbox.
        // Coordinate only a provider's security-scoped URL; local copies need no provider service.
        if access { NSFileCoordinator().coordinate(readingItemAt: source, options: .withoutChanges, error: &coordinatedError, byAccessor: copy) }
        else { copy(source) }
        do {
            if let error = result ?? coordinatedError { throw error }
            try validateImport(destination, kind: kind)
            imports[id] = destination
            return ["id": id, "name": source.lastPathComponent, "mime": mime, "size": size]
        } catch { try? FileManager.default.removeItem(at: destination); throw error }
    }
    private func importLocalOnQueue(name: String, kind: LocalImportKind) throws -> [String: Any] {
        guard !name.contains("/"), !name.contains("\\"), try list(backup: kind == .backup).contains(name) else { throw failure("本地文件不存在。") }
        return try importFile(root.appendingPathComponent(name), kind: kind)
    }
    private func readImportOnQueue(id: String, offset: Int) throws -> String {
        guard let url = imports[id], offset >= 0, offset <= 250 * 1024 * 1024 else { throw failure("文件读取请求已失效。") }
        let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(offset)); return (try handle.read(upToCount: 48 * 1024) ?? Data()).base64EncodedString()
    }
    private func releaseImportOnQueue(_ id: String) { if let url = imports.removeValue(forKey: id) { try? FileManager.default.removeItem(at: url) } }
    private func validateImport(_ url: URL, kind: LocalImportKind) throws {
        if kind == .backup {
            guard let backup = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any], backup["format"] as? String == "free-impro-sounds", let version = backup["version"] as? Int, [1, 2].contains(version), let sounds = backup["sounds"] as? [Any], sounds.count <= 200 else { throw failure("不是有效的声音库备份。") }
        } else if kind == .photo {
            guard let image = CGImageSourceCreateWithURL(url as CFURL, nil), let info = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [CFString: Any], let width = info[kCGImagePropertyPixelWidth] as? Int, let height = info[kCGImagePropertyPixelHeight] as? Int, width > 0, height > 0, Double(width) * Double(height) <= 40_000_000 else { throw failure("照片无法读取或分辨率过大。") }
        } else {
            let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
            let data = [UInt8](try handle.read(upToCount: 16) ?? Data()), ext = url.pathExtension.lowercased()
            func matches(_ text: String, offset: Int = 0) -> Bool {
                let bytes = Array(text.utf8)
                return data.count >= offset + bytes.count && Array(data[offset..<(offset + bytes.count)]) == bytes
            }
            let valid: Bool
            switch ext {
            case "wav": valid = matches("RIFF") && matches("WAVE", offset: 8)
            case "mp3": valid = matches("ID3") || (data.count >= 2 && data[0] == 255 && data[1] & 224 == 224)
            case "m4a": valid = matches("ftyp", offset: 4)
            case "aac": valid = data.count >= 2 && data[0] == 255 && data[1] & 246 == 240
            case "aif", "aiff": valid = matches("FORM") && (matches("AIFF", offset: 8) || matches("AIFC", offset: 8))
            case "flac": valid = matches("fLaC")
            case "ogg": valid = matches("OggS")
            default: valid = false
            }
            guard valid else { throw failure("声音文件类型与内容不符。") }
        }
    }
    private func failure(_ text: String) -> NSError { NSError(domain: "FreeImpro", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
}
