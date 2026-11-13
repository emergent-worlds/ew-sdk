# Trusted native check support

MR3.4 uses the existing sixty-second runner, six evidence rows, account save and
leaving-save acknowledgements, platform model route and canonical service
signature. The adapter is chosen by a trusted deployment, never by an uploaded
manifest, environment, shell command or callback that supplies observations.

| Worker and artifact | Source implementation | Actual qualification |
| --- | --- | --- |
| macOS arm64, thin arm64 Mach-O | Existing Seatbelt adapter | Retained narrow current-Mac proof only; each artifact/account/signature remains distinct |
| Linux x64, ELF64 little-endian x86_64 | Owned bubblewrap SDK-only and declared-TCP adapters | Unverified. Requires actual root-owned bubblewrap/Python/runtime, usable user/mount/PID/network/IPC/UTS/cgroup namespaces, relay canaries, actual artifact SDK/save run and whole-family absence |
| macOS Intel, thin x64 Mach-O | Matching-current-ABI Seatbelt branch | Unverified. Actual x64 ABI and Seatbelt canaries required; no Rosetta transfer |
| Windows x64 | Owned AppContainer/Job with exact dynamic WFP policy | Unverified. Matching normal helper build and existing WFP/loopback rights are required; no exemption is added |
| Phones | No installed native target | Original remote Studio build/check route; no arbitrary phone-local executable claim |
| server | Exact matching worker ABI only | A target category, not evidence for every operating system |

## Linux first packet

The executable must be a member of the already scanned immutable tree. The
runner passes its exact hash and byte count to the adapter. Read-only mounts
expose that tree, trusted relay source, selected system Python and its library
roots. The empty namespace root is remounted read-only. Private HOME and TMP
mounts are writable; no host home, credentials, display, DBus, SSH socket, host
network or permissive namespace fallback is exposed. The original empty-network path remains exact. Nonempty declared TCP asks select the separate owned declared-network setup below.
The private pathname relay connects only to the parent-generated loopback SDK
port. Four connections and 64MiB aggregate traffic are finite relay ceilings;
reaching either ceiling closes the connection and cannot produce a check pass.

The host finds the actual artifact below its own launcher, checks the kernel's
PID/start/namespace and executable device/inode/hash/size, and samples that PID,
not the namespace init or relay. Identity is rechecked around each existing
socket sample. Any absent, recycled, changed or ambiguous subject refuses.

Disposal retains the namespace init's kernel identity, rediscovers owned
children and rechecks identity before each owned signal. It must prove wrapper
and known namespace-family absence before removing the private control root.
An unbound or changed identity retains the root and fails cleanup. These are
source guarantees to qualify, not actual Linux kernel or lifecycle evidence.

No local native compiler, artifact, model, API account or sandbox was run for
this source packet. Source controls do not replace the original sixty-second
positive/negative/save/signature and cleanup canaries on an admitted Linux host.

## Consequential Linux boundary repairs

SDK readiness may be observed while native binding is pending, but no grant,
file capability, account save or model callback is admitted until the actual
executable has bound. Effects recheck identity and the sticky relay health.
The executable is re-statted after its hash read to reject a same-PID exec.

The Linux adapter requires Python's actual kernel pidfd primitives. A hash-pinned
one-shot helper binds each handle to the verified PID/start/namespace before
sending; there is no numeric-PID kill fallback. Failed init discovery still
attempts termination of every positively owned anchor, while family uncertainty
retains scratch and remains nonpassing. Primary launch and separate cleanup
failures are bounded structured evidence. Direct-child legacy Mac cleanup is
unchanged.

Both relay layers latch connection/byte overflow, close the main stream as well
as auxiliaries, and prevent healthy/signing evidence from reappearing. The
original source-control result remains narrow prior-source evidence; new causal
controls and actual kernel/SDK qualification are distinct gates.

## Declared TCP continuation

The exact manifest host/optional-port authority and current provider exclusions are resolved once before launch. The captured address set supplies both native rules and the existing TCP sampler. DNS drift cannot add a later permitted address. Direct provider names and addresses refuse; unresolved provider exclusion custody refuses. An unresolved unused declared host grants no address and is recorded without inventing success. This is the existing TCP check scope, with no new UDP/QUIC or inbound authority.

Linux uses existing root-owned slirp4netns and nft tools in the owned user/network namespace. It never shares or edits the host network namespace. Before uploaded code starts, the trusted setup confirms the namespace differs from the parent, applies only the exact captured outbound TCP rules plus SDK endpoint, reads those actual rules back, and drops all effective, permitted, inheritable, bounding and ambient capabilities with no_new_privs. Exact generated hosts/NSS data supplies only captured names. The unchanged bounded SDK relay and pidfd family drain remain. Held namespace descriptors bind the ordinary user-mode transport; its retirement is required with namespace-family cleanup. Missing existing tools, kernel facilities or rights refuse before code. There is no install, elevation, sysctl, host firewall, service or permission change.

macOS adds only exact captured IP/port Seatbelt rules and the existing system DNS read/lookup seam to the original private profile. System resolution cannot add another TCP grant. The original empty-network profile and launcher function bodies remain byte-identical. Intel and new declared-network execution are unqualified until actual matching-worker checks.

Windows adds exact per-AppContainer address/protocol/optional-port soft permits ahead of default blocks in its own dynamic sublayer. These permits do not override the existing worker firewall. The actual filter conditions are read back before the suspended artifact resumes. Its native endpoint-policy digest must match the captured authority. SDK-only argv/frames remain omitted-field compatible. Job, held image, existing loopback comparison, profile/desktop retirement and scratch custody remain mandatory.

Normal SDK build/type entrypoints include all target adapters. The eight new authority/native controls are unexecuted. Neither parsing nor a kernel canary substitutes for a real original sixty-second account/save/compute/signing check on each new target. The previous official Mac receipts retain their exact old source/artifact tuples.
