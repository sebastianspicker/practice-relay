# External MvEI implementation

This guide describes how to consume the MvEI schemas and fixture corpus without
depending on Practice Relay application code.

## Available interfaces

| Interface | Location |
|---|---|
| JSON Schemas | `packages/movement-encode/schemas/` |
| Fixture corpus and index | `packages/movement-encode/fixtures/corpus/` |
| Static corpus browser | `packages/movement-encode/fixtures/corpus/site/` |
| TypeScript contracts and helpers | `@practice-relay/movement-encode` |
| Validator CLI | `@practice-relay/mvei-validator` |
| SVG engraver | `@practice-relay/mvei-engraver` |
| Read-only reference consumer | `@practice-relay/mvei-reference-reader` |
| External review template | `mvei/docs/rfcs/external-review-log.template.md` |

The packages are private workspace packages in this source version. The
repository does not provide a public registry release.

## Validate inside the repository

Install the workspace and run:

```bash
pnpm validate:schemas
pnpm publish:dry-run
pnpm corpus:site
pnpm --filter @practice-relay/mvei-reference-reader test
node mvei/packages/reference-reader/src/cli.mjs \
  packages/movement-encode/fixtures/corpus/motif-sketch-01.json
```

`pnpm publish:dry-run` checks package exports and included files without
publishing anything. `pnpm corpus:site` rebuilds the tracked static catalogue
from `packages/movement-encode/fixtures/corpus/index.json`.

## Consume outside the repository

1. Obtain the schema files and the corpus index from a source archive.
2. Select the schema from each fixture's `profile`, `kind`, and
   `schemaVersion`.
3. Validate with a JSON Schema Draft 2020-12 implementation.
4. Accept `sketch` and `partial` documents as valid incomplete documents.
5. Preserve unknown optional fields when round-tripping documents.
6. Record conversion loss when mapping into another notation or media model.

The reference reader demonstrates the minimum consumer contract. It reads
Motif JSON and reports document identity, completeness, item count, symbols,
and co-timeline anchors. It does not edit or engrave documents.

## Compatibility feedback

Use
[`mvei/docs/rfcs/external-review-log.template.md`](../mvei/docs/rfcs/external-review-log.template.md)
for implementation feedback. A breaking shared-schema change follows
[`mvei/docs/dual-rfc.md`](../mvei/docs/dual-rfc.md). Signature submission
requirements are in
[`mvei/docs/rfcs/signatures/README.md`](../mvei/docs/rfcs/signatures/README.md).

Practice Relay and MvEI Workbench are separate applications. External MvEI
consumers should depend on the shared schemas and packages, not either
application's private modules.

## Current limitations

- No public package registry release is available.
- The Laban subset is pedagogical and does not implement full professional
  Labanotation density.
- LabanWriter import is incomplete and lossy.
- The repository has no evidence of independent external conformance.

Related references:

- [`publish-and-consume.md`](publish-and-consume.md)
- [`../mvei/docs/encoding-spec.md`](../mvei/docs/encoding-spec.md)
- [`../mvei/docs/laban-density-ladder.md`](../mvei/docs/laban-density-ladder.md)
- [`../mvei/docs/co-timeline-annex.md`](../mvei/docs/co-timeline-annex.md)
