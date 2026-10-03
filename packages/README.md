# Shared packages

These are the reusable domain, handoff, movement, protocol, and storage packages
used by Practice Relay and MvEI. Every package is private in the
`0.4.0-alpha.1` source candidate.

| Package | Responsibility | Documentation |
| --- | --- | --- |
| `@practice-relay/work-record` | WorkRecord domain, parser, time, policy, media-reference, and store contracts | [`work-record/README.md`](work-record/README.md) |
| `@practice-relay/handoff` | Package integrity, RO-Crate, ZIP, imports, and declared-loss projections | [`handoff/README.md`](handoff/README.md) |
| `@practice-relay/movement` | MvEI schemas, vocabulary, glyphs, corpus, browser parser, transforms | [`movement/README.md`](movement/README.md) |
| `@practice-relay/movement-toolkit` | MvEI validation, capture, import, reading, and engraving tools | [`movement-toolkit/README.md`](movement-toolkit/README.md) |
| `@practice-relay/auth` | Local HMAC bearer authentication and configured-user validation | [Relay operations](../docs/relay/operations.md) |
| `@practice-relay/record-store` | Memory, JSON, and PostgreSQL WorkRecord persistence | [Relay operations](../docs/relay/operations.md) |
| `@practice-relay/database` | Shared PostgreSQL pools, transactions, explicit migrations | [Multi-process operations](../docs/relay/multi-process.md) |
| `@practice-relay/runtime-state` | Shared login admission and single-use LTI state | [Multi-process operations](../docs/relay/multi-process.md) |
| `@practice-relay/media-store` | Streaming filesystem and S3 media with durable quota and recovery | [Relay operations](../docs/relay/operations.md) |
| `@practice-relay/lti` | Local LTI/OIDC/JWT/AGS helpers | [Relay API contracts](../docs/relay/api-and-contracts.md) |

## Contract rules

- Packages never import applications; use stable `@practice-relay/*` exports.
- WorkRecord and movement remain independent domains.
- Movement schemas, vocabulary, glyph contracts, and corpus live only in `movement`.
- Handoff projections and movement transformations report unsupported or omitted
  material rather than claiming lossless equivalence.
- A tenant namespace is not actor authorization. Memory and JSON are
  single-process adapters; multiple processes require PostgreSQL records and
  shared runtime/media coordination.
- Packed-consumer checks for `movement` and `movement-toolkit` verify local
  artifacts; they do not authorize npm publication.

## Validation

From the repository root:

```bash
pnpm check:types
pnpm check:build
pnpm check:packages
pnpm check:contracts
pnpm check:boundaries
```

A single suite, for example, is
`pnpm --filter @practice-relay/work-record test`. See [Testing](../docs/testing.md)
for every workspace command and [Architecture](../docs/ARCHITECTURE.md) for
dependency rules.
