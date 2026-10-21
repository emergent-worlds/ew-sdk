import AppKit
import JavaScriptCore

/** Native presentation of the same SDK-connected Kestrel core. Check grants create no UI. */
final class YardWindow: NSObject, NSWindowDelegate {
    var window: NSWindow?, callback: JSValue?
    var summary: NSTextField!, progress: NSTextField!, status: NSTextField!
    func show(_ handler: JSValue) {
        guard window == nil else { return }; callback = handler
        summary = NSTextField(wrappingLabelWithString: "Opening Kestrel Yards…")
        progress = NSTextField(wrappingLabelWithString: "")
        status = NSTextField(wrappingLabelWithString: "")
        let app = NSApplication.shared; app.setActivationPolicy(.regular)
        let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 760, height: 440), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        win.title = "Kestrel Yards"; win.delegate = self; win.minSize = NSSize(width: 600, height: 380)
        let title = NSTextField(labelWithString: "Kestrel Yards"); title.font = .systemFont(ofSize: 28, weight: .semibold)
        summary.font = .systemFont(ofSize: 16); progress.font = .systemFont(ofSize: 16)
        let controls = NSStackView(); controls.orientation = .horizontal; controls.spacing = 12
        for (label, action) in [("Work on timber", "timber"), ("Work on hulls", "hulls"), ("Work on rigging", "rigging")] {
            let button = NSButton(title: label, target: self, action: #selector(act(_:))); button.identifier = NSUserInterfaceItemIdentifier(action); controls.addArrangedSubview(button)
        }
        let actions = NSStackView(); actions.orientation = .horizontal; actions.spacing = 12
        for (label, action) in [("Advance one day", "advance"), ("Save", "save")] {
            let button = NSButton(title: label, target: self, action: #selector(act(_:))); button.identifier = NSUserInterfaceItemIdentifier(action); actions.addArrangedSubview(button)
        }
        let stack = NSStackView(views: [title, summary, progress, controls, actions, status]); stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 22
        stack.translatesAutoresizingMaskIntoConstraints = false; win.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: win.contentView!.leadingAnchor, constant: 32), stack.trailingAnchor.constraint(equalTo: win.contentView!.trailingAnchor, constant: -32), stack.topAnchor.constraint(equalTo: win.contentView!.topAnchor, constant: 32)])
        window = win; win.center(); win.makeKeyAndOrderFront(nil); app.activate(ignoringOtherApps: true)
    }
    func render(_ text: String) {
        guard window != nil else { return }
        guard let bytes = text.data(using: .utf8), let view = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any] else { return }
        summary.stringValue = view["summary"] as? String ?? ""
        progress.stringValue = view["progress"] as? String ?? ""
        status.stringValue = view["status"] as? String ?? ""
    }
    @objc func act(_ sender: NSButton) { if let action = sender.identifier?.rawValue { callback?.call(withArguments: [action]) } }
    func windowShouldClose(_ sender: NSWindow) -> Bool { callback?.call(withArguments: ["close"]); return false }
}
