# @practice-relay/movement

This package is the browser-safe source of truth for MvEI schemas, vocabulary,
glyph contracts, corpus fixtures, parsing, and movement transforms. It is private
in the `0.4.0-alpha.1` candidate; packed-consumer checks do not authorize npm
publication.

## Exports

| Import | Contents |
| --- | --- |
| `@practice-relay/movement` | Compiled parser, corpus metadata, vocabulary identifiers, and transforms |
| `@practice-relay/movement/browser` | Compatibility facade for all browser exports |
| `@practice-relay/movement/browser/parser` | Canonical document parser without corpus fixtures |
| `@practice-relay/movement/browser/vocabulary` | Controlled symbol identifiers without schemas or corpus |
| `@practice-relay/movement/browser/examples` | Packaged corpus and profile metadata |
| `@practice-relay/movement/browser/transforms` | Shared Motif-to-Laban projection and loss warnings |
| `@practice-relay/movement/schemas/*` | Canonical Draft 2020-12 JSON Schemas |
| `@practice-relay/movement/fixtures/corpus/*` | Pedagogical corpus fixtures and index |
| `@practice-relay/movement/glyphs` | Compiled SVG glyph helpers |
| `@practice-relay/movement/vocabulary/*` | Motif vocabulary artifacts |

Use [`fixtures/corpus/index.json`](fixtures/corpus/index.json) as the corpus
catalogue. A consumer selects the schema named by each entry and treats `sketch`
and `partial` documents as intentionally incomplete but valid.

## Generated contract

The Motif vocabulary JSON, JavaScript, and declarations are generated from a
single canonical contract, so do not edit them independently. The package build,
type-check, and `verify:generated` scripts run the generator in check mode.

## Verify

```bash
pnpm --filter @practice-relay/movement typecheck
pnpm --filter @practice-relay/movement verify:generated
pnpm --filter @practice-relay/movement run build
pnpm check:packages
pnpm check:contracts
```

Current schema identities and breaking-change requirements are in the
[MvEI documentation](../../docs/movement/README.md). Publication prerequisites
remain in [PUBLISH.md](PUBLISH.md).
