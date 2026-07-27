# MvEI alpha data model

<!-- What: the current document discriminators and key fields. Why: shared schemas, not product UI, define the interoperability boundary. -->

## Implemented document forms

| Form | Discriminator and version | Required core fields | Status |
| --- | --- | --- | --- |
| Motif | `profile: "mvei-motif"`; `schemaVersion: "0.2.0"` or legacy `"0.1.0-stub"` | `id`, `completeness`, `items` | Implemented |
| Pedagogical Laban subset | `profile: "mvei-laban-subset"`; `schemaVersion: "0.2.0"` | `id`, `completeness`, `measures`, `symbols` | Implemented |
| Movement annotation v0 | `kind: "movement_annotation"`; `schemaVersion: "0.1.0"` | `events` | Implemented, non-symbolic |

`mvei-laban` and `mvei-benesh` are planned names only. They do not have an implemented alpha schema or validator path.

## Motif

Motif `completeness` accepts `sketch`, `partial`, or `complete`. All three are valid states when the required fields are present. Every item has `id`, a controlled `symbol`, and non-negative integer `order`. Item `timeAnchor` may contain `tMs`, `musicMeasure`, and `mediaFragment`.

The alpha Motif symbols are `walk`, `run`, `turn`, `stillness`, `gesture_arm`, `gesture_leg`, `travel`, `jump`, `fall`, `rise`, `twist`, `balance`, `effort_strong`, `effort_light`, `phrase_begin`, and `phrase_end`.

Optional `annotationLinks` use `system` values `elan`, `motion_bank`, or `other`. Optional `musicCoTimeline` has `schemaVersion: "0.1.0-annex"` and carries MusicXML or MEI references and anchors.

## Pedagogical Laban subset

The subset uses `measures` and `symbols`. A symbol declares `id`, `kind`, `column`, and `measureId`; optional fields include direction, level, duration, beat offset, simultaneity group, Motif link, and time anchor. It is intentionally below full professional Labanotation density.

## Movement annotation

An annotation contains events with `id`, `regionId`, `label`, and `source`. The accepted event-source labels are `human`, `plugin_pose`, and `imported_elan`. Optional `quality` accepts `rehearsal`, `performance`, `sketch`, or `other`.

Capture conversion emits `source: "plugin_pose"` and `quality: "sketch"`. It does not make the resulting annotations symbolic notation.
