# @practice-relay/movement-encode - publish readiness

Public multi-implementation prep for the MvEI encoding stack. This package is the schema + types source of truth (Motif, laban-subset, annotation v0, co-timeline annex).

## Package identity

| Field | Value |
|-------|--------|
| Name | `@practice-relay/movement-encode` |
| Current version | `0.4.0-alpha.1` (workspace private; dry-run only; not npm-published) |
| License | Apache-2.0 |
| Module | ESM (`"type": "module"`) |

## Exports map (intended public surface)

When un-privatizing for npm, keep the map explicit so external implementers do not import internal tests:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./schemas/*": "./schemas/*",
    "./fixtures/corpus/*": "./fixtures/corpus/*",
    "./vocab/*": "./vocab/*",
    "./package.json": "./package.json"
  }
}
```

In-repo (workspace) map currently points TypeScript sources at `./src/index.ts` so monorepo consumers skip a build step. Before first public publish:

1. Add a `build` that emits `dist/` (`tsc`).
2. Flip `main` / `types` / `exports["."]` to `dist/`.
3. Set `"private": false` and choose a publish access (`public` scoped package).
4. Ship schemas and corpus fixtures as package files (`files` field).

Suggested `files`:

```json
{
  "files": [
    "dist",
    "schemas",
    "fixtures/corpus",
    "vocab",
    "PUBLISH.md",
    "README.md"
  ]
}
```

## What external implementers consume

1. JSON Schemas under `schemas/` - validate with any Draft 2020-12 engine (Ajv in this monorepo).
2. Corpus index - `fixtures/corpus/index.json` lists every pedagogical fixture + profile (see `fixtures/corpus/README.md`).
3. Types / helpers from the package root: `createEmptyMotif`, `motifToLabanSubset`, `attachMusicCoTimeline`, `MOTIF_TO_SUBSET_LOSSINESS`, measure-count helpers for co-timeline anchors.
4. Vocabulary - `vocab/motif-vocabulary.json`.

## Versioning policy

- Schema `schemaVersion` constants (e.g. Motif `0.2.0`, laban-subset `0.2.0`, annex `0.1.0-annex`) are document versions, not the npm package version.
- Breaking schema changes require the dual-RFC process (`mvei/docs/dual-rfc.md`).
- Additive optional fields are non-breaking for consumers that ignore unknown keys; this package’s schemas use `additionalProperties: false` on core objects - additive fields must be listed in the schema + fixtures.

## Sibling MvEI packages (publish readiness checklist)

| Package | Role | Version field | Exports map |
|---------|------|---------------|-------------|
| `@practice-relay/mvei-validator` | CLI validate Motif / laban-subset | set | `"."` + bin |
| `@practice-relay/mvei-engraver` | Second SVG implementation | set | `"."` + bin |
| `@practice-relay/mvei-glyph-font` | Motif SVG glyphs | set | `"."` |
| `@practice-relay/mvei-labanwriter-import` | Intermediate JSON → subset | set | `"."` + bin |
| `@practice-relay/mvei-workbench` | MvEI Workbench authoring UI (app) | set | app scripts only |
| `@practice-relay/mvei-schema-site` | Public MEI-pattern face | set | content module |

Before publishing any MvEI package:

- [ ] `exports` map present (no accidental deep imports into tests)
- [ ] `version` semver aligned with change scope
- [ ] Depends on `@practice-relay/movement-encode` via workspace/range, not a forked schema copy
- [ ] Tests green: `pnpm validate:schemas` + package `test`
- [ ] No forbidden firstness strings in README/UI

## Honesty (non-claims)

- Not “first digital collaborative score”, not “first browser Laban editor”, not LabanLite/MARC 358 = MvEI.
- Laban subset is pedagogical density, not professional Labanotation parity.
- LabanWriter path is open intermediate JSON, not binary `.lw` reverse engineering.
