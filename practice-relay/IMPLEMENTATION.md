# Practice Relay implementation

Product: Practice Relay
Application path: `practice-relay/`
Shared core: `packages/work-record-core` and related `@practice-relay/*` packages

Practice Relay is a bounded, portable, policy-aware WorkRecord handoff builder. It prepares a selected version, evidence, roles, use conditions, and export provenance for a handoff from creation to assessment to repository deposit. It does not replace the specialist systems that own authoring, course administration, assets, or publication.

[`../PRODUCT.md`](../PRODUCT.md) and
[`../docs/EVIDENCE.md`](../docs/EVIDENCE.md) define the current product
boundary and the limits of repository evidence.

## Local implementation

| Surface | Path | Current scope |
|---|---|---|
| Domain contracts | `packages/work-record-core` | WorkRecord, roles, takes, policy, and MvEI references |
| Portable package | `packages/work-record-package` | Manifest, RO-Crate profile, and ZIP export |
| API | `practice-relay/apps/api` | Local lifecycle and export gates; loopback by default |
| Browser shell | `practice-relay/apps/web` | Inspectable shell with a labelled synthetic fallback without an authenticated session |
| LTI fixtures | `practice-relay/apps/lti*` | Local-mock only |
| MvEI integration | `packages/movement-encode` and `mvei/` | Contract and package boundary with separate applications |

## Boundaries

- Do not present Practice Relay as taking ownership of course administration, asset management, editing, or composition.
- Do not merge Practice Relay with MvEI Workbench. They share contracts only.
- Do not add an LMS, ePortfolio, DAM, video editor, or generic authoring suite
  to this scope.
- Do not claim deployment, adoption, certification, or compatibility that the repository does not verify.

## Documentation

| Document | Purpose |
|---|---|
| [docs/scope.md](docs/scope.md) | Product boundaries |
| [docs/architecture.md](docs/architecture.md) | Applications and packages |
| [docs/data-model.md](docs/data-model.md) | WorkRecord model |
| [docs/api.md](docs/api.md) | HTTP API |
| [Programme EVIDENCE.md](../docs/EVIDENCE.md) | Cross-product implementation evidence and claim limits |
| [docs/acceptance-criteria.md](docs/acceptance-criteria.md) | Testable acceptance conditions |
| [docs/ops.md](docs/ops.md) | Local persistence and operational notes |
| [docs/glossary.md](docs/glossary.md) | Terms |

## Local checks

```bash
pnpm --filter @practice-relay/api test
pnpm --filter @practice-relay/work-record-core test
pnpm validate:schemas
```

For public-alpha scope and constraints, see [`docs/ALPHA.md`](../docs/ALPHA.md). For repository-wide commands, use the root [`README.md`](../README.md).
