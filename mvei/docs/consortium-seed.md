# MvEI governance status

No external organization, consortium, standards body, or governance board is
appointed in this source snapshot. The repository contains multiple in-repo
implementations, but they do not establish independent adoption or governance.

## Current in-repo process

- schemas and corpus fixtures live under `packages/movement-encode`;
- `pnpm validate:schemas` checks the shipped corpus;
- breaking shared-contract changes use the
  [dual-review process](dual-rfc.md); and
- maintainer roles are listed as unassigned in
  [`docs/maintainers.md`](../../docs/maintainers.md).

The external-review template and signature format under `mvei/docs/rfcs/`
define repository procedures. They are not approvals, votes, partnerships, or
evidence of external implementation.

## Conditions before an external-governance claim

At minimum, a future claim would require:

1. named organizations that have explicitly accepted a public role;
2. approved public contacts and terms for those roles;
3. at least one implementation or conformance review outside this monorepo;
4. a recorded decision procedure and conflict policy; and
5. public evidence for the relevant schema or corpus decisions.

These conditions are not satisfied by the current alpha. Two independent
organizational participants remain the minimum planned threshold, not a current
fact.
