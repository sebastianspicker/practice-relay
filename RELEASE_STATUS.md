# Source candidate status

Candidate identity: `0.4.0-alpha.1`

Validation date: 2026-08-20

Local checkout: branch `main` at `c4b446d623cdb00b1eb6a54a065ef0bc02b5200d`, with origin configured as `https://github.com/sebastianspicker/practice-relay.git`. The worktree is intentionally dirty for the remediation recorded in [`AUDIT_LEDGER.md`](AUDIT_LEDGER.md). No remote, package registry, release, deployment, or public endpoint state was queried or changed.

## Current local result

| Command or check | Result |
| --- | --- |
| Manifest and CI command resolution | Passed; CI invokes the root release gate |
| Recursive workspace tests | Passed across 23 of 24 workspace projects; the private root project is the coordinator |
| `pnpm validate:schemas` | Passed, 10 corpus fixtures plus the WorkRecord package fixture |
| `pnpm validate:docs` | Passed for maintained Markdown links |
| `pnpm validate:evidence` | Passed, 7 required files and 4 entrypoint links |
| `pnpm verify:public-hygiene` | Passed candidate mode with the documented confidential-reporting warning |
| `pnpm typecheck` | Passed |
| `pnpm build` | Passed across every buildable workspace package |
| `pnpm quality:check` | Passed; maintained files remain within the repository limits |
| `pnpm release:check` | Passed locally across source, package, documentation, evidence, contract, and public-hygiene checks |

No standalone formatter script is defined. The repository quality command includes source and documentation checks.

## Open remediation and publication blockers

- Confidential security reporting is not configured, tested, or assigned to accepted primary and backup responders.
- Maintainer roles in [`docs/maintainers.md`](docs/maintainers.md) remain unassigned.
- The dirty tree has not been committed, and no CI result exists for these local changes.
- Docker/MinIO, reverse proxy behavior, external LMS registration, campus identity, browser accessibility, live SLO, signing, and publication lanes were not run.

These blockers prevent a verified public release. They do not invalidate the passing local checks listed above.

## Implemented scope

- Practice Relay provides WorkRecord contracts, an API, local storage and media adapters, package export, a browser presentation shell, and local LTI test paths.
- WorkRecord Core is the shared domain layer, not a user-facing application.
- MvEI provides Motif and pedagogical laban-subset schemas, validation, corpus, import, engraving, and reference tools.
- MvEI Workbench is a separate local browser application.

The limitations and non-claims are in [`docs/ALPHA.md`](docs/ALPHA.md) and [`docs/EVIDENCE.md`](docs/EVIDENCE.md). Review [`docs/RELEASE-CHECKLIST.md`](docs/RELEASE-CHECKLIST.md) and [`RELEASING.md`](RELEASING.md) before any publication action.
