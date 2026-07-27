# MvEI public corpus layout

Pedagogical fixtures for multi-implementation validation. External tools should:

1. Read `index.json` for the authoritative listing (id, profile, completeness, path).
2. Validate each fixture against the schema named in the entry (`schema` relative to package root).
3. Treat incomplete documents (`sketch` / `partial`) as valid - incompleteness is intentional.

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
  site/                      # static HTML browser (generate-corpus-site.mjs)
  annotation-v0-demo.json    # movement_annotation (not symbolic MvEI)
```

## Hosting

When serving the corpus publicly (schema-site / static host):

- Prefer publishing the whole `fixtures/corpus/` directory next to `schemas/`.
- Link the catalogue as `/corpus/index.json` (or monorepo path `packages/movement-encode/fixtures/corpus/index.json`).
- Schema-site surfaces sample ids and links this index (see `mvei/apps/schema-site`).

## Profiles

| profile | Meaning |
|---------|---------|
| `mvei-motif` | Pedagogical Motif literacy |
| `mvei-laban-subset` | Pedagogical Labanotation subset (not full density) |
| `movement_annotation` | Practice Relay v0 events - not symbolic Labanotation |

## Integrity gate

`pnpm validate:schemas` (repo root) validates every schema-backed fixture listed in `scripts/validate-schemas.ts` and enforces corpus count ≥ 3. Keep `index.json` in sync when adding files.
