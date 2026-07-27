# Contributing

Contributions may address Practice Relay, MvEI, MvEI Workbench, or the shared WorkRecord Core contracts. Keep the product boundaries explicit in code, tests, and documentation.

## Setup

Requirements are Node.js 20 or later and pnpm 9.15.0.
Use a Node.js distribution with Corepack support. If `corepack enable` cannot
write its shims, switch to a Node installation where it can do so.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify:core
```

## Repository boundaries

| Path | Ownership |
|---|---|
| `practice-relay/` | Practice Relay application and service packages |
| `mvei/` | MvEI validator and reference tools plus the separate MvEI Workbench application |
| `packages/` | WorkRecord Core and shared contracts |
| `docs/` | Maintained technical guides, product boundaries, and release checks |

Do not merge Practice Relay and MvEI Workbench into one application. Movement schemas belong only in `packages/movement-encode`. See [`docs/products/merge-decision.md`](docs/products/merge-decision.md) and [`docs/EVIDENCE.md`](docs/EVIDENCE.md).

## Change requirements

- Review this guide and the relevant implementation map before editing.
- Preserve unrelated worktree changes.
- Keep public APIs stable unless correctness requires a reviewed change.
- Add a short file-level comment to source files and a one-line JSDoc comment to exports.
- Add tests for observable behavior and boundary conditions.
- Follow the test locations and focused commands in [`docs/testing.md`](docs/testing.md).
- Do not add production dependencies without prior approval.
- Do not add unsupported product, adoption, compatibility, pilot, certification, or performance claims.
- Do not include credentials, environment files, local data, real participant media, logs, or local tool state.

For changes to work-record package export, validate against `packages/work-record-package/schemas/work-record-package.schema.json`. For changes to MvEI, validate the shared corpus and do not create application-local schema forks.

## Validation

Run the narrowest relevant test first, followed by the broadest practical repository gate.

```bash
pnpm typecheck
pnpm build
pnpm lint
pnpm test
pnpm validate:schemas
pnpm validate:docs
pnpm validate:evidence
pnpm test:kill-switches
pnpm test:lab-only-claims
pnpm verify:public-hygiene
```

For user-interface changes, also run:

```bash
pnpm demo:render-html
pnpm demo:screenshots
```

Inspect each PNG for clipping, incorrect state, private data, and claims that are not supported by the current code. The screenshot command also exercises primary controls and checks mobile horizontal overflow.

Document failed, skipped, unavailable, and environment-blocked checks separately. Do not suppress a check solely to obtain a passing result.

`pnpm maturity:check` and `pnpm release:check` refresh the staged OSC and capture
fixture outputs. Review `test-results/generated-fixtures/osc/` and
`test-results/generated-fixtures/capture-lab/` after running either command.

## Documentation and release changes

Update maintained documentation when behavior, commands, configuration, or limitations change. Current entry points are [`README.md`](README.md), [`docs/ALPHA.md`](docs/ALPHA.md), [`practice-relay/IMPLEMENTATION.md`](practice-relay/IMPLEMENTATION.md), and [`mvei/IMPLEMENTATION.md`](mvei/IMPLEMENTATION.md).

Release preparation follows [`docs/RELEASE-CHECKLIST.md`](docs/RELEASE-CHECKLIST.md) and [`RELEASING.md`](RELEASING.md). A passing local gate does not authorize a commit, tag, push, package publication, or GitHub release.

## Conduct and security

Follow [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Do not place vulnerability details in a public issue. The confidential route is still unconfigured and is tracked as a publication blocker in [`SECURITY.md`](SECURITY.md).

The repository is licensed under Apache License 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
