# Source candidate status

Candidate identity: `0.4.0-alpha.1`

Validation date: 2026-08-09

Local checkout: branch `agent/github-polish-full-state-2026-08-09`, based on
`c4b446d623cdb00b1eb6a54a065ef0bc02b5200d`, with origin configured as
`https://github.com/sebastianspicker/practice-relay.git`. The branch captures
the complete nonignored product state from the source checkout. No remote,
package registry, release, deployment, or public endpoint state was queried or
changed.

## Current local result

| Command or check | Result |
| --- | --- |
| Manifest and CI command resolution | Passed; root has 32 scripts and all 15 CI-invoked scripts resolve |
| Schema-site focused suite | Passed, 14 tests |
| Recursive workspace tests | Passed across 24 of 25 workspace projects; the private root project is the coordinator |
| `pnpm test:repository-tools` | Passed, 53 tests |
| `pnpm validate:schemas` | Passed, 10 corpus fixtures plus the WorkRecord package fixture |
| `pnpm validate:docs` | Passed, 218 relative links across 94 Markdown files |
| `pnpm validate:evidence` | Passed, 7 required files and 4 entrypoint links |
| `pnpm test:lab-only-claims` | Passed, 34 bounded surface files scanned |
| `pnpm test:ops-restore` | Passed, unit drill only |
| `pnpm test:ops-slo` | Passed, network-disabled unit mode |
| Container entrypoint checks | Passed ShellCheck, Bash syntax, and 4 behavior tests |
| `pnpm verify:public-hygiene` | Passed candidate mode with the documented confidential-reporting warning |
| `pnpm typecheck` | Passed |
| `pnpm quality:check` | Passed; 237 maintainable files, no exact files or clone blocks |
| `pnpm release:check` | Passed, including alpha/beta gates, publication dry-run, OSC stage, and pilot dry-run |

No standalone formatter script is defined. The repository quality command includes source and documentation checks.

## Open remediation and publication blockers

- Confidential security reporting is not configured, tested, or assigned to accepted primary and backup responders.
- Maintainer roles in [`docs/maintainers.md`](docs/maintainers.md) remain unassigned.
- The local branch has not been pushed, and no hosted CI result exists for its commits.
- Docker/MinIO, reverse proxy behavior, external LMS registration, campus identity, browser accessibility, live SLO, signing, and publication lanes were not run.

These blockers prevent a verified public release. They do not invalidate the passing local checks listed above.

## Implemented scope

- Practice Relay provides WorkRecord contracts, an API, local storage and media adapters, package export, a browser presentation shell, and local LTI test paths.
- WorkRecord Core is the shared domain layer, not a user-facing application.
- MvEI provides Motif and pedagogical laban-subset schemas, validation, corpus, import, engraving, and reference tools.
- MvEI Workbench is a separate local browser application.

The limitations and non-claims are in [`docs/ALPHA.md`](docs/ALPHA.md) and [`docs/EVIDENCE.md`](docs/EVIDENCE.md). Review [`docs/RELEASE-CHECKLIST.md`](docs/RELEASE-CHECKLIST.md) and [`RELEASING.md`](RELEASING.md) before any publication action.
