import Foundation
import JavaScriptCore
import MachO

// The system frameworks are deployment dependencies. No application asset is loaded from disk.
let frameLimit = 4 * 1024 * 1024
func fatal(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}
let environment = ProcessInfo.processInfo.environment
guard let launch = environment["EW_SDK_URL"], let token = environment["EW_SDK_TOKEN"],
      !token.isEmpty, token.utf8.count < frameLimit,
      let address = URLComponents(string: launch), address.scheme == "ws", address.host == "127.0.0.1",
      let port = address.port, (1...65535).contains(port), address.user == nil, address.password == nil,
      address.query == nil, address.fragment == nil, let endpoint = address.url,
      endpoint.absoluteString == launch else { fatal("The launcher must supply one exact loopback endpoint and credential.") }
guard let header = _dyld_get_image_header(0), header.pointee.magic == MH_MAGIC_64 else { fatal("Unsupported native image.") }
var length: UInt = 0
let header64 = UnsafeRawPointer(header).assumingMemoryBound(to: mach_header_64.self)
guard let section = getsectiondata(header64, "__TEXT", "__ewjs", &length), length > 0,
      let script = String(data: Data(bytes: section, count: Int(length)), encoding: .utf8),
      let context = JSContext() else { fatal("The embedded application is unavailable.") }
context.exceptionHandler = { _, _ in fatal("The embedded application failed.") }
func install(_ name: String, _ value: Any) { context.setObject(value, forKeyedSubscript: name as NSString) }
let encoder: @convention(block) (String) -> [UInt8] = { Array($0.utf8) }
let b64encode: @convention(block) (String) -> String? = { value in
    var data = Data(); for scalar in value.unicodeScalars { guard scalar.value <= 255 else { return nil }; data.append(UInt8(scalar.value)) }
    return data.base64EncodedString()
}
let b64decode: @convention(block) (String) -> String? = { value in
    guard let data = Data(base64Encoded: value) else { return nil }
    return String(data.map { Character(UnicodeScalar(Int($0))!) })
}
var timers: [Int: Timer] = [:], nextTimer = 0
let timer: @convention(block) (JSValue, Double) -> Int = { callback, delay in
    guard delay.isFinite, delay >= 0, delay <= Double(Int32.max), timers.count < 1024 else { fatal("Invalid timer request.") }
    nextTimer += 1; let id = nextTimer
    timers[id] = Timer.scheduledTimer(withTimeInterval: max(delay / 1000, 0.001), repeats: false) { _ in
        timers.removeValue(forKey: id); callback.call(withArguments: [])
    }
    return id
}
let clearTimer: @convention(block) (Int) -> Void = { timers.removeValue(forKey: $0)?.invalidate() }
install("__utf8", encoder); install("__btoa", b64encode); install("__atob", b64decode)
install("__timer", timer); install("__clearTimer", clearTimer)
install("__launch", ["url": launch, "token": token, "port": String(port)])
let fail: @convention(block) () -> Void = { fatal("The embedded application failed.") }
install("__fatal", fail)

final class Channel: NSObject, URLSessionWebSocketDelegate {
    let endpoint: URL
    init(endpoint: URL) { self.endpoint = endpoint; super.init() }
    var session: URLSession!, socket: URLSessionWebSocketTask?, callback: JSValue?
    var closed = false, used = false, queuedBytes = 0
    var pending: [String] = [], sending = false
    func emit(_ kind: String, _ data: String = "") { callback?.call(withArguments: [kind, data]) }
    func open(_ url: String, _ listener: JSValue) -> Bool {
        guard !used, url == endpoint.absoluteString else { return false }
        used = true; callback = listener
        let configuration = URLSessionConfiguration.ephemeral
        configuration.connectionProxyDictionary = [:]
        configuration.httpCookieStorage = nil; configuration.urlCredentialStorage = nil; configuration.urlCache = nil
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
        let task = session.webSocketTask(with: endpoint); task.maximumMessageSize = frameLimit
        socket = task; task.resume(); receive(); return true
    }
    func receive() {
        guard !closed, let socket else { return }
        Task {
            do {
                let message = try await socket.receive()
                DispatchQueue.main.async {
                    guard !self.closed else { return }
                    guard case let .string(text) = message, text.utf8.count <= frameLimit else { self.stop("error"); return }
                    self.emit("message", text); self.receive()
                }
            } catch { DispatchQueue.main.async { self.stop("error") } }
        }
    }
    func send(_ text: String) -> Bool {
        let bytes = text.utf8.count
        guard !closed, socket != nil, bytes <= frameLimit, queuedBytes + bytes <= frameLimit, pending.count < 1000 else { return false }
        queuedBytes += bytes; pending.append(text); flush(); return true
    }
    func flush() {
        guard !closed, !sending, let socket, let text = pending.first else { return }
        sending = true
        Task {
            do {
                try await socket.send(.string(text))
                DispatchQueue.main.async {
                    guard !self.closed else { return }
                    self.pending.removeFirst(); self.queuedBytes -= text.utf8.count
                    self.sending = false; self.flush()
                }
            } catch { DispatchQueue.main.async { self.stop("error") } }
        }
    }
    func stop(_ event: String) {
        guard !closed else { return }; closed = true
        pending.removeAll(); queuedBytes = 0
        socket?.cancel(with: .normalClosure, reason: nil); session?.invalidateAndCancel(); emit(event); callback = nil
        DispatchQueue.main.async { exit(event == "error" ? 1 : 0) }
    }
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) { if !closed { emit("open") } }
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) { stop("close") }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil); stop("error") }
}
let channel = Channel(endpoint: endpoint)
let open: @convention(block) (String, JSValue) -> Bool = { channel.open($0, $1) }
let send: @convention(block) (String) -> Bool = { channel.send($0) }
let close: @convention(block) () -> Void = { channel.stop("close") }
install("__open", open); install("__send", send); install("__close", close)
context.evaluateScript(script)
RunLoop.main.run()
