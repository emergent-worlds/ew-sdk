# Decisions: ew-sdk

Appended newest first. Each entry records the decision, the alternatives considered, and the rationale.

## 2026-10-16: Prove sample readiness through the actual server session

**Decision.** Emit completed core progress after state restoration and handler registration. Require that signal in the ordinary sample smoke and add a development probe using the actual sibling server HeadlessSession with real SDK child processes.

**Alternatives.** Treat status as loading completion, keep the old smoke passing while the server stays starting, or claim artifact/runtime acceptance from a controlled socket host.

**Rationale.** The E16 server build must use the same lifecycle as other cores. A new regression and actual child probe both failed before the progress fix. Node, Bun and compiled process checks now exercise the server's running gate and saved shutdown. Production artifact trust and native target selection remain independent requirements.

## 2026-10-16: Confine executable scans to manifest-declared target directories

**Decision.** Derive the complete executable containment set from the checked immutable manifest. Require portable, non-overlapping prefixes, scan literal hosts only in the active target, refuse archives anywhere, and sign only the active prefix.

**Alternatives.** Refuse every executable outside the active target, exempt caller-supplied paths, or scan and sign sibling targets as one payload.

**Rationale.** E17's recorded multi-target clarification permits one folder to hold desktop and server builds. The previous scan incorrectly rejected a legitimate sibling executable. Manifest-derived containment preserves refusal of undeclared executable placement without weakening active-target network evidence.

## 2026-10-16: Bind check signing to the installer's exact canonical bytes

**Decision.** Use ew-host's shared canonical build-list helpers in line six. Supply immutable identity, prefix, exact executable, sorted files, payload and its hash to the signing callback; require the returned hash to match and retain the signed envelope in evidence.

**Alternatives.** Let the callback choose the file-list encoding, omit the prefix/executable from the signature, or accept any well-formed returned hash.

**Rationale.** The recorded E12/E16 bytes must grant the same executable authority in check and install. The callback remains a trusted service boundary with no signing key inside the SDK. Synthetic callback tests establish ordering and binding, while native verification and real signing acceptance remain separate.

## 2026-10-15: A separate local build-check tool

**Decision.** The optional `sdk/check` entry implements the local E17 runner, retaining six ordered evidence rows, a fixed 60-second observation, 250 ms process socket samples, and platform callbacks for saves, model calls, and signing. The ordinary SDK entry remains independent of those process and socket-server tools. A missing signing integration remains pending.

**Alternatives.** Duplicate the game in check mode, shorten a run while reporting a pass, publish a check-only save, or let a local smoke stand for signed artifact acceptance.

**Rationale.** S8 and E17 require the actual executable and actual game state, followed by signing only when every prerequisite passes. The permanent files record already describes the mechanism and policy values. The shared canonical payload now closes the structural signed-list seam; real signing service/key integration remains required. Static and sampled TCP evidence retain their known limits in each report.

## 2026-10-15: One real engine core for Kestrel Yards

**Decision.** The sample uses one engine-backed core for the web worker, native window worker, and headless SDK process. Check mode runs that same headless entry. The core owns complete saves, confirmed-byte deduplication, terminal handlers, and quit acknowledgment after persistence. The engine is a sample development dependency, and is imported through its packaged public exports.

**Alternatives.** A check-only state fixture, separate native simulation, or a runtime engine dependency for all SDK consumers.

**Rationale.** E16 and J11 require actual game state shared across contexts. The permanent files record's scoped Kestrel subsection supplies the content and rules, marked designed in the build and sort (b). Local socket, worker, and compiled-process checks supply evidence for this slice. Native source compilation does not establish signed or cross-platform acceptance.

## 2026-10-15: Share the core connection in normal and check execution

**Decision.** The first SDK binding composes ew-host's bounded loopback transport and explicit core loader. The game supplies its save and quit handlers in both ordinary play and check mode.

**Alternatives.** Duplicate the host protocol or fabricate check-only persistence.

**Rationale.** E7 and E16 require the same authoritative core calls and actual game state in every execution context. A real local socket suite verifies the boundary without claiming native launcher or isolated build-check completion.

## 2026-10-14: The sample game is J11's fixture

**Decision.** The sample game is the first-party Reality that installs, listed in the test environment for the runs that need it.

**Alternatives.** A separate fixture repository.

**Rationale.** One place for the SDK and the game that proves it. Recorded from the build V2 plan, approved by the operator on 2026-10-14.

## 2026-10-14: Public, Apache License 2.0

**Decision.** This repository is public under the Apache License 2.0 (the operator's decision of 2026-10-14).

**Alternatives.** Private.

**Rationale.** Game makers build against it, and the licence carries an explicit patent grant. Recorded from the build V2 plan, approved by the operator on 2026-10-14.
