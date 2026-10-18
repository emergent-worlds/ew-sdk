# ew-sdk

The SDK through which an installed game reaches the App beside it.

This repository is part of build V2 of Emergent Worlds, written new from the design record (the operator's direction of 2026-10-12). It is public, under the Apache License 2.0. The plan that placed it is the cycle's [plan.md](https://github.com/emergent-worlds/command-center/blob/main/operations/founder-product-development/cycles/2026-10-13-build-v2/plan.md), approved on 2026-10-14.

## What it holds

The library, the loopback transport of the host contract, the check mode the build check runs it in, and the sample game, which is the Reality that installs for J11 (a build for Windows, macOS, and Linux, a server build, and a web entry beside them).

## The record it answers to

The files page Section 4; MR3.3, MR3.4; J11. The authoritative repository record is indexed in the [product coverage index](../command-center/docs/product/coverage.md). Since the operator's decision of 2026-10-15, the published pages and canvases are its view. Changes are made in those permanent product files first, on review branches; where this repository and the record differ, the record holds.

## What it depends on

`ew-host` at runtime. The Kestrel Yards sample additionally consumes the real Emergence Engine as a development dependency; SDK consumers do not acquire an engine dependency.

## Layout

`src/` holds the installed-game binding. `sample/src/core.ts` holds the shared Kestrel Yards state and handlers, with browser worker and headless entries beside it. `sample/src-tauri/` holds the native window source. `scripts/` builds the sample and checks real child processes; `check/frame-host.ts` is the disposable browser host fixture. The sample's [README](sample/README.md) describes these paths and verification limits.

`check/runner.ts`, `scan.ts`, and `sockets.ts` implement the optional Node build-check tool exported as `sdk/check`. It produces the six E17 evidence rows for one target, with platform service callbacks. Its [contract and limits](docs/checks.md) distinguish a local lifecycle fixture from isolated target checks and canonical signing integration.

## Technology

TypeScript (the first binding); others as games need them. The reasons are in [`docs/decisions.md`](./docs/decisions.md).

## Status

Created on 2026-10-14 in wave 0. Wave 3, 2026-10-15: `src/index.ts` connects installed games through ew-host commit `2249802`, with explicit core grants and one-use credentials read from the environment or an embedding shell. Check mode follows the same code path. Kestrel Yards now has a real engine core shared by its browser worker, headless SDK process, and native window. Its content was recorded in the permanent files record before implementation. Tests cover connection lifecycle, deterministic play, complete saves, resume, saved fractional away time, terminal changes, and failed-save retry. Real local child-process checks cover Node, Bun, a locally compiled Bun server binary, and the macOS Tauri executable's actual WKWebView and worker; browser evidence covers desktop and phone layouts with host theme changes. The macOS native source passes Cargo check and build. Complete native journeys, Windows and Linux builds, signing, launcher admission, the isolated build check, and J11 acceptance remain open. No npm package is published.


The optional check runner uses ew-host's canonical installed build encoding. Its signing callback receives the signed prefix and exact executable, canonical payload, SHA-256 and the exact first five prerequisite rows; the runner refuses a returned hash for different bytes and preserves the payload with the signature in evidence. This closes the structural encoding gap; real signing service/key configuration and artifact acceptance remain open.

The E17 static scan derives all executable containment prefixes from the immutable manifest, validates portable non-overlapping target directories, and permits executable sibling targets. Active-target hosts and network observations remain separate, archives are refused across the complete tree, and signing includes only the selected target.

## Actual server-session readiness

The shared Kestrel core emits progress(1) only after saved-state loading and all core handlers are ready. Earlier local smokes waited only for status, which did not expose the missing progress signal. The real HeadlessSession remained starting and could not advance or perform its interval save. The smoke now waits for completed progress, and check:server-session uses the actual sibling server session against real Node, Bun and compiled sample children. It proves running state, real engine carry, interval save, retained failed final save, saved end, child reaping and exact-state resume. The interpreted fixtures observe natural process exit; compiled mode uses the actual server child adapter after its correlated saved quit and fenced end.

This development probe has controlled loopback/platform ports and adds no server dependency to the public SDK package. Compiled mode verifies an ephemeral local canonical envelope and streams the actual executable through the sibling server private-stage helper, including signed modes and native compatibility. The server child adapter exclusively reserves and rechecks that stage, then launches only its derived entry over its actual bounded loopback host. It retains failed save/end and prevents stage disposal until reaping, and confirms requested handoff quit before end. This passes on the current macOS-arm64 executable. No fixture key material is persisted or printed. Matching-machine artifact selection and supervised persistent native composition are implemented in ew-server716d8a7, with their controlled compiled proof. Installed App away-runner composition is implemented in ew-app c09784f with account-bound consent, registered-runner commands and saved-quit/reaping tests. Real release trust/key packaging, account-backed populated native journeys and other-target acceptance remain open. The sample manifest still declares no install targets until actual target files are packaged and verified.

E17 static evidence now distinguishes a candidate literal from a syntactically valid endpoint and retains byte-bound occurrence diagnostics. Invalid DNS/IPv4/port forms and partial numeric tokens do not become permission requests. Valid runtime/provider candidates retain the original gates. A bounded256-occurrence report,512byte raw excerpt and explicit streaming-capacity/completeness state prevent incomplete evidence from passing or signing. The recorded October16 compiled artifact does not pass:111 potential endpoints remain, with1,761 occurrences exceeding the retained report capacity. This is a classification/reporting correction under the cycle's R7 architecture review, not metadata disposition, confinement or build acceptance.


## Current standalone artifact packaging

The standalone builder now uses the actual current reachable SDK/sample/Engine source, minifies, rejects unresolved runtime imports and disables all four configuration/dotenv autoloads. Its adjacent receipt binds source bundle, compiler/target, flags and executable bytes. The static diagnosis tool accepts an explicit artifact path so historical failed bytes need not be overwritten. Fresh packaging reduces the local sample to71,143,154bytes but still yields109 potential endpoints and1,761 occurrences, with incomplete bounded evidence. Real updater/npm/inspector and certificate URL bytes remain unresolved; no classifier expansion, runtime waiver or network permission is introduced. Focused packaging and production-scanner tests pass. The existing SDK check receipt owns the final account-backed current-artifact run and its remaining R7 gates.

One fresh account-backed production check on artifact SHA256b127aa3ee4a236b68d6dfa883cb73fb09df94c5a4ddfd9244a07a3dcccc62543 ran60,002ms with240samples,238SDK observations and no sampling errors, missed samples, refused messages or denied sampled connections. Interval/leaving saves belong to the actual check account at sequences1/2. Rows1 to4 pass, row5 fails and row6 remains pending because109 static endpoints are unresolved and the256-occurrence report remains incomplete. Zero provider calls establish no provider-routing coverage. This is a correctly retained current-artifact failure, not complete artifact, signing, native, deployed or R7 acceptance.


## Minimal macOS server target, implementation in progress

The cycle's admitted R7 continuation B is implemented in `sample/native-headless/` and `scripts/build-native-headless.mjs`. It embeds the same SDK, Kestrel core and Engine as raw JavaScript in a read-only Mach-O section and uses system Foundation/JavaScriptCore on macOS13 arm64. The native adapter exposes only the exact original launcher channel and finite encoding/timer facilities. It requires no separately installed JavaScript runtime or downloaded application code. Build provenance records the source bundle, artifact, target and linked frameworks. Five focused native cases pass, including outside-workspace actual SDK/Engine save/resume, failed-final-save no retry, invalid endpoint refusal and exact technical occurrence changed-byte/duplicate negatives. The frozen current-macOS account-backed production check ran60,001ms and passed rows1-5 with191 complete retained static occurrences, four exact trusted technical dispositions,239 SDK socket samples and actual interval/leaving saves. Independent Astra review accepts this exact current-macOS arm64 headless first-five-row boundary, including an outside-workspace redirect-refusal probe. Row6 is pending and no release support or full R7/J11 closure is claimed. Raw bytes remain scanned and no static disposition or sampler exemption follows from this packaging. Windows/Linux, native window, web, signing, provider coverage, deployed and full J11 gates remain separate.
