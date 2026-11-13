# Portable native headless sample

The normal Linux-x64 and Windows-x64 standalone builder packages the existing SDK, Kestrel Yards core and actual Emergence Engine in one native executable. It compiles the source-pinned QuickJS-NG0.11.0 engine core, embeds the complete browser-targeted application as raw read-only JavaScript, and supplies the existing native primitive surface through a finite C adapter. The Mac/JSC program and its source remain unchanged.

## Actual build commands

On the actual matching Linux or Windows x64 developer worker, use the existing normal SDK install/build first, then:

```sh
pnpm build:sample:server
pnpm exec vitest run test/portable-native-headless.test.mjs --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism
```

The direct `node scripts/build-portable-headless.mjs OUTPUT` command produces an explicit output and adjacent build receipt. A developer can supply its genuine existing build via `EW_MR34_PORTABLE_ARTIFACT` to the new test file; the fixture rechecks actual artifact/section hashes, target, native source hashes and complete current application input hashes. Without that input, it performs one normal build for the four cases. This is a development fixture, not the production six-row checker.

The builder uses existing CMake>=3.16 and the system C compiler. Windows uses the existing Visual Studio2022 x64 generator and C11 atomic support, links the C runtime statically, and uses only system Winsock/BCrypt for its channel. Linux uses the existing x64 system compiler, C library, threading and math libraries. Compiler identity, normal commands/output/cache and all source/artifact hashes belong to the actual receipt. Their availability and the produced ABI must be checked on each real worker; a source proposal supplies no compiler or target pass. No toolchain installer, package fetch, cross-ABI substitution or runtime download is built in.

## Source and execution boundary

The exact MIT QuickJS-NG source commit is6a9fe9af5ca0bf7c49ae697edef44864272317d1. The vendor source descriptor binds every file. Only cutils.c, dtoa.c, libregexp.c, libunicode.c and quickjs.c compile into the engine library. No QuickJS CLI, std/os modules, host module loader or guest filesystem/process/environment access is installed. The MIT notice is embedded verbatim in the actual artifact and written beside it.

The application source is the same connect/createYard entry and existing native-headless/runtime.js used by the Mac headless builder. Its full source closure is bundled without external application imports. Raw source lives in the executable's read-only, non-executable .ewjs section; actual ELF/PE section parsing verifies the bytes and records their location/hash. This does not hide code from the production scanner or grant a disposition.

The native primitive surface is UTF8 encoding, Latin1 base64, bounded timers and one original WebSocket channel. Existing SDK/Engine code still owns SHA256, complete saves, restore, state, proposals, events, representation and Host messages. The C adapter pumps actual QuickJS promise jobs and real socket/timer events. It does not emulate the game, fabricate a save or acknowledge failed work.

The launcher URL must be the exact captured ws IPv4 loopback URL with an explicit valid port, no user/password/query/fragment, and no raw whitespace/control characters. The channel never resolves a name, follows a redirect, uses a proxy or selects another destination. Its upgrade challenge, OS-random masks, fragmented UTF8 text, ping/pong and close frames are real WebSocket protocol. Payload/queue/timer capacities retain the existing4MiB/1000/1024 bounds. The one-use token is sent only after a valid upgrade and is never logged or persisted.

## Qualification boundary

Four new cases require the actual normally built program and real HostBridge/Engine. They cover exact saves/resume with fragmented and ping-interleaved Host frames outside the source directory and without a JS runtime in PATH; a refused final save retained for deliberate retry; foreign/malformed launcher authorities; and redirects/wrong upgrade challenges before credential transmission.

The source has only Node syntax checks, common C/API syntax parsing and tiny inert exact-function RFC6455/SHA1, UTF8 and URL vectors. No Linux/Windows program has compiled, linked, launched or completed these four cases here. Platform's existing QuickJS-WASM Engine execution is relevant precedent, not qualification of this native engine/version/adapter.

The original production scan, target-specific kernel confinement, thirty-second admission, full sixty-second positive window,250ms socket sampling, provider exclusion, account effects, player-projection prerequisites, six check rows and canonical signing remain unchanged and required. Existing declared-network checker source and Mac evidence remain separate. No new compiler artifact, source-only receipt, development fixture or old Mac signature makes MR3.4 or F8.18 operational.
