# MvEI and MvEI Workbench implementation

MvEI (Movement Encoding Initiative) is the movement-schema, validation, fixture, and reference-tool work in this repository. MvEI Workbench is its separate browser authoring application. Practice Relay may carry MvEI document references but is not the authoring interface.

[`docs/scope.md`](docs/scope.md), [`docs/encoding-spec.md`](docs/encoding-spec.md),
and [`../docs/EVIDENCE.md`](../docs/EVIDENCE.md) define the maintained MvEI
scope and evidence boundary.

## Current implementation

| Surface | Path | Current scope |
|---|---|---|
| Schemas and vocabulary | `packages/movement-encode` | Motif, pedagogical laban-subset, movement annotation, co-timeline annex, and controlled vocabulary |
| Corpus | `packages/movement-encode/fixtures/corpus` | Valid and invalid pedagogical fixtures used by schema and consumer tests |
| Validator | `mvei/packages/validator` | Library and CLI validation |
| Engraver and glyphs | `mvei/packages/engraver`, `mvei/packages/glyph-font` | Pedagogical SVG rendering |
| Reference reader | `mvei/packages/reference-reader` | Read-only Motif summary implementation |
| LabanWriter import | `mvei/packages/labanwriter-import` | Lossy intermediate-to-subset conversion; no binary `.lw` parser |
| Schema site | `mvei/apps/schema-site` | Created profile, corpus, and boundary reference |
| MvEI Workbench | `mvei/apps/workbench` | Local Motif editing, Motif and laban-subset views, and browser session save/load |

## Boundaries

- MvEI schemas live only in `packages/movement-encode`.
- `movement_annotation` is not Labanotation.
- Full `mvei-laban` and full professional Labanotation density are not implemented.
- The LabanWriter path is lossy and does not parse proprietary binary files.
- MvEI Workbench does not provide remote persistence in its default browser surface.
- In-repository consumers do not establish external governance or adoption.
- MvEI Workbench and Practice Relay remain separate applications.

## Documentation

| Document | Purpose |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Component and contract ownership |
| [`docs/encoding-spec.md`](docs/encoding-spec.md) | Current profile requirements |
| [`docs/data-model.md`](docs/data-model.md) | Document shapes |
| [`docs/laban-density-ladder.md`](docs/laban-density-ladder.md) | Pedagogical density boundary |
| [`docs/labanwriter-migration.md`](docs/labanwriter-migration.md) | Lossy import behavior |
| [`docs/co-timeline-annex.md`](docs/co-timeline-annex.md) | Optional music anchors |
| [`docs/dual-rfc.md`](docs/dual-rfc.md) | Breaking-change review process |
| [`../docs/EVIDENCE.md`](../docs/EVIDENCE.md) | Cross-product evidence map |

## Local checks

```bash
pnpm validate:schemas
pnpm --filter @practice-relay/mvei-validator test
pnpm --filter @practice-relay/mvei-workbench test
pnpm publish:dry-run
```

`publish:dry-run` checks repository package shape only. It does not establish that the private TypeScript-source packages are ready for a registry.
