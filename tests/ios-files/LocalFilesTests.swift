import Foundation
import ImageIO
import CoreGraphics

@main enum LocalFilesTests {
    struct QueueFixture { let imports: [String]; let partial: String; let stage: URL }
    static func reject(_ operation: () throws -> Void) {
        do { try operation(); fatalError("Expected rejection") } catch {}
    }
    static func pump(until finished: () -> Bool) {
        let deadline = Date().addingTimeInterval(5)
        while !finished() && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.01)) }
        assert(finished(), "Queued file operation did not complete")
    }
    static func checkQueueAndDocumentReset(_ files: LocalFiles, source: URL, saved: URL) throws {
        let started = DispatchSemaphore(value: 0), resume = DispatchSemaphore(value: 0)
        var heartbeat = false, completed: [Int] = [], fixture: QueueFixture?, newID: String?
        files.perform({ storage -> QueueFixture in
            assert(!Thread.isMainThread); started.signal(); assert(resume.wait(timeout: .now() + 5) == .success)
            let ids = try (0..<3).map { _ in try storage.importFile(source, kind: .backup)["id"] as! String }
            reject { _ = try storage.importFile(source, kind: .backup) }
            let partial = try storage.begin(name: "interrupted.json", mime: "application/json")
            let stage = try storage.prepareExport(saved)
            return QueueFixture(imports: ids, partial: partial, stage: stage)
        }) { result in
            assert(Thread.isMainThread); fixture = try! result.get(); completed.append(1)
        }
        assert(started.wait(timeout: .now() + 1) == .success)
        DispatchQueue.main.async { heartbeat = true }
        pump { heartbeat }; assert(completed.isEmpty, "File work unexpectedly blocked the UI queue")
        files.perform({ $0.resetForDocument() }) { result in
            assert(Thread.isMainThread); _ = try! result.get(); completed.append(2)
        }
        files.perform({ try $0.importFile(source, kind: .backup)["id"] as! String }) { result in
            assert(Thread.isMainThread); newID = try! result.get(); completed.append(3)
        }
        resume.signal(); pump { completed.count == 3 }; assert(completed == [1, 2, 3])
        let old = fixture!, selected = newID!
        for id in old.imports { reject { _ = try files.readImport(id: id, offset: 0) } }
        reject { _ = try files.finish(old.partial) }
        assert(!FileManager.default.fileExists(atPath: old.stage.path))
        assert(FileManager.default.fileExists(atPath: saved.path), "Reload deleted the persistent backup")
        // Synchronous callers also share the same queue; repeated concurrent reads
        // exercise dictionary lookup without racing queued release/reset operations.
        DispatchQueue.concurrentPerform(iterations: 30) { _ in
            assert((try! files.readImport(id: selected, offset: 0)).isEmpty == false)
            assert((try! files.list(backup: true)).contains(saved.lastPathComponent))
        }
        files.releaseAllImports(); reject { _ = try files.readImport(id: selected, offset: 0) }
    }
    static func main() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("EMPVC-Files-Test-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let source = root.appendingPathComponent("old-device.json"), backup = Data("{\"format\":\"free-impro-sounds\",\"version\":2,\"sounds\":[]}".utf8)
        try backup.write(to: source)
        let files = try LocalFiles(root: root.appendingPathComponent("new-install"))
        let selected = try files.importFile(source, kind: .backup), id = selected["id"] as! String
        assert(selected["name"] as? String == "old-device.json"); assert(selected["mime"] as? String == "application/json"); assert(selected["size"] as? Int == backup.count)
        let importedBytes = try files.readImport(id: id, offset: 0); assert(Data(base64Encoded: importedBytes) == backup)
        files.releaseImport(id); reject { _ = try files.readImport(id: id, offset: 0) }
        reject { _ = try files.readImport(id: source.path, offset: 0) }
        reject { _ = try files.importFile(URL(string: "https://example.com/file.json")!, kind: .backup) }
        let bad = root.appendingPathComponent("wrong.json"); try Data("{\"format\":\"other\"}".utf8).write(to: bad)
        reject { _ = try files.importFile(bad, kind: .backup) }
        let symlink = root.appendingPathComponent("link.json"); try FileManager.default.createSymbolicLink(at: symlink, withDestinationURL: source)
        reject { _ = try files.importFile(symlink, kind: .backup) }
        let folder = root.appendingPathComponent("directory.json"); try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        reject { _ = try files.importFile(folder, kind: .backup) }
        let disguised = root.appendingPathComponent("html.wav"); try Data("<html>not audio</html>".utf8).write(to: disguised)
        reject { _ = try files.importFile(disguised, kind: .audio) }
        let huge = root.appendingPathComponent("huge.wav"); try Data().write(to: huge)
        let handle = try FileHandle(forWritingTo: huge); try handle.truncate(atOffset: UInt64(LocalImportKind.audio.limit + 1)); try handle.close()
        reject { _ = try files.importFile(huge, kind: .audio) }
        let wav = root.appendingPathComponent("sound.wav"), waveBytes = Data(Array("RIFF".utf8) + [4,0,0,0] + Array("WAVE".utf8))
        try waveBytes.write(to: wav); let sound = try files.importFile(wav, kind: .audio); assert(sound["mime"] as? String == "audio/wav"); files.releaseImport(sound["id"] as! String)
        for (ext, bytes) in [("flac", Array("fLaC".utf8) + [255, 128, 0, 4]), ("ogg", Array("OggS".utf8) + [255, 128, 0, 4]), ("aiff", Array("FORM".utf8) + [255, 128, 0, 4] + Array("AIFF".utf8))] {
            let url = root.appendingPathComponent("binary." + ext); try Data(bytes).write(to: url)
            let item = try files.importFile(url, kind: .audio); files.releaseImport(item["id"] as! String)
        }
        let exportID = try files.begin(name: "library.json", mime: "application/json"), appended = try files.append(id: exportID, encoded: backup.base64EncodedString()); assert(appended)
        let saved = try files.finish(exportID), savedBytes = try Data(contentsOf: saved); assert(savedBytes == backup)
        let old = try files.importLocal(name: saved.lastPathComponent, kind: .backup); assert(old["mime"] as? String == "application/json"); files.releaseAllImports()
        let unicodeID = try files.begin(name: "课堂作品 旧设备.JSON", mime: "application/json")
        _ = try files.append(id: unicodeID, encoded: backup.base64EncodedString())
        let unicodeSaved = try files.finish(unicodeID), staged = try files.prepareExport(unicodeSaved)
        assert(staged.lastPathComponent == "课堂作品 旧设备.JSON"); assert((try! Data(contentsOf: staged)) == backup)
        assert((try! files.list(backup: true)).contains(unicodeSaved.lastPathComponent))
        let unicodeImport = try files.importLocal(name: unicodeSaved.lastPathComponent, kind: .backup)
        assert(unicodeImport["mime"] as? String == "application/json"); files.releaseAllImports(); files.releaseExport(staged)
        assert(!FileManager.default.fileExists(atPath: staged.path))
        let pixel = Data([UInt8](repeating: 255, count: 4)), provider = CGDataProvider(data: pixel as CFData)!
        let image = CGImage(width: 1, height: 1, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue), provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
        let photo = root.appendingPathComponent("photo.png"), destination = CGImageDestinationCreateWithURL(photo as CFURL, "public.png" as CFString, 1, nil)!
        CGImageDestinationAddImage(destination, image, nil); assert(CGImageDestinationFinalize(destination))
        let selectedPhoto = try files.importFile(photo, kind: .photo); assert(selectedPhoto["mime"] as? String == "image/png"); files.releaseAllImports()
        try checkQueueAndDocumentReset(files, source: source, saved: saved)
        print("iOS LocalFiles: external migration, import validation, serial background work, main-thread completion and document reset cleanup passed")
    }
}
