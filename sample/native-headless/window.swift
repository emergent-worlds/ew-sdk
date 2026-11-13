import AppKit
import JavaScriptCore

private struct YardDisplay: Decodable, Equatable {
    enum Theme: String, Decodable { case light, dark }
    enum TextSize: String, Decodable {
        case small, `default`, large, larger

        var scale: CGFloat {
            switch self {
            case .small: return 0.9
            case .default: return 1
            case .large: return 1.15
            case .larger: return 1.3
            }
        }
    }
    enum Contrast: String, Decodable { case `default`, high }
    enum Motion: String, Decodable { case full, reduced }

    let theme: Theme
    let textSize: TextSize
    let contrast: Contrast
    let motion: Motion

    var appearance: NSAppearance.Name {
        theme == .dark ? .darkAqua : .aqua
    }
}

private struct YardRendering: Decodable {
    let summary: String
    let progress: String
    let status: String
    let display: YardDisplay
}

/** Native presentation of the same SDK-connected Kestrel core. Check grants create no UI. */
final class YardWindow: NSObject, NSWindowDelegate {
    var window: NSWindow?, callback: JSValue?
    var title: NSTextField!, summary: NSTextField!, progress: NSTextField!, status: NSTextField!
    private var buttons: [NSButton] = []
    private var display: YardDisplay?

    func show(_ handler: JSValue) {
        guard window == nil else { return }; callback = handler
        summary = NSTextField(wrappingLabelWithString: "Opening Kestrel Yards…")
        progress = NSTextField(wrappingLabelWithString: "")
        status = NSTextField(wrappingLabelWithString: "")
        let app = NSApplication.shared; app.setActivationPolicy(.regular)
        let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 760, height: 440), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        win.title = "Kestrel Yards"; win.delegate = self; win.minSize = NSSize(width: 600, height: 380)
        title = NSTextField(labelWithString: "Kestrel Yards")
        let controls = NSStackView(); controls.orientation = .horizontal; controls.spacing = 12
        for (label, action) in [("Work on timber", "timber"), ("Work on hulls", "hulls"), ("Work on rigging", "rigging")] {
            let button = NSButton(title: label, target: self, action: #selector(act(_:))); button.identifier = NSUserInterfaceItemIdentifier(action); controls.addArrangedSubview(button); buttons.append(button)
        }
        let actions = NSStackView(); actions.orientation = .horizontal; actions.spacing = 12
        for (label, action) in [("Advance one day", "advance"), ("Save", "save")] {
            let button = NSButton(title: label, target: self, action: #selector(act(_:))); button.identifier = NSUserInterfaceItemIdentifier(action); actions.addArrangedSubview(button); buttons.append(button)
        }
        let stack = NSStackView(views: [title, summary, progress, controls, actions, status]); stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 22
        stack.translatesAutoresizingMaskIntoConstraints = false; win.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: win.contentView!.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(equalTo: win.contentView!.trailingAnchor, constant: -32),
            stack.topAnchor.constraint(equalTo: win.contentView!.topAnchor, constant: 32),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: win.contentView!.bottomAnchor, constant: -24),
        ])
        window = win
    }
    func render(_ text: String) {
        guard let window, let view = try? JSONDecoder().decode(YardRendering.self, from: Data(text.utf8)) else { return }
        let firstRender = display == nil
        if display != view.display {
            display = view.display
            window.appearance = NSAppearance(named: view.display.appearance)
            window.animationBehavior = view.display.motion == .reduced ? .none : .default
            let scale = view.display.textSize.scale
            // The account's contrast is independent of the Mac's Increase Contrast preference.
            let highContrast = view.display.contrast == .high
            let dark = view.display.theme == .dark
            let ink: NSColor = dark ? .white : .black
            window.backgroundColor = highContrast ? (dark ? .black : .white) : .windowBackgroundColor
            title.font = .systemFont(ofSize: 28 * scale, weight: .semibold)
            summary.font = .systemFont(ofSize: 16 * scale)
            progress.font = .systemFont(ofSize: 16 * scale)
            status.font = .systemFont(ofSize: NSFont.systemFontSize * scale)
            for label in [title!, summary!, progress!, status!] { label.textColor = highContrast ? ink : .labelColor }
            for button in buttons {
                let font = NSFont.systemFont(ofSize: NSFont.systemFontSize * scale)
                let title = button.title
                button.font = font
                button.isBordered = !highContrast
                button.wantsLayer = highContrast
                button.layer?.borderColor = highContrast ? ink.cgColor : nil
                button.layer?.borderWidth = highContrast ? 1.5 : 0
                if highContrast {
                    button.attributedTitle = NSAttributedString(string: title, attributes: [.foregroundColor: ink, .font: font])
                } else {
                    button.title = title
                }
            }
        }
        summary.stringValue = view.summary
        progress.stringValue = view.progress
        status.stringValue = view.status
        if firstRender {
            window.center()
            window.makeKeyAndOrderFront(nil)
            NSApplication.shared.activate(ignoringOtherApps: true)
        }
    }
    @objc func act(_ sender: NSButton) { if let action = sender.identifier?.rawValue { callback?.call(withArguments: [action]) } }
    func windowShouldClose(_ sender: NSWindow) -> Bool { callback?.call(withArguments: ["close"]); return false }
}
