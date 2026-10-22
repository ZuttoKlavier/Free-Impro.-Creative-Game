import UIKit
import AVFAudio
import AudioToolbox

// Only StudentController's validated main-frame bridge calls this service.
// Audio bytes stay local; neither diagnostics nor metering exposes file paths.
@MainActor
final class StudentAudio: NSObject, AVAudioRecorderDelegate, AVAudioPlayerDelegate {
    typealias Reply = (Any?, String?) -> Void
    var onRecordingEnded: ((String) -> Void)?
    var onPlaybackEnded: ((String) -> Void)?

    private let maximumDuration = 15.0
    private let maximumWAVBytes = 6 * 1024 * 1024
    private let temporaryRoot = FileManager.default.temporaryDirectory.appendingPathComponent("FreeImproAudio", isDirectory: true)
    private var epoch: UInt = 0
    private var pendingID: String?
    private var pendingReply: Reply?
    private var recorder: AVAudioRecorder?
    private var recordingID: String?
    private var recordedDuration = 0.0
    private var recordingFailure: String?
    private var recordingInterrupted = false
    private var recordingEndNotified = false
    private var maximumPeakPower = -160.0
    private var player: AVAudioPlayer?
    private var playbackID: String?
    private struct RhythmConfiguration {
        let id: String
        let bars: Int
        let bpm: Double
        let revision: Int
        let duration: Double
        var startDeviceTime = 0.0
        var loopBase = 0
    }
    private struct QueuedRhythm {
        let player: AVAudioPlayer
        let configuration: RhythmConfiguration
    }
    private var rhythmConfiguration: RhythmConfiguration?
    private var queuedRhythm: QueuedRhythm?
    private let maximumRhythmBytes = 40 * 1024 * 1024

    override init() {
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(audioInterrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
    }

    func start(id: String, completion: @escaping Reply) {
        guard validID(id) else { completion(nil, "录音请求无效。"); return }
        guard UIApplication.shared.applicationState == .active else { completion(nil, "请回到应用后再开始录音。"); return }
        guard pendingID == nil, recorder?.isRecording != true else { completion(nil, "请先完成当前录音。"); return }
        discardRecording()
        stopPlayback()
        epoch &+= 1
        let ticket = epoch
        pendingID = id
        pendingReply = completion
        // The system callback may arrive on another thread or after cancellation.
        AVAudioApplication.requestRecordPermission { [weak self] granted in
            Task { @MainActor [weak self] in
                guard let self, self.epoch == ticket, self.pendingID == id else { return }
                guard granted else { self.completeStart(nil, "没有麦克风权限，请在 iPhone 设置中允许声音课堂使用麦克风。"); return }
                guard UIApplication.shared.applicationState == .active else { self.completeStart(NSNull(), nil); return }
                do {
                    let session = AVAudioSession.sharedInstance()
                    try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
                    try session.setActive(true)
                    guard session.isInputAvailable else { throw self.failure("没有可用的麦克风，请检查已连接的耳机或音频设备。"); }
                    try FileManager.default.createDirectory(at: self.temporaryRoot, withIntermediateDirectories: true)
                    let file = self.temporaryRoot.appendingPathComponent(UUID().uuidString + ".wav")
                    let settings: [String: Any] = [
                        AVFormatIDKey: kAudioFormatLinearPCM,
                        AVSampleRateKey: 48000.0,
                        AVNumberOfChannelsKey: 1,
                        AVLinearPCMBitDepthKey: 16,
                        AVLinearPCMIsBigEndianKey: false,
                        AVLinearPCMIsFloatKey: false,
                        AVLinearPCMIsNonInterleaved: false,
                    ]
                    let capture = try AVAudioRecorder(url: file, settings: settings)
                    self.recorder = capture
                    self.recordingID = id
                    self.recordedDuration = 0
                    self.recordingFailure = nil
                    self.recordingInterrupted = false
                    self.recordingEndNotified = false
                    self.maximumPeakPower = -160
                    capture.delegate = self
                    capture.isMeteringEnabled = true
                    guard capture.prepareToRecord(), capture.record(forDuration: self.maximumDuration) else {
                        throw self.failure("麦克风未能开始录音，请检查是否被通话或其他应用占用。")
                    }
                    self.completeStart(true, nil)
                } catch {
                    self.discardRecording()
                    self.restorePlaybackCategory()
                    self.completeStart(nil, "录音暂时无法使用：\(error.localizedDescription)")
                }
            }
        }
    }

    func level() -> [String: Any] {
        guard let recorder, let id = recordingID else {
            return ["active": false, "duration": 0, "rms": 0, "peak": 0, "power": -160, "peakPower": -160]
        }
        let active = recorder.isRecording
        if active { recordedDuration = min(maximumDuration, recorder.currentTime) }
        recorder.updateMeters()
        let average = finitePower(recorder.averagePower(forChannel: 0))
        let peak = finitePower(recorder.peakPower(forChannel: 0))
        maximumPeakPower = max(maximumPeakPower, peak)
        var result: [String: Any] = [
            "id": id, "active": active, "duration": recordedDuration,
            "rms": average <= -160 ? 0 : pow(10, average / 20),
            "peak": peak <= -160 ? 0 : pow(10, peak / 20),
            "power": average, "peakPower": peak, "maximumPeakPower": maximumPeakPower,
            "interrupted": recordingInterrupted,
        ]
        if let recordingFailure { result["error"] = recordingFailure }
        return result
    }

    func stop(id: String) throws -> [String: Any]? {
        if pendingID == id { cancel(id: id); return nil }
        guard recordingID == id, let recorder else { return nil }
        if recorder.isRecording { recordedDuration = min(maximumDuration, recorder.currentTime) }
        // stop() synchronously closes the WAV file before any byte is returned.
        recorder.delegate = nil
        recorder.stop()
        let url = recorder.url
        let error = recordingFailure
        let interrupted = recordingInterrupted
        self.recorder = nil
        recordingID = nil
        recordingFailure = nil
        defer {
            try? FileManager.default.removeItem(at: url)
            restorePlaybackCategory()
        }
        if let error { throw failure(error) }
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size > 0, size <= maximumWAVBytes else { throw failure("录音文件为空或超过 15 秒限制，请重新录制。"); }
        let data = try Data(contentsOf: url)
        let duration = try wavDuration(data)
        recordedDuration = duration
        return ["id": id, "encoded": data.base64EncodedString(), "mime": "audio/wav", "duration": duration, "interrupted": interrupted]
    }

    func cancel(id: String) {
        if pendingID == id {
            epoch &+= 1
            completeStart(NSNull(), nil)
        }
        if recordingID == id {
            discardRecording()
            restorePlaybackCategory()
        }
    }

    func reset() {
        epoch &+= 1
        completeStart(NSNull(), nil)
        discardRecording()
        stopPlayback()
        try? FileManager.default.removeItem(at: temporaryRoot)
        restorePlaybackCategory()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    @discardableResult
    func play(id: String, encoded: String, mime: String) throws -> Bool {
        guard validID(id) else { throw failure("试听请求无效。") }
        guard UIApplication.shared.applicationState == .active else { throw failure("请回到应用后再点击试听。") }
        guard pendingID == nil, recorder?.isRecording != true else { throw failure("请先结束录音再试听。") }
        guard ["audio/wav", "audio/x-wav", "audio/wave"].contains(mime),
              encoded.utf8.count <= (maximumWAVBytes + 2) / 3 * 4,
              let data = Data(base64Encoded: encoded), data.count <= maximumWAVBytes else { throw failure("试听声音格式或大小无效。") }
        _ = try wavDuration(data)
        stopPlayback()
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default)
        try session.setActive(true)
        let sound = try AVAudioPlayer(data: data)
        guard sound.duration.isFinite, sound.duration > 0, sound.duration <= maximumDuration + 0.01 else { throw failure("试听声音不能超过 15 秒。") }
        sound.delegate = self
        sound.volume = 1
        sound.numberOfLoops = 0
        player = sound
        playbackID = id
        guard sound.prepareToPlay(), sound.play() else {
            stopPlayback()
            throw failure("声音未能开始播放，请检查是否被通话或其他应用中断。")
        }
        return true
    }

    @discardableResult
    func playRhythm(id: String, encoded: String, bars: Int, bpm: Double, revision: Int) throws -> Bool {
        try requirePlaybackAvailable()
        let (sound, preparedConfiguration) = try makeRhythm(id: id, encoded: encoded, bars: bars, bpm: bpm, revision: revision)
        stopPlayback()
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default)
        try session.setActive(true)
        sound.delegate = self
        sound.volume = 1
        sound.numberOfLoops = -1
        guard sound.prepareToPlay() else { throw failure("节奏未能准备播放，请检查音频设备。") }
        var configuration = preparedConfiguration
        // The shared hardware clock gives the first loop an exact starting point.
        configuration.startDeviceTime = sound.deviceCurrentTime + 0.025
        player = sound
        playbackID = id
        rhythmConfiguration = configuration
        guard sound.play(atTime: configuration.startDeviceTime) else {
            stopPlayback()
            throw failure("节奏未能开始播放，请检查是否被通话或其他应用中断。")
        }
        return true
    }

    @discardableResult
    func queueRhythm(id: String, encoded: String, bars: Int, bpm: Double, revision: Int) throws -> Bool {
        try requirePlaybackAvailable()
        promoteQueuedRhythm()
        guard player != nil, let configuration = rhythmConfiguration,
              configuration.id == id, playbackID == id else { throw failure("节奏播放已结束，请再次点击播放。") }
        guard revision > max(configuration.revision, queuedRhythm?.configuration.revision ?? -1) else { return false }
        let (next, preparedConfiguration) = try makeRhythm(id: id, encoded: encoded, bars: bars, bpm: bpm, revision: revision)
        next.delegate = self
        next.volume = 1
        next.numberOfLoops = -1
        guard next.prepareToPlay() else { throw failure("修改后的节奏未能准备播放。") }
        // Preparing a long WAV can cross a boundary. Re-read the actual player
        // before choosing the next boundary rather than using an earlier snapshot.
        promoteQueuedRhythm()
        guard let currentPlayer = player, let activeConfiguration = rhythmConfiguration,
              activeConfiguration.id == id, playbackID == id,
              currentPlayer.isPlaying || currentPlayer.deviceCurrentTime < activeConfiguration.startDeviceTime else {
            throw failure("节奏播放已结束，请再次点击播放。")
        }
        let position = rhythmPosition(currentPlayer, activeConfiguration)
        let deviceTime = currentPlayer.deviceCurrentTime
        let boundary = max(deviceTime, activeConfiguration.startDeviceTime) + activeConfiguration.duration - position
        // A missed hardware deadline must not silently start midway through a loop.
        guard boundary > next.deviceCurrentTime + 0.003 else { throw failure("修改太接近循环边界，请再试一次。") }
        var nextConfiguration = preparedConfiguration
        nextConfiguration.startDeviceTime = boundary
        nextConfiguration.loopBase = rhythmLoop(currentPlayer, activeConfiguration) + 1
        queuedRhythm?.player.delegate = nil
        queuedRhythm?.player.stop()
        queuedRhythm = nil
        currentPlayer.numberOfLoops = 0
        guard next.play(atTime: boundary) else {
            currentPlayer.numberOfLoops = -1
            throw failure("修改后的节奏未能排入下一遍，请再试一次。")
        }
        queuedRhythm = QueuedRhythm(player: next, configuration: nextConfiguration)
        // The held player remains current until promotion/its expected finish.
        // Its finish callback must never stop the newly scheduled player.
        return true
    }

    func rhythmState(id: String) -> [String: Any] {
        promoteQueuedRhythm()
        guard let player, let configuration = rhythmConfiguration,
              configuration.id == id, playbackID == id else { return ["active": false, "id": id] }
        // A completion callback can precede the next scheduled player by a few
        // hardware frames; the queued transition is still an active preview.
        let active = player.isPlaying || player.deviceCurrentTime < configuration.startDeviceTime || queuedRhythm != nil
        return [
            "active": active, "id": id, "revision": configuration.revision,
            "bars": configuration.bars, "bpm": configuration.bpm,
            "loop": rhythmLoop(player, configuration), "position": rhythmPosition(player, configuration),
            "duration": configuration.duration, "deviceTime": player.deviceCurrentTime, "startDeviceTime": configuration.startDeviceTime,
            "queuedRevision": queuedRhythm.map { $0.configuration.revision as Any } ?? NSNull(),
        ]
    }

    func stopPlayback(id: String? = nil) {
        guard id == nil || playbackID == id else { return }
        let queued = queuedRhythm?.player
        queuedRhythm = nil
        rhythmConfiguration = nil
        queued?.delegate = nil
        queued?.stop()
        player?.delegate = nil
        player?.stop()
        player = nil
        playbackID = nil
    }

    func diagnostics() -> [String: Any] {
        let session = AVAudioSession.sharedInstance()
        return [
            "category": session.category.rawValue, "mode": session.mode.rawValue,
            "inputAvailable": session.isInputAvailable,
            "permission": AVAudioApplication.shared.recordPermission.rawValue,
            "inputMuted": AVAudioApplication.shared.isInputMuted,
            "sampleRate": session.sampleRate, "outputVolume": session.outputVolume,
            "inputs": session.currentRoute.inputs.map { ["type": $0.portType.rawValue, "name": $0.portName] },
            "outputs": session.currentRoute.outputs.map { ["type": $0.portType.rawValue, "name": $0.portName] },
            "recording": level(), "pending": pendingID != nil, "playing": player?.isPlaying == true,
            "rhythm": rhythmState(id: rhythmConfiguration?.id ?? ""),
        ]
    }

    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        Task { @MainActor [weak self] in
            guard let self, self.recorder === recorder else { return }
            if !flag { self.recordingInterrupted = true }
            self.finishRecording(recorder)
        }
    }

    nonisolated func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        Task { @MainActor [weak self] in
            guard let self, self.recorder === recorder else { return }
            self.recordingFailure = "录音文件无法写入：\(error?.localizedDescription ?? "未知音频错误")"
            recorder.stop()
            self.finishRecording(recorder)
        }
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor [weak self] in self?.finishPlayback(player, successfully: flag) }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor [weak self] in self?.finishPlayback(player, successfully: false) }
    }

    private func finishPlayback(_ finished: AVAudioPlayer, successfully: Bool) {
        guard let id = playbackID, player === finished || queuedRhythm?.player === finished else { return }
        if successfully, player === finished, queuedRhythm != nil {
            promoteQueuedRhythm()
            // The old loop finishing is expected. A later state read will promote
            // if its delegate arrived just before the scheduled device time.
            return
        }
        stopPlayback()
        onPlaybackEnded?(id)
    }

    private func promoteQueuedRhythm() {
        guard let queued = queuedRhythm,
              queued.player.deviceCurrentTime >= queued.configuration.startDeviceTime else { return }
        let previous = player
        queuedRhythm = nil
        player = queued.player
        rhythmConfiguration = queued.configuration
        playbackID = queued.configuration.id
        previous?.delegate = nil
        previous?.stop()
    }

    private func rhythmLoop(_ sound: AVAudioPlayer, _ configuration: RhythmConfiguration) -> Int {
        let elapsed = max(0, sound.deviceCurrentTime - configuration.startDeviceTime)
        return configuration.loopBase + Int(floor(elapsed / configuration.duration))
    }

    private func rhythmPosition(_ sound: AVAudioPlayer, _ configuration: RhythmConfiguration) -> Double {
        guard sound.deviceCurrentTime >= configuration.startDeviceTime else { return 0 }
        return max(0, sound.currentTime).truncatingRemainder(dividingBy: configuration.duration)
    }

    private func requirePlaybackAvailable() throws {
        guard UIApplication.shared.applicationState == .active else { throw failure("请回到应用后再点击播放。") }
        guard pendingID == nil, recorder?.isRecording != true else { throw failure("请先结束录音再播放节奏。") }
    }

    private func makeRhythm(id: String, encoded: String, bars: Int, bpm: Double, revision: Int) throws -> (AVAudioPlayer, RhythmConfiguration) {
        guard validID(id), (1...16).contains(bars), bpm.isFinite, (40...240).contains(bpm), revision >= 0 else { throw failure("节奏小节数、速度或播放请求无效。") }
        guard encoded.utf8.count <= (maximumRhythmBytes + 2) / 3 * 4,
              let data = Data(base64Encoded: encoded), data.count <= maximumRhythmBytes else { throw failure("节奏声音超过大小限制或未完整传输。") }
        let duration = try wavDuration(data, maxDuration: 96, maxBytes: maximumRhythmBytes, maxSampleRate: 192000)
        let sound = try AVAudioPlayer(data: data)
        let expected = Double(bars * 16) * 60 / bpm / 4
        let tolerance = max(0.0001, 2 / sound.format.sampleRate)
        guard sound.duration.isFinite, abs(duration - expected) <= tolerance,
              abs(sound.duration - duration) <= tolerance else { throw failure("节奏声音长度与小节数、速度不一致，请重新播放。") }
        return (sound, RhythmConfiguration(id: id, bars: bars, bpm: bpm, revision: revision, duration: sound.duration))
    }

    private func finishRecording(_ finished: AVAudioRecorder) {
        guard recorder === finished, let id = recordingID, !recordingEndNotified else { return }
        recordingEndNotified = true
        if let data = try? Data(contentsOf: finished.url), let duration = try? wavDuration(data) { recordedDuration = duration }
        restorePlaybackCategory()
        onRecordingEnded?(id)
    }

    @objc nonisolated private func audioInterrupted(_ notification: Notification) {
        guard let type = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber,
              type.uintValue == AVAudioSession.InterruptionType.began.rawValue else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            if let recorder = self.recorder, !self.recordingEndNotified {
                if recorder.isRecording { self.recordedDuration = min(self.maximumDuration, recorder.currentTime) }
                self.recordingInterrupted = true
                recorder.stop()
                self.finishRecording(recorder)
            }
            if let id = self.playbackID {
                self.stopPlayback()
                self.onPlaybackEnded?(id)
            }
        }
    }

    private func completeStart(_ value: Any?, _ error: String?) {
        let reply = pendingReply
        pendingID = nil
        pendingReply = nil
        reply?(value, error)
    }

    private func discardRecording() {
        let old = recorder
        recorder = nil
        recordingID = nil
        recordedDuration = 0
        recordingFailure = nil
        recordingInterrupted = false
        recordingEndNotified = false
        maximumPeakPower = -160
        old?.delegate = nil
        old?.stop()
        if let url = old?.url { try? FileManager.default.removeItem(at: url) }
    }

    private func restorePlaybackCategory() { try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default) }
    private func finitePower(_ power: Float) -> Double { power.isFinite ? min(0, max(-160, Double(power))) : -160 }
    private func validID(_ id: String) -> Bool { !id.isEmpty && id.utf8.count <= 128 }
    private func failure(_ message: String) -> NSError { NSError(domain: "FreeImproAudio", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }

    // Both native recordings and page-generated previews are bounded PCM16 WAVs.
    // Validate RIFF chunks and frame length before giving untrusted bytes to AVAudioPlayer.
    private func wavDuration(_ data: Data, maxDuration: Double? = nil, maxBytes: Int? = nil, maxSampleRate: Int = 192000) throws -> Double {
        let durationLimit = maxDuration ?? maximumDuration
        guard data.count >= 44, data.count <= (maxBytes ?? maximumWAVBytes) else { throw failure("声音文件为空或超过大小限制。") }
        let bytes = [UInt8](data)
        func tag(_ at: Int, _ text: String) -> Bool { Array(bytes[at..<(at + 4)]) == Array(text.utf8) }
        func uint16(_ at: Int) -> Int { Int(bytes[at]) | Int(bytes[at + 1]) << 8 }
        func uint32(_ at: Int) -> Int { Int(bytes[at]) | Int(bytes[at + 1]) << 8 | Int(bytes[at + 2]) << 16 | Int(bytes[at + 3]) << 24 }
        guard tag(0, "RIFF"), tag(8, "WAVE"), uint32(4) + 8 == bytes.count else { throw failure("请使用完整的 WAV 声音文件。") }
        var offset = 12
        var sampleRate = 0
        var blockAlign = 0
        var sampleBytes: Int?
        while offset + 8 <= bytes.count {
            let length = uint32(offset + 4)
            let content = offset + 8
            guard length <= bytes.count - content else { throw failure("声音文件不完整，请重新录制或导入。") }
            if tag(offset, "fmt ") {
                guard sampleRate == 0, length >= 16, uint16(content) == 1,
                      uint16(content + 2) == 1, uint16(content + 14) == 16 else { throw failure("试听仅支持单声道 PCM16 WAV 声音。") }
                sampleRate = uint32(content + 4)
                blockAlign = uint16(content + 12)
                guard (8000...maxSampleRate).contains(sampleRate), blockAlign == 2,
                      uint32(content + 8) == sampleRate * blockAlign else { throw failure("声音采样格式无效。") }
            } else if tag(offset, "data") {
                guard sampleBytes == nil else { throw failure("声音文件包含重复的音频数据。") }
                sampleBytes = length
            }
            offset = content + length + length % 2
            guard offset <= bytes.count else { throw failure("声音文件不完整。") }
        }
        guard offset == bytes.count, sampleRate > 0, let sampleBytes, sampleBytes > 0,
              sampleBytes % blockAlign == 0 else { throw failure("声音文件中没有有效的录音数据。") }
        let duration = Double(sampleBytes / blockAlign) / Double(sampleRate)
        guard duration > 0, duration <= durationLimit + 0.01 else { throw failure("声音超过允许的时长，请重新录制或播放。") }
        return duration
    }
}
