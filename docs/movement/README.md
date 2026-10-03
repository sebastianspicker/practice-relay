# MvEI

Current source candidate: `0.4.0-alpha.1`.

MvEI is the repository's movement-schema and authoring surface. It shares
portable movement references with Practice Relay, but it is not a Practice Relay
feature, a production capture service, or a standards certification body.

| Surface | Responsibility | Documentation |
| --- | --- | --- |
| `packages/movement` | Browser-safe schemas, vocabulary, glyphs, corpus, transforms | [`packages/movement/README.md`](../../packages/movement/README.md) |
| `packages/movement-toolkit` | Validation, capture normalization, engraving, import, reference reading | [`packages/movement-toolkit/README.md`](../../packages/movement-toolkit/README.md) |
| `apps/movement-workbench` | Local Motif and Laban-subset authoring and session surface | [`apps/movement-workbench/README.md`](../../apps/movement-workbench/README.md) |
| `apps/movement-schema-site` | Local schema, profile, vocabulary, and corpus reference | [`apps/movement-schema-site/README.md`](../../apps/movement-schema-site/README.md) |

Read [Architecture](architecture.md) for the profile and package boundaries.

## Local applications

```bash
pnpm --filter @practice-relay/movement-schema-site dev
pnpm --filter @practice-relay/movement-workbench dev
```

The schema site defaults to `http://127.0.0.1:5174`; Workbench defaults to
`http://127.0.0.1:5175`. Neither claims hosted publication, capture-hardware
interoperability, or notation-system parity.

## Schema identities

The current canonical identifiers are:

- `urn:mvei:schema:motif:0.2`
- `urn:mvei:schema:laban-subset:0.2`
- `urn:mvei:schema:movement-annotation:0.1`
- `urn:mvei:schema:music-co-timeline-annex:0.1`

Earlier development-only hostname identifiers and the former Motif filename have
no compatibility aliases. Consumers use `mvei-motif.schema.json` and emit Motif
schema version `0.2.0`.

## Schema change review

There is no appointed external MvEI governance body in this candidate, so a
breaking schema change needs explicit maintainer approval and a single review
that updates the schema identifier or version, the TypeScript and browser
contracts, the generated vocabulary artifacts, the corpus index and fixtures,
the applications, the toolkit, the packed-consumer checks, and the migration
notes together. Unsupported fields and conversion losses stay visible.

External implementers should start with the schemas and
[`packages/movement/fixtures/corpus/index.json`](../../packages/movement/fixtures/corpus/index.json),
record validator and runtime versions plus fixture identifiers, and report pass,
fail, or partial results with any unsupported material. That is compatibility
feedback, not certification, adoption, or a consortium decision. See the
[external implementer guide](../external-implementer-kit.md).
