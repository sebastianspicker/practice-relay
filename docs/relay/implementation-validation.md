# Optimization validation record

This record separates local implementation evidence from service and deployment
verification. The changes are local to the checkout; no user-data migration or
publication is part of this work.

## Retained and removed candidates

| Candidate | Decision and evidence |
| --- | --- |
| Bitwise ZIP CRC loop and fragment-buffer assembly | Replaced by a lookup table, one CRC per entry, and a preallocated archive. The legacy algorithm survives only in the byte-equivalence test oracle. |
| Toolkit emitted-package test and duplicated root invocation | Removed after moving unique CLI/artifact assertions into `scripts/check-packed-consumer.mjs` and behavioral assertions into toolkit source tests. |
| Toolkit capture, engraving, import, reference-reader, and validator exports | Retained: declared package subpaths and isolated packed-consumer imports. |
| Four toolkit CLI bins | Retained: exact manifest targets and execution from isolated tarballs are checked by the packed consumer. |
| Toolkit intermediate fixtures 02–05 | Retained: the declared fixture wildcard and packed file surface include them even without individual in-tree consumers. |
| Handoff root, package, projections, RO-Crate, and ZIP facades | Retained: declared exports, API consumers, schema validation, and documented invocation. |
| JSON and memory record adapters | Retained for single-process labs, with explicit multi-process rejection. |
| PostgreSQL title B-tree index | Removed from the new migration: literal substring filtering does not use a prefix-only B-tree index. Membership and ID keyset indexes remain. |
| PostgreSQL placeholder document | Removed after implementing the actual record/runtime adapters and migration documentation. |
| Movement browser facade | Retained as a supported aggregate export; vocabulary-only consumers now use the isolated vocabulary subpath. |
| Source/build toolkit TypeScript configurations | Retained as separate contracts: source checks run without generated artifacts, and emitted checks exercise actual packed outputs. |
| `design-preview` | Retained as an existing standalone preview. Its inline stylesheet was extracted byte-for-byte to meet the source-size gate. |
| Generated artifacts, archives, and unrelated dirty changes | Preserved according to the repository operating contract. |

## Evidence boundaries

Frozen-lockfile installation and `pnpm check:all` passed with Node 24.20.0 and
pnpm 9.15.0. That gate covers source types, production builds, isolated packed
consumers, tooling checks, schemas and OpenAPI parity, documentation links,
architecture boundaries, and workspace unit tests. Focused checks were rerun
after subsequent migration-validation changes. An independent source review also
examined transaction authorization, JSON recovery, media leases, quota
accounting, and cleanup. Media regression tests cover overlapping recovery and
replacement, deletion-dependent quota credit, and single-process S3 metadata,
download, and pending-reservation recovery across restart.

The JSON recovery suite reopens explicit on-disk interrupted transaction states,
including partial UTF-8 event appends and every intermediate restore-directory
rename. It verifies canonical records, revisions, counters, and exactly-once
audit recovery. These checks exercise filesystem recovery logic; they do not
simulate storage hardware losing acknowledged writes.

`pnpm check:integration` is the separate required PostgreSQL 18/S3 lane. It
starts two API processes and covers concurrency, admission, single-use LTI, media
failure injection, query budgets, cardinality measurements, and a PostgreSQL
dump/restore comparison. Docker execution was rejected by the local automatic
approval review during this implementation, so this lane must not be reported as
passed in that environment.

Native Chrome desktop checks exercised Relay login, pagination, title filtering,
lazy details, focus retention, request timeout, forbidden-response clearing, and
expiry against a synthetic HTTP API. Workbench checks exercised save/edit/load,
the read-only projection and provenance, and roving keyboard focus. Those checks
do not prove PostgreSQL integration. Mobile, console inspection, explicit logout,
and a conclusive delayed-request cancellation browser check remained unverified in
the final pass, though deterministic logout and cancellation tests pass. The
repository now ships `pnpm screenshots`, a Playwright-based capture of the
maintained surfaces for documentation; it is not a verification gate.

## Measurements

The ZIP byte-oracle test measured 1 MiB archives at 312.56 ms for the previous
algorithm and 51.12 ms for the new one, and 10 MiB at 4638.81 ms and 630.96 ms.
These single-machine observations correspond to roughly 6.1× and 7.4×; they are
not deployment latency guarantees. Tests separately assert identical archive
bytes, deterministic paths, CRC values, and hashes.

`pnpm benchmark:runtime` compares a simulated enumerate-before-mutate path with
point mutation and lookup on the current JSON adapter at 100, 1,000, and 10,000
records. It also compares blocking scrypt work with asynchronous login and records
event-loop yield time. The comparison isolates the removed enumeration cost; it
is not a benchmark of a pristine historical checkout.

The final Node 24.20.0 JSON measurements after journal integration were:

| Records | Enumerate then mutate | Point mutation | Point lookup |
| --- | --- | --- | --- |
| 100 | 44.17 ms | 37.85 ms | 0.75 ms |
| 1,000 | 89.93 ms | 43.87 ms | 0.26 ms |
| 10,000 | 397.92 ms | 35.98 ms | 0.17 ms |

Eight synchronous scrypt derivations blocked for 194.62 ms. Eight asynchronous
logins yielded to the event loop after 0.35 ms and completed in 68.70 ms in this
run. All inputs were synthetic. Fixture generation is excluded from the timed
record operations; point mutations include journal and filesystem persistence.

The staged filesystem media benchmark generated 64 KiB chunks and verified the
complete downloaded byte count. On Node 24.20.0, 1 MiB took 165.66 ms to upload
and 29.30 ms to download; 64 MiB took 1193.19 ms and 659.05 ms. Sampled process
RSS grew by 3.84 MiB and 47.09 MiB respectively. RSS includes runtime allocation
and garbage-collection effects, so it is neither the stream buffer size nor a
bound. The repository gate was running concurrently, so these are observations
under local load without a historical buffered-transfer comparison. Source checks
and transfer tests establish streaming and complete verification before response
headers; cross-host S3 throughput remains unmeasured here.
