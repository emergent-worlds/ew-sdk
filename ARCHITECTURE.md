# ew-sdk

The SDK through which an installed game reaches the App beside it.

This repository is part of build V2 of Emergent Worlds, written new from the design record (the operator's direction of 2026-10-12). It is public, under the Apache License 2.0. The plan that placed it is the cycle's [plan.md](https://github.com/emergent-worlds/command-center/blob/main/operations/founder-product-development/cycles/2026-10-13-build-v2/plan.md), approved on 2026-10-14.

## What it holds

The library, the loopback transport of the host contract, the check mode the build check runs it in, and the sample game, which is the Reality that installs for J11 (a build for Windows, macOS, and Linux, a server build, and a web entry beside them).

## The record it answers to

The files page Section 4; MR3.3, MR3.4; J11. The record is the operator's published pages and canvases, indexed in [the coverage index](https://claude.ai/artifact/VyiizrkJLiAS53ky4TTryN); a copy in a repository is not the record, and where this repository and the record differ, the record holds.

## What it depends on

`ew-host`.

## Layout

`src/`, `check/`, `sample/`.

## Technology

TypeScript (the first binding); others as games need them. The reasons are in [`docs/decisions.md`](./docs/decisions.md).

## Status

Created on 2026-10-14 in wave 0 of build V2; nothing is built yet.
