import UIKit
import UniformTypeIdentifiers

// Uses the type-filtered picker/delegate pattern reviewed in Apple/WebKit:
// https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/forms/WKFileUploadPanel.mm
// Independent implementation using public UIKit APIs; no WebKit private APIs or copied source.
final class ControlledFilePicker: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
    private weak var presenter: UIViewController?
    private let files: LocalFiles
    private var reply: ((Any?, String?) -> Void)?
    private var kind: LocalImportKind?
    private var exportFile: URL?
    private weak var presented: UIViewController?
    private var operation = 0
    private var processing = false
    init(presenter: UIViewController, files: LocalFiles) { self.presenter = presenter; self.files = files }
    private func ready(_ handler: @escaping (Any?, String?) -> Void) -> Bool {
        guard reply == nil, let presenter, presenter.presentedViewController == nil else { handler(nil, "请先关闭当前窗口。"); return false }
        operation += 1; reply = handler; return true
    }
    func choose(kind selected: LocalImportKind, reply handler: @escaping (Any?, String?) -> Void) {
        guard ready(handler) else { return }; kind = selected; processing = true
        let ticket = operation
        files.perform({ selected == .photo ? [] : try $0.list(backup: selected == .backup) }) { [weak self] result in
            guard let self, self.operation == ticket, self.reply != nil else { return }
            self.processing = false
            switch result {
            case .failure(let error): self.complete(nil, error.localizedDescription)
            case .success(let names): self.showLegacyMenu(names, selected: selected)
            }
        }
    }
    private func showLegacyMenu(_ names: [String], selected: LocalImportKind) {
        guard !names.isEmpty, let presenter else { showImport(); return }
        let menu = UIAlertController(title: selected == .backup ? "导入备份" : "导入声音", message: nil, preferredStyle: .actionSheet)
        menu.addAction(UIAlertAction(title: "从文件选择", style: .default) { [weak self] _ in self?.showImportAfterMenu() })
        for name in names.prefix(100) {
            menu.addAction(UIAlertAction(title: "本应用 · " + String(name.dropFirst(37)), style: .default) { [weak self] _ in
                self?.importSelection { try $0.importLocal(name: name, kind: selected) }
            })
        }
        menu.addAction(UIAlertAction(title: "取消", style: .cancel) { [weak self] _ in self?.complete(NSNull()) })
        menu.popoverPresentationController?.sourceView = presenter.view
        presented = menu; presenter.present(menu, animated: true); menu.presentationController?.delegate = self
    }
    private func importSelection(_ work: @escaping (LocalFiles) throws -> [String: Any]) {
        let ticket = operation; processing = true
        files.perform(work) { [weak self, files] result in
            guard let self, self.operation == ticket, self.reply != nil else {
                if case .success(let metadata) = result, let id = metadata["id"] as? String { files.schedule { $0.releaseImport(id) } }
                return
            }
            switch result {
            case .success(let metadata): self.complete(metadata)
            case .failure(let error): self.complete(nil, error.localizedDescription)
            }
        }
    }
    private func showImportAfterMenu() {
        // UIKit finishes dismissing the action sheet before presenting the file picker.
        let ticket = operation; processing = true
        presenter?.dismiss(animated: true) { [weak self] in
            guard let self, self.operation == ticket, self.reply != nil else { return }
            self.processing = false; self.showImport()
        }
    }
    private func showImport() {
        guard let kind, let presenter else { complete(NSNull()); return }
        let types: [UTType]
        switch kind {
        case .backup: types = [.json]
        case .audio: types = ["wav", "mp3", "m4a", "aac", "aif", "aiff", "flac", "ogg"].compactMap { UTType(filenameExtension: $0) }
        case .photo: types = [.jpeg, .png] + [UTType(filenameExtension: "webp")].compactMap { $0 }
        }
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
        picker.allowsMultipleSelection = false; picker.shouldShowFileExtensions = true; picker.delegate = self
        presented = picker; presenter.present(picker, animated: true); picker.presentationController?.delegate = self
    }
    func export(_ saved: URL, reply handler: @escaping (Any?, String?) -> Void) {
        guard ready(handler) else { return }; kind = nil; processing = true
        let ticket = operation
        files.perform({ try $0.prepareExport(saved) }) { [weak self, files] result in
            guard let self, self.operation == ticket, self.reply != nil, let presenter = self.presenter else {
                if case .success(let file) = result { files.schedule { $0.releaseExport(file) } }
                return
            }
            switch result {
            case .failure(let error): self.complete(nil, error.localizedDescription)
            case .success(let file):
                self.exportFile = file; self.processing = false
                let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
                picker.shouldShowFileExtensions = true; picker.delegate = self
                self.presented = picker; presenter.present(picker, animated: true); picker.presentationController?.delegate = self
            }
        }
    }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard controller === presented, reply != nil, !processing else { return }
        guard urls.count == 1, let url = urls.first else { complete(nil, "一次只能选择一个文件。"); return }
        if let kind { importSelection { try $0.importFile(url, kind: kind) } }
        else { complete(true) }
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard controller === presented, !processing else { return }
        complete(kind == nil ? false : NSNull())
    }
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        if presentationController.presentedViewController === presented, !processing { complete(kind == nil ? false : NSNull()) }
    }
    // Only a destroyed/reloaded document invalidates a capability. App backgrounding
    // while a system picker is visible must preserve its valid selection.
    func resetForDocument() {
        let visible = presented
        complete(kind == nil ? false : NSNull()); operation += 1
        visible?.dismiss(animated: false)
    }
    private func complete(_ result: Any?, _ error: String? = nil) {
        guard let handler = reply else { return }; reply = nil; kind = nil; processing = false; presented = nil; operation += 1
        if let file = exportFile { files.schedule { $0.releaseExport(file) } }; exportFile = nil
        handler(result, error)
    }
}
