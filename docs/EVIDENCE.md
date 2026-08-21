# Implementation evidence

This page maps repository claims to executable code, tests, and current
limitations. It does not record market research, adoption, or pilot outcomes.

## Product boundaries

| Surface | Evidence | Boundary |
|---|---|---|
| Practice Relay | [`../practice-relay/IMPLEMENTATION.md`](../practice-relay/IMPLEMENTATION.md) | Main application for WorkRecord handoffs |
| WorkRecord Core | [`../packages/work-record-core`](../packages/work-record-core) | Shared domain and contracts, not a user-facing application |
| MvEI | [`../mvei/IMPLEMENTATION.md`](../mvei/IMPLEMENTATION.md) | Movement schemas, validator, corpus, and reference tools |
| MvEI Workbench | [`../mvei/apps/workbench`](../mvei/apps/workbench) | Separate local authoring application |

Practice Relay and MvEI Workbench remain separate applications. They share
contracts through the workspace packages. The naming rules are in
[`products/naming.md`](products/naming.md), and the separation decision is in
[`products/merge-decision.md`](products/merge-decision.md).

## Executable evidence

| Claim | Source and checks |
|---|---|
| WorkRecord lifecycle and policy checks | [`../packages/work-record-core/src`](../packages/work-record-core/src), package tests, and `pnpm --filter @practice-relay/work-record-core test` |
| WorkRecord package and RO-Crate 1.3 output | [`../packages/work-record-package`](../packages/work-record-package) and its direct package tests |
| API routing, storage, media, auth, and local LTI | [`../practice-relay/apps/api`](../practice-relay/apps/api) and the focused service/package contracts |
| Motif and pedagogical laban-subset validation | [`../packages/movement-encode`](../packages/movement-encode), MvEI package tests, and `pnpm validate:schemas` |
| MvEI Workbench local editing | [`../mvei/apps/workbench`](../mvei/apps/workbench) and the generated HTML snapshot |
| Product wording and separation rules | Maintained product documentation and `pnpm validate:evidence` |

## Limits on the evidence

- All repository fixtures are synthetic.
- The browser shell does not establish an authenticated API session.
- The LTI path is a local mock, not an IMS or 1EdTech certification.
- The Postgres store is an exported fail-closed stub.
- The MvEI laban-subset is not full professional Labanotation.
- The repository contains no verified external pilot, adoption, compatibility,
  performance, publication, or production deployment result.
- A passing local check does not prove a canonical Git state, external service
  behavior, or an operator-controlled deployment.

Run `pnpm validate:evidence` to check that this map and its implementation entry
points remain present and linked.
