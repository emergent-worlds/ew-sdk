# Decisions: ew-sdk

Appended newest first. Each entry records the decision, the alternatives considered, and the rationale.

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
