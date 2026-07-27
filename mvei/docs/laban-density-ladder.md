# Laban density ladder (MvEI / MvEI Workbench)

Pedagogical density levels for symbolic movement encoding. This is a literacy ladder, not professional Labanotation parity, LabanWriter visual parity, or a first-browser-Laban claim.

## Levels

| Level | Profile / artefact | Density intent | Corpus examples |
|-------|--------------------|----------------|-----------------|
| Sketch | `mvei-motif` completeness `sketch` | Sparse Motif symbols in sequence; optional time anchors | `motif-sketch-01` |
| Partial Motif | `mvei-motif` completeness `partial` | More symbols + anchors; still Motif literacy, not staff | `motif-partial-02`, demo `motif.json` |
| Laban subset (sparse) | `mvei-laban-subset` | Few columns (support / body); one symbol per cell often | `laban-subset-01` |
| Laban subset (gesture) | `mvei-laban-subset` | Arm/leg gesture + music anchor | `laban-subset-02` |
| Laban subset (dense multi-column) | `mvei-laban-subset` | Multi-column phrase | `laban-subset-03-dense` |
| Laban subset (simultaneity) | `mvei-laban-subset` | `simultaneousGroup` + `beatOffset` across columns | `laban-subset-04` |
| Laban subset (gradual density) | `mvei-laban-subset` | Progressive fill: support → bilateral → limbs → path/head | `laban-subset-05` |
| Laban subset (gradual density II) | `mvei-laban-subset` | Full 8 columns + denser simultaneous phrase (incl. `leg_left`) | `laban-subset-06` |
| LW intermediate | open intermediate (import only) | Transcription bridge → subset | `lw-intermediate-01`...`05` |
| Full Laban (later) | out of scope | Professional staff density, Effort graphs, floor plans | not claimed |

## Reading order (implementers)

1. Motif sketch/partial  -  validate with `mvei-motif` schema.
2. Map Motif → subset via `@practice-relay/movement-encode` `motifToLabanSubset` (lossy; see `MOTIF_TO_SUBSET_LOSSINESS`).
3. Climb subset fixtures 01 → 06 for column/simultaneity growth.
4. Optional: LW intermediate import (`@practice-relay/mvei-labanwriter-import`)  -  not binary `.lw`.

## Additive schema policy

New ladder fields are optional and additive (e.g. `beatOffset`, `simultaneousGroup`). Breaking required-field renames need dual-RFC (`mvei/docs/dual-rfc.md`).

## MvEI Workbench UI modes

| Mode | What it edits |
|------|---------------|
| Motif canvas | Sequence tiles; palette; co-timeline anchors as `timeAnchor` |
| laban-subset staff | Multi-column pedagogical staff; add/remove symbols on columns |

Products stay separate: MvEI Workbench is an authoring application and Practice Relay is a WorkRecord handoff application.

## Non-claims

- Not full professional Labanotation.
- Not LabanLite / MARC 358 = MvEI.
- Not a race with LabanLab / LabanWriter feature parity.
