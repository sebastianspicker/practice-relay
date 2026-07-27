# Source candidate status

Candidate identity: `0.4.0-alpha.1`

Validation date: 2026-07-24

This checkout contains no `.git` directory. Branch, remote, tracked-file,
clean-tree, commit, and tag state cannot be verified here. No package registry,
GitHub release, external deployment, or public endpoint was inspected.

## Current local result

The following commands completed successfully with the installed
lockfile-backed workspace:

| Command | Result |
|---|---|
| `pnpm typecheck` | Passed |
| `pnpm build` | Passed across the workspace build targets |
| `pnpm lint` | Passed for 235 maintainable files |
| `pnpm test` | Passed for the complete active suite, including repository tools, workspace and acceptance tests, capture conversion, restore, and unit SLO checks |
| `pnpm test:repository-tools` | Passed, 49 tests |
| `pnpm validate:schemas` | Passed as part of `pnpm release:check` |
| `pnpm validate:docs` | Passed, 244 relative links across 85 Markdown files |
| `pnpm validate:evidence` | Passed, 7 required files and 4 entrypoint links |
| `pnpm test:kill-switches` | Passed, 419 active text files scanned |
| `pnpm test:lab-only-claims` | Passed, 33 bounded surface files scanned |
| `pnpm verify:public-hygiene` | Passed candidate mode with two documented warnings |
| `pnpm verify:public-hygiene:strict` | Failed because confidential reporting and Git metadata are unavailable |
| `pnpm maturity:check` | Passed, 28 of 28 rows at the configured target |
| `pnpm release:check` | Passed |
| `pnpm demo:render-html` | Passed for the three application source snapshots |
| `pnpm demo:screenshots` | Passed for five runtime PNGs |
| Source-only install simulation | `pnpm install --offline --frozen-lockfile --ignore-scripts`, `pnpm build`, `pnpm test`, and `pnpm demo:e2e` passed in a temporary copy without dependencies or generated output |

No standalone formatter script is defined in `package.json`. The repository
lint command includes source and documentation quality checks.

## Publication blockers

- Confidential security reporting is not configured.
- Git metadata is absent, so tracked-set and clean-tree checks cannot run.
- Maintainer roles in [`docs/maintainers.md`](docs/maintainers.md) remain
  unassigned.
- A Git clean-checkout test could not run because this source tree has no Git
  metadata. The source-only installation simulation passed without network
  downloads.
- Docker Compose, MinIO interoperability, reverse proxy behavior, external LMS
  registration, campus identity, and live SLO checks were not run.

These blockers prevent a verified public release. They do not invalidate the
local source checks listed above.

## Implemented scope

- Practice Relay provides WorkRecord contracts, an API, local storage and media
  adapters, package export, a browser presentation shell, and local LTI test
  paths.
- WorkRecord Core is the shared domain layer, not a user-facing application.
- MvEI provides Motif and pedagogical laban-subset schemas, validation, corpus,
  import, engraving, and reference tools.
- MvEI Workbench is a separate local browser application.

The limitations and non-claims are in [`docs/ALPHA.md`](docs/ALPHA.md) and
[`docs/EVIDENCE.md`](docs/EVIDENCE.md). Review
[`docs/RELEASE-CHECKLIST.md`](docs/RELEASE-CHECKLIST.md) and
[`RELEASING.md`](RELEASING.md) before any publication action.
