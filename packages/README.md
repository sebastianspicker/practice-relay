# Shared contracts and WorkRecord Core

This directory contains the shared domain and schema packages used by Practice Relay and the MvEI surfaces. WorkRecord Core is a technical boundary, not a user-facing application.

Status: local `0.4.0-alpha.1` candidate. Workspace packages are private and currently export TypeScript source. They are not prepared for npm publication.

| Package | Role |
|---|---|
| `@practice-relay/work-record-core` | Neutral WorkRecord types, profiles, represented-subject policy, and snapshots |
| `@practice-relay/work-record-package` | Manifest validation and RO-Crate 1.3 handoff packages |
| `@practice-relay/time-core` | Shared clocks, markers, and regions |
| `@practice-relay/media-index` | Media and take identity contracts |
| `@practice-relay/use-policy` | Purpose and export-filter contracts |
| `@practice-relay/movement-encode` | MvEI schemas, vocabulary, fixtures, and helpers |
| `@practice-relay/interop` | OTIO, EAF, and OSC conversion surfaces with loss reporting |

## Contract rules

1. MvEI schemas live only in `movement-encode`; applications must not fork them.
2. `movement_annotation` is not Labanotation.
3. Practice Relay and MvEI Workbench share contracts but remain separate products.
4. Breaking schema changes use the documented dual-RFC process.
5. Conversion loss must remain explicit at interop boundaries.
6. WorkRecord package behavior profiles existing RO-Crate practice and does not claim a new packaging standard.

## Validation

From the repository root:

```bash
pnpm typecheck
pnpm build
pnpm validate:schemas
pnpm --filter @practice-relay/work-record-core test
pnpm --filter @practice-relay/work-record-package test
pnpm --filter @practice-relay/interop test
```

Package-specific details live in each package directory. Publication prerequisites are documented in [`movement-encode/PUBLISH.md`](movement-encode/PUBLISH.md).
Shared contract guidance is in [`../docs/packages`](../docs/packages), and test
placement and commands are documented in [`../docs/testing.md`](../docs/testing.md).
