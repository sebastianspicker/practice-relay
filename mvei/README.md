# MvEI and MvEI Workbench

MvEI (Movement Encoding Initiative) is the movement-schema and validation work in this repository. MvEI Workbench is its separate browser authoring surface. Practice Relay can carry MvEI references in a WorkRecord handoff, but it is not the Workbench application.

Status: local `0.4.0-alpha.1` source candidate. Git and remote publication state
are unavailable.

## Current implementation

| Layer | Path | Current capability |
|---|---|---|
| Schemas and corpus | `../packages/movement-encode` | Motif, pedagogical laban-subset, movement annotation, co-timeline annex, and fixtures |
| Validator | `packages/validator` | CLI and library validation for current profiles |
| Schema site | `apps/schema-site` | Created reference page for profiles, corpus, and scope boundaries |
| MvEI Workbench | `apps/workbench` | Local Motif palette editing, Motif and laban-subset views, and browser session save/load |
| Engraver | `packages/engraver`, `packages/glyph-font` | Pedagogical SVG rendering path |
| LabanWriter import | `packages/labanwriter-import` | Lossy intermediate-to-subset conversion, not full parity |
| Reference reader | `packages/reference-reader` | Read-only summary surface used as another implementation check |

MvEI does not implement full professional Labanotation density. It is not LabanLite, MARC 358, or a claim of first browser-based Laban editing.

![MvEI schema reference site](../docs/images/0.4.0-alpha.1/mvei-schema-site.png)

![MvEI Workbench Motif editor](../docs/images/0.4.0-alpha.1/mvei-workbench.png)

## Run locally

```bash
pnpm install --frozen-lockfile
pnpm validate:schemas
pnpm --filter @practice-relay/mvei-schema-site dev
pnpm --filter @practice-relay/mvei-workbench dev
```

Open `http://127.0.0.1:5174/` for the schema site and `http://127.0.0.1:5175/` for MvEI Workbench.

Validate one fixture directly:

```bash
node --import tsx mvei/packages/validator/src/cli.ts \
  packages/movement-encode/fixtures/corpus/motif-sketch-01.json
```

## Validation

```bash
pnpm validate:schemas
pnpm validate:evidence
pnpm test
```

## Documentation

- [`IMPLEMENTATION.md`](IMPLEMENTATION.md): current MvEI and Workbench implementation map
- [`docs/encoding-spec.md`](docs/encoding-spec.md): profile notes
- [`docs/co-timeline-annex.md`](docs/co-timeline-annex.md): optional music anchors
- [`docs/labanwriter-migration.md`](docs/labanwriter-migration.md): lossy import boundary
- [`docs/capture-preference.md`](docs/capture-preference.md): capture-tool boundary
- [`../docs/EVIDENCE.md`](../docs/EVIDENCE.md): implementation evidence and claim limits

## Current limitations

- Full `mvei-laban` is not implemented.
- The Workbench has no remote collaboration or server persistence in its default browser surface.
- The import and engraving paths are pedagogical subsets, not format parity claims.
- Workspace packages are private source packages and are not ready for npm publication.
