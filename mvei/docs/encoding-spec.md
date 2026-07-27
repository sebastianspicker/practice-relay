# Current MvEI profile requirements

This document summarizes the schema behavior shipped in the `0.4.0-alpha.1` source candidate. The JSON Schemas under `packages/movement-encode/schemas/` are authoritative.

1. Documents declare `schemaVersion` and `profile`.
2. Motif documents with `sketch` or `partial` completeness remain valid when required profile fields are present.
3. Symbolic documents use schemas from `@practice-relay/movement-encode`; applications must not fork those schemas.
4. `movement_annotation` is a non-symbolic peer and must not be presented as Labanotation.
5. `mvei-laban-subset` is pedagogical and does not claim full professional density.
6. Optional music anchors may use the co-timeline annex.

Current schema files:

- `mvei-motif-stub.schema.json`: Motif profile; the historical filename remains part of the current path
- `mvei-laban-subset.schema.json`: pedagogical Labanotation subset
- `movement-annotation-v0.schema.json`: non-symbolic movement annotation
- `music-co-timeline-annex.schema.json`: optional music anchors

Run `pnpm validate:schemas` to validate the schemas and corpus.
