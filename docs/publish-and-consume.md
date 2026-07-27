# MvEI source consumption and publication boundary

The MvEI packages are private workspace packages that export TypeScript source. No npm release exists, and the current tarball shape is not ready for publication.

## Source consumption

The authoritative package is `packages/movement-encode`.

| Asset | Path |
|---|---|
| JSON Schemas | `packages/movement-encode/schemas/` |
| Motif vocabulary | `packages/movement-encode/vocab/motif-vocabulary.json` |
| Pedagogical corpus | `packages/movement-encode/fixtures/corpus/` |
| TypeScript helpers | `packages/movement-encode/src/index.ts` |
| Validator | `mvei/packages/validator` |

Local consumers should validate the schema version they accept, validate on load and write, keep sketch and partial Motif documents valid, and keep `movement_annotation` distinct from symbolic profiles.

Run the local validator through the workspace:

```bash
pnpm validate:schemas
node --import tsx mvei/packages/validator/src/cli.ts \
  packages/movement-encode/fixtures/corpus/motif-sketch-01.json
```

## Publication blockers

Before any registry publication, each intended package needs:

1. compiled JavaScript and declaration output under a publication directory;
2. exports and executable entries that reference compiled output;
3. package-local license and required notice files in the tarball;
4. a file allowlist that excludes tests and local residue;
5. version and dependency review across every intended package;
6. installation of the created tarball into a clean temporary consumer;
7. CLI and import smoke tests against that installed tarball;
8. explicit maintainer approval for publication.

The existing `pnpm publish:dry-run` command checks repository shape and local consumers. It does not prove registry readiness.

Breaking schema changes follow [`../mvei/docs/dual-rfc.md`](../mvei/docs/dual-rfc.md). External governance, independent adoption, registry availability, and standards ratification are not current claims.
