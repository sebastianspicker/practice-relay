# MvEI corpus layout

Pedagogical fixtures for multi-implementation validation. External tools should:

1. Read `index.json` for the authoritative listing (id, profile, completeness, path).
2. Validate each fixture against the schema named in the entry (`schema` relative to the package root).
3. Treat `sketch` and `partial` documents as valid; their incompleteness is intentional.

## Layout

```
fixtures/corpus/
  index.json                 # machine-readable catalogue
  README.md                  # this file
  motif-sketch-01.json       # mvei-motif
  motif-partial-02.json      # mvei-motif
  laban-subset-01.json       # mvei-laban-subset
  laban-subset-02.json
  laban-subset-03-dense.json
  laban-subset-04.json       # multi-column simultaneity
  laban-subset-05.json       # gradual density ladder
  laban-subset-06.json       # denser simultaneous phrase
  workbench-demo.json        # default Motif editing example
  annotation-v0-demo.json    # movement_annotation (not symbolic MvEI)
```

## Hosting

When serving the corpus publicly (schema site or static host):

- Publish the whole `fixtures/corpus/` directory next to `schemas/`.
- Link the catalogue as `/corpus/index.json`, or use the monorepo path `packages/movement/fixtures/corpus/index.json`.
- The schema site surfaces sample ids and links this index; see `apps/movement-schema-site`.

## Profiles

| profile | Meaning |
|---------|---------|
| `mvei-motif` | Pedagogical Motif literacy |
| `mvei-laban-subset` | Pedagogical Labanotation subset, not full density |
| `movement_annotation` | Practice Relay v0 events, not symbolic Labanotation |

## Integrity gate

`pnpm check:contracts` at the repository root validates every schema-backed
fixture listed in `scripts/validate-schemas.ts` and enforces a corpus count of at
least 3. Keep `index.json` in sync when adding files.
