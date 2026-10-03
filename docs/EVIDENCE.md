# Evidence and limits

| Surface | Where the evidence lives |
| --- | --- |
| Practice Relay | `apps/relay-api`, `apps/relay-web`, `apps/lti-simulator`, focused and acceptance tests, root verification |
| WorkRecord contracts | `packages/work-record` domain, parser, policy, time, media-reference, and persistence-port tests |
| Handoff | `packages/handoff` manifest, integrity, RO-Crate, ZIP, import, and declared-loss projection tests |
| MvEI | `packages/movement`, `packages/movement-toolkit`, movement applications, schemas, and corpus checks |
| MvEI Workbench | local authoring, validation, session, synchronization, and accessibility-oriented source tests |

The repository provides source evidence and deterministic local gates. It does
not establish a deployed service, production identity or database, real LMS
integration, IMS certification, hardware capture, external adoption, or
production support. RO-Crate output and interoperability projections are
implemented, but a projection is never equivalent to the canonical WorkRecord.

Practice Relay and MvEI remain separate product surfaces. WorkRecord contracts
can carry a movement reference without a package dependency or an application
merge. See [Architecture](ARCHITECTURE.md), [Practice Relay](relay/README.md),
and [MvEI](movement/README.md).
