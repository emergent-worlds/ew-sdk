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

The shared Kestrel core emits progress(1) only after saved-state loading and all core handlers are ready. Earlier local smokes waited only for status, which did not expose the missing progress signal. The real HeadlessSession remained starting and could not advance or perform its interval save. The smoke now waits for completed progress, and check:server-session uses the actual sibling server session against real Node, Bun and compiled sample children. It proves running state, real engine carry, interval save, retained failed final save, saved end, natural child exit and exact-state resume.

This development probe has controlled loopback/platform ports and adds no server dependency to the public SDK package. For compiled mode it first consumes the sibling server native-entry guard to check the actual file against the current OS/CPU. This passes on the current macOS-arm64 executable. It does not provide production signed server-artifact acquisition, verified executable staging or a child launcher in ew-server or the App runner. Those E16 integrations, release packaging and complete native acceptance remain open. The sample manifest still declares no install targets until actual target files are packaged and verified.
