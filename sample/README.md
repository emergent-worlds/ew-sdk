# Kestrel Yards

Kestrel Yards is the sample Reality for E16 and J11, owned by @mercerpress. Its scoped content is recorded under `build-v2-wave-3` in the permanent files record. The opening week has three orders, two berths, six crew, and timber, hull, and rigging assignments. Seeded clear weather, rain, and gales change progress. Play can continue after the opening week. These rules and texts are designed in the build, sort (b).

## Shared implementation

`src/core.ts` composes the real Emergence Engine and the shape in `src/shape.ts`. It uses public packaged exports, without source aliases. The engine dependency is pinned in the repository's package file. The core owns reads, proposals, forecasts, changes, undo, pause, resume, away advances, saves, and quit. A save contains the complete tree and actual engine files; unchanged files omit bytes only after host confirmation. A failed save rejects quit and preserves bytes for retry. Fractional away time belongs to the engine's saved header. After restoring state and registering all core handlers, it sends progress(1), which releases the actual server loading gate. A status message alone does not do so.

`src/worker.ts` runs that core in a browser worker. `src/page.ts` renders the same state in the opaque App frame or a native Tauri window. The native shell supplies the launch URL and one-use credential from its environment to the worker, without storing or logging them. Closing the native window awaits the shared leaving save. `src/headless.ts` runs that core through the SDK. `EW_SDK_CHECK=1` does not select a separate simulation or fabricate saves.

## Local commands

Use Node 24.22.0, pnpm 10.18.0, and Bun 1.4.3. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm build:sample
pnpm check:sample
node scripts/check-sample.mjs bun
pnpm build:sample:server
node scripts/check-sample.mjs compiled
```

The lifecycle check waits for completed core progress and launches two real child processes against a disposable local WebSocket host. The first runs check mode, advances actual state, and confirms interval and leaving saves. The second resumes the saved tree through ordinary execution and verifies byte identity. Only a synthetic fixture credential is used. This check does not perform the six isolated signed-build checks of E17.

For the actual server-session probe, first build the sibling server with `pnpm --dir ../ew-server build`, then run `pnpm check:server-session`, `bun scripts/check-server-session.mjs` and, after compiling the sample, `node scripts/check-server-session.mjs compiled`. This development fixture imports the sibling server's actual HeadlessSession; the published SDK gains no server dependency. Each runtime launches two real SDK children with an ephemeral loopback token. It requires running state, verifies actual saved engine carry after away advance, retains a failed final save and child, confirms save before end, waits for child reaping, and reopens exact saved bytes. The compiled probe uses the actual server child adapter, including failed-end retention, exclusive stage lifetime and handoff quit; its launcher terminates only after confirmed save/quit/end. Interpreted fixtures separately observe natural process exit. The socket host and platform persistence are fixture ports. Compiled mode signs only an ephemeral in-memory local envelope and consumes the sibling server verified-stage helper before launching its derived executable through the actual server child adapter, checking the exact streamed bytes, modes and native format. No key material is persisted or printed. It does not select or verify a production signed artifact; parser fixtures on other formats do not establish cross-target execution.

For a browser fixture, run `node scripts/serve-sample.mjs` after building. Open the printed loopback URL. It hosts the actual page and worker through separate page and core grants; the fixture theme button sends a host display message. This fixture is separate from the publishable folder.

For the native shell, build the sample, then run `cargo check --manifest-path sample/src-tauri/Cargo.toml` and `cargo build --manifest-path sample/src-tauri/Cargo.toml`. The source requires Tauri 2 and the platform prerequisites. `node scripts/check-sample.mjs native` launches that debug executable twice through the same lifecycle fixture. On macOS this exercises the actual WKWebView, its worker, and the Rust command supplying the launch environment. The fixture terminates the child after the final-save acknowledgment, as the launcher owns process exit. It does not interact with the native window's close control. The current icon is a first-party placeholder copied from the company's App. No new artwork or final sample identity is asserted.

## Artifact and acceptance limits

`sample/build/` contains the web entry, worker, manifest, headless module, and optional locally compiled Bun server executable. Generated outputs are ignored. The manifest intentionally has no install targets until native targets and their actual files are packaged and verified. The local server executable has been exercised on the current macOS machine; it is not a signed release artifact.

Desktop and phone browser checks, local Node and Bun lifecycle checks, and the macOS native lifecycle fixture establish this implementation slice. Complete native journeys and window-close interaction, Windows and Linux targets, signed releases, launcher admission, isolated checks, publication, and J11's complete journey remain open. The sample makes no external model calls.


The standalone server build uses `scripts/build-standalone-sample.mjs` directly from the current headless source. It rejects unresolved imports, disables Bun configuration/dotenv autoloads and emits an adjacent exact-byte build receipt. It does not rebuild the web page; use `pnpm build:sample` for the browser/worker entries. To preserve an older local diagnostic binary, provide a different output path to the script. These flags remove unused bundled application code, not Bun runtime implementations. Current updater, inspector, package and certificate endpoint findings remain refused by the production scanner; the fresh build is not a signed or accepted release.


### Minimal macOS server target

`pnpm build:sample:server:macos` builds a separate headless macOS13 arm64 executable using system Foundation and JavaScriptCore. Every actual SDK, Kestrel and Engine asset is embedded as raw JavaScript; no Node, Bun, Homebrew, developer toolchain or downloaded application asset is required to launch it. The adjacent `.build.json` records exact artifact/source hashes, target and system linkage. The same ordinary SDK connection and game core are used for checks. The frozen current-macOS production check passed its first five rows; signing and independent integrated acceptance remain pending. It is not a signed or supported release. Windows/Linux, installed window, web and full J11 acceptance remain open.
