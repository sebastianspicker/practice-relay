# @practice-relay/movement — publish readiness

Preparation notes for publishing the MvEI encoding stack beyond this repository.
The package is the schema and types source of truth for Motif, laban-subset,
annotation v0, and the co-timeline annex. It is still private; nothing here
authorizes an npm publish.

## Package identity

| Field | Value |
|-------|--------|
| Name | `@practice-relay/movement` |
| Current version | `0.4.0-alpha.1` (workspace private; dry-run only; not npm-published) |
| License | Apache-2.0 |
| Module | ESM (`"type": "module"`) |

## Exports map

Keep the map explicit when un-privatizing, so external implementers cannot import
internal tests:

```json
{
  "exports": {
    ".": {
      "types": "./dist/src/index.d.ts",
      "import": "./dist/src/index.js"
    },
    "./browser": {
      "types": "./browser/index.d.mts",
      "import": "./browser/index.mjs"
    },
    "./schemas/*": "./schemas/*",
    "./fixtures/corpus/*": "./fixtures/corpus/*",
    "./vocabulary/*": "./vocabulary/*",
    "./glyphs": {
      "types": "./dist/glyphs/index.d.ts",
      "import": "./dist/glyphs/index.js"
    },
    "./package.json": "./package.json"
  }
}
```

`pnpm --filter @practice-relay/movement build` emits runnable root and glyph
JavaScript plus declarations to `dist/`. Before a first public publish, set
`"private": false` and choose the scoped package access.

Suggested `files`:

```json
{
  "files": [
    "dist",
    "browser",
    "schemas",
    "fixtures/corpus",
    "vocabulary",
    "PUBLISH.md"
  ]
}
```

## What external implementers consume

1. JSON Schemas under `schemas/` — validate with any Draft 2020-12 engine (Ajv in this monorepo).
2. Corpus index — `fixtures/corpus/index.json` lists every pedagogical fixture and profile; see [`fixtures/corpus/README.md`](fixtures/corpus/README.md).
3. Types and helpers from the package root: `createEmptyMotif`, `motifToLabanSubset`, `attachMusicCoTimeline`, `parseMovementDocument`, `MOTIF_TO_SUBSET_LOSSINESS`, and the measure-count helpers for co-timeline anchors.
4. Browser parser at `@practice-relay/movement/browser`, with no Node-only I/O.
5. Vocabulary — `vocabulary/motif-vocabulary.json`.
6. SVG glyph helpers from the compiled `@practice-relay/movement/glyphs` entrypoint.

## Versioning policy

- Schema `schemaVersion` constants (Motif `0.2.0`, laban-subset `0.2.0`, annex `0.1.0-annex`) are document versions, not the npm package version.
- Breaking schema changes go through the reviewed MvEI process in [`../../docs/movement/README.md`](../../docs/movement/README.md).
- Additive optional fields are non-breaking for consumers that ignore unknown keys, but this package uses `additionalProperties: false` on core objects, so additive fields must be listed in the schema and fixtures.

## Companion toolkit checklist

| Package | Role | Version field | Exports map |
|---------|------|---------------|-------------|
| `@practice-relay/movement-toolkit` | Capture, validation, engraving, import, and reference CLI tools | set | subpaths + bins |
| `apps/movement-workbench` | MvEI Workbench authoring UI (app) | set | app scripts only |
| `apps/movement-schema-site` | MvEI schema reference site | set | content module |

Before publishing any MvEI package:

- [ ] `exports` map present, with no accidental deep imports into tests
- [ ] `version` semver aligned with the change scope
- [ ] Toolkit depends on `@practice-relay/movement` through a workspace range, not a forked schema copy
- [ ] Tests green: `pnpm check:contracts` plus the package `test` script
- [ ] No unsupported superlatives in README or UI copy

## Non-claims

- Not "first digital collaborative score" and not "first browser Laban editor"; LabanLite and MARC 358 are not MvEI.
- The Laban subset is pedagogical density, not professional Labanotation parity.
- The LabanWriter path is open intermediate JSON, not binary `.lw` reverse engineering.
