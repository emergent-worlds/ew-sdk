# Installed-game connection

The launcher supplies `EW_SDK_URL` and `EW_SDK_TOKEN` to the child process. The URL is `ws://127.0.0.1:<ephemeral-port>/`. The credential is generated for one launch, is accepted for one connection within 30 seconds, and never belongs in a URL, save, log, or diagnostic. The launcher is responsible for authentication and admission; this library is its client.

Call `connect()` from `@emergent-worlds/sdk`. An embedding shell may supply `{ url, token, signal }` directly. The connection uses the explicit core endpoint of `@emergent-worlds/host`; it has no picker, export, preferences, or App navigation methods. Those belong to the companion App's page endpoint. The pinned host protocol schemas are the vocabulary authority.

Each WebSocket frame is one JSON text value. The first client frame is `{ "token": "<launch credential>" }`. Subsequent messages carry `ew: 1`. The client sends `ready`, the host sends a `grant` with `endpoint: "core"`, and `connect` resolves. Requests carry `id`; replies carry `reply_to`, `ok`, and either `result` or `error`. Request IDs belong to this connection. Frames are limited to 4 MiB. Binary, malformed, oversized, and excessive unread frames close the connection. Outstanding requests reject when the connection closes. Call `close()` when the game has finished.

The game owns serialization of its state. Register `on('save.request', ...)` and answer with `save(message.reason, files)`, where `files` is the complete tree, each entry names its SHA-256, and changed files also carry base64 bytes. Register `handle('quit', async ...)`, await a `save('handoff', files)` for a handoff reason or `save('leaving', files)` otherwise, and then return acknowledgment. The launcher remains responsible for child-process exit after that acknowledgment; do not terminate before the reply can leave the process. A save failure must reject shutdown rather than report successful persistence.

`EW_SDK_CHECK=1` uses the same connection and game implementation. The check runner supplies a local stub host and exercises the game's ordinary save and quit handlers. The SDK does not fabricate a save or simulate a successful check. Model calls still use the host; the SDK does not hold provider credentials.

The Kestrel Yards sample uses these handlers with the real Emergence Engine, including complete saves and saved fractional away time. Its [README](../sample/README.md) explains the shared browser, native-window, and server entries and the local lifecycle checks. Native launcher admission, the isolated build check, signed builds, publication, and cross-platform journeys remain open in the Build V2 cycle. The package has not been published to npm.

For an installed server target, the SDK connection stays alive for the launcher to complete the fenced server end after a successful quit reply. The launcher then owns direct child termination and reaping. A failed save or quit must leave the process available for retry. This is the same saved-state implementation used in ordinary and check mode; the game receives no machine credential.

## Optional installed player projection

For a launcher that supports shared play with installed games, call `connectWithRemotePlayerProjection(options)`. It uses the same URL, one-use token and abort signal as `connect()`, and returns `{ core, projection }` after the ordinary core grant. Keep the existing state, save and quit handlers on `core`. Serve the game’s per-player projection with `serveRemotePlayerProjection(projection, descriptor, handlers)`, exported by the SDK.

The first frame authenticates the single socket and core frames keep their existing format. The projection frames use the separate `ewPlayerProjection` envelope. The server supplies each admitted sender and controls guest and terminal authority. Closing the projection leaves the core available for a final save. Closing the core or cancelling the launch closes the whole connection. Use `connect()` for the existing core-only protocol.
