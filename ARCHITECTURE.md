# ew-sdk

The SDK through which an installed game reaches the App beside it.

This repository is part of build V2 of Emergent Worlds, written new from the design record (the operator's direction of 2026-10-12). It is public, under the Apache License 2.0. The plan that placed it is the cycle's [plan.md](https://github.com/emergent-worlds/command-center/blob/main/operations/founder-product-development/cycles/2026-10-13-build-v2/plan.md), approved on 2026-10-14.

## What it holds

The library, the loopback transport of the host contract, the check mode the build check runs it in, and the sample game, which is the Reality that installs for J11 (a build for Windows, macOS, and Linux, a server build, and a web entry beside them).

## The record it answers to

The files page Section 4; MR3.3, MR3.4; J11. The authoritative repository record is indexed in the [product coverage index](../command-center/docs/product/coverage.md). Since the operator's decision of 2026-10-15, the published pages and canvases are its view. Changes are made in those permanent product files first, on review branches; where this repository and the record differ, the record holds.

## What it depends on

`ew-host`.

## Layout

`src/`, `check/`, `sample/`.

## Technology

TypeScript (the first binding); others as games need them. The reasons are in [`docs/decisions.md`](./docs/decisions.md).

## Status

Created on 2026-10-14 in wave 0. Wave 3 foundation, 2026-10-15: `src/index.ts` connects installed games to the launcher through ew-host commit `2249802`, with explicit core grants and one-use credentials read from the environment or an embedding shell. Check mode follows the same code path. Six real local WebSocket integration tests cover authentication ordering, save and quit, check-mode environment, refused credentials, endpoint mismatch, and lost connections. Node 24.22.0 tests, typecheck, and build pass. The wire and game lifecycle obligations are in `docs/protocol.md`. The sample game, launcher, build check, signed release artifacts, and native acceptance remain outstanding; no npm package is published.
