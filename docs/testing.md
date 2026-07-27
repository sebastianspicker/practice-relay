# Testing

The repository has 72 active test source files. `pnpm test` runs the complete
active suite, including repository tooling, maturity checks, capture conversion,
workspace packages, cross-package acceptance, restore behavior, and unit SLO
checks.

## Test locations

| Location | Files | Purpose |
|---|---:|---|
| `packages/*/tests/` | 12 | Public shared-package contracts and interoperability behavior |
| `practice-relay/apps/*/src/` and `practice-relay/packages/*/src/` | 23 | Practice Relay application and service behavior |
| `mvei/apps/*/src/` and `mvei/packages/*/src/` | 19 | MvEI tools, validator, and Workbench behavior |
| `tests/acceptance/` | 3 | Cross-package Practice Relay and MvEI acceptance gates |
| `scripts/*.test.*` | 15 | Repository tooling and generated-output boundaries |

Tests stay close to implementation-heavy applications and tools. Public shared
packages use a separate `tests/` directory. Tests that exercise several
workspaces belong in `tests/acceptance/`.

## Active suite

All 72 retained test sources are active and are included by `pnpm test`.
No retained test source is classified as obsolete, duplicated, incomplete,
generated, experimental, or no longer relevant.

Generated fixtures are not test source. Capture and OSC validation writes
recreatable output under `test-results/generated-fixtures/`, which is ignored.
Synthetic input fixtures under `fixtures/` remain versioned because tests and
demonstrations read them as source data.

## Commands

Run the complete suite:

```bash
pnpm test
```

Run focused groups:

```bash
pnpm test:repository-tools
pnpm test:maturity
pnpm test:capture-lab
pnpm --filter @practice-relay/acceptance-tests test
pnpm --filter @practice-relay/api test
pnpm --filter @practice-relay/mvei-workbench test
pnpm test:ops-restore
pnpm test:ops-slo
```

The broad local gate adds type checking, builds, quality checks, schemas,
documentation links, evidence validation, claim guards, and demonstrations:

```bash
pnpm release:check
```

## Test artifacts

The ignore file covers coverage output, test reports, browser artifacts,
temporary test databases, test caches, local test environments, and generated
fixtures under `test-results/`. It does not ignore test source directories or
tracked input fixtures.
