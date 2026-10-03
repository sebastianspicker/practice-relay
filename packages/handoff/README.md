# @practice-relay/handoff

This private workspace package turns validated WorkRecords into portable handoffs
and external-format projections. It is downstream of
`@practice-relay/work-record` and never owns canonical record state.

## Exports

| Import | Contents |
| --- | --- |
| `@practice-relay/handoff` | Stable facade for package, RO-Crate, ZIP, import, and projection operations |
| `@practice-relay/handoff/package` | Integrity manifest and package construction |
| `@practice-relay/handoff/projections` | OTIO, EAF, OSC, and MusicXML-reference projections and imports |
| `@practice-relay/handoff/ro-crate` | RO-Crate 1.3 read and write helpers |
| `@practice-relay/handoff/zip` | ZIP archive helpers |

## Contract

- Package and projection entrypoints parse the canonical WorkRecord and apply the
  required fail-closed release decision.
- Manifests and archives preserve identity, integrity hashes, and provenance.
- Projections are intentionally lossy. Every result returns stable `losses`
  entries with an explanation and `omittedFields`.
- Import paths report unsupported or missing source material as warnings.
- Callers keep loss and warning reports and never present a projection as an
  equivalent WorkRecord.

The canonical package manifest schema is
[`schemas/work-record-package.schema.json`](schemas/work-record-package.schema.json).

## Verify

```bash
pnpm --filter @practice-relay/handoff typecheck
pnpm --filter @practice-relay/handoff test
pnpm check:contracts
```

See [Practice Relay API and contracts](../../docs/relay/api-and-contracts.md).
