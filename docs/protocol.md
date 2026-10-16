# Installed-game connection

The launcher supplies `EW_SDK_URL` and `EW_SDK_TOKEN` to the child process. The URL is `ws://127.0.0.1:<ephemeral-port>/`. The credential is generated for one launch, is accepted for one connection within 30 seconds, and never belongs in a URL, save, log, or diagnostic. The launcher is responsible for authentication and admission; this library is its client.

Call `connect()` from `@emergent-worlds/sdk`. An embedding shell may supply `{ url, token, signal }` directly. The connection uses the explicit core endpoint of `@emergent-worlds/host`; it has no picker, export, preferences, or App navigation methods. Those belong to the companion App's page endpoint. The pinned host protocol schemas are the vocabulary authority.

Each WebSocket frame is one JSON text value. The first client frame is `{ "token": "<launch credential>" }`. Subsequent messages carry `ew: 1`. The client sends `ready`, the host sends a `grant` with `endpoint: "core"`, and `connect` resolves. Requests carry `id`; replies carry `reply_to`, `ok`, and either `result` or `error`. Request IDs belong to this connection. Frames are limited to 4 MiB. Binary, malformed, oversized, and excessive unread frames close the connection. Outstanding requests reject when the connection closes. Call `close()` when the game has finished.

The game owns serialization of its state. Register `on('save.request', ...)` and answer with `save(message.reason, files)`, where `files` is the complete tree, each entry names its SHA-256, and changed files also carry base64 bytes. Register `handle('quit', async ...)`, await a `save('leaving', files)`, and then return acknowledgment. The launcher remains responsible for child-process exit after that acknowledgment; do not terminate before the reply can leave the process. A save failure must reject shutdown rather than report successful persistence.

`EW_SDK_CHECK=1` uses the same connection and game implementation. The check runner supplies a local stub host and exercises the game's ordinary save and quit handlers. The SDK does not fabricate a save or simulate a successful check. Model calls still use the host; the SDK does not hold provider credentials.

This first implementation slice covers the connection. The sample game, native launcher, isolated check runner, signed builds, publication, and cross-platform journeys remain separate work in the Build V2 cycle. The package has not been published to npm.
