# Testing

The repository has a compact set of direct business and protocol contracts.
`pnpm test` runs every retained test.

## Test locations

| Location | Files | Purpose |
|---|---:|---|
| `packages/*/tests/` | 4 | WorkRecord, packaging, consent, and interoperability contracts |
| `practice-relay/apps/*/src/` and `practice-relay/packages/*/src/` | 7 | API security, LTI, authentication, persistence, and media safety |

Tests stay close to the public domain and service boundaries they protect.

## Active suite

Every retained test covers a security, protocol, persistence, data-consent, or
interoperability regression that would be costly to detect manually.

Tests create any required input in temporary directories. Product demo and
interoperability data under `fixtures/` remains versioned and is not test data.

## Commands

Run the complete suite:

```bash
pnpm test
```

Run a focused boundary:

```bash
pnpm --filter @practice-relay/api test
pnpm --filter @practice-relay/record-store test
```

The broad local gate adds type checking, builds, quality checks, schemas,
documentation links, and evidence validation:

```bash
pnpm release:check
```

Tests use temporary directories and do not write repository-local reports,
browser artifacts, or generated fixture trees.
