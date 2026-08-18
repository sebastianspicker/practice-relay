# Documentation map

Current candidate: `0.4.0-alpha.1`, not tagged or published.

| Topic | Document |
| --- | --- |
| Public alpha behavior and limitations | [`ALPHA.md`](ALPHA.md) |
| Measured local status and blockers | [`../RELEASE_STATUS.md`](../RELEASE_STATUS.md) |
| Release checklist | [`RELEASE-CHECKLIST.md`](RELEASE-CHECKLIST.md) |
| Implementation evidence and product boundaries | [`EVIDENCE.md`](EVIDENCE.md) |
| Practice Relay implementation map | [`../practice-relay/IMPLEMENTATION.md`](../practice-relay/IMPLEMENTATION.md) |
| MvEI implementation map | [`../mvei/IMPLEMENTATION.md`](../mvei/IMPLEMENTATION.md) |
| Product naming and separation | [`products/naming.md`](products/naming.md), [`products/merge-decision.md`](products/merge-decision.md) |
| Package contracts and patterns | [`packages/contracts.md`](packages/contracts.md), [`packages/patterns.md`](packages/patterns.md) |
| Practice Relay operations | [`../practice-relay/docs/ops.md`](../practice-relay/docs/ops.md), [`../practice-relay/docs/slo.md`](../practice-relay/docs/slo.md) |
| Current runtime images | [`images/0.4.0-alpha.1/`](images/0.4.0-alpha.1/) |
| Pilot and observation templates | [`pilot-pack/README.md`](pilot-pack/README.md) |
| Package publication boundaries | [`publish-and-consume.md`](publish-and-consume.md) |

## Technical entry points

| Layer | Path |
| --- | --- |
| Practice Relay | `practice-relay/` |
| MvEI and MvEI Workbench | `mvei/` |
| WorkRecord Core and shared contracts | `packages/` |
| Synthetic fixtures | `fixtures/` |
| Validation and release tooling | `scripts/` and root `package.json` |

Run `pnpm validate:docs` to validate relative links across the Markdown corpus.
