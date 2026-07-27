# ELAN and OTIO import loss taxonomy

`@practice-relay/interop` reports stable warning codes when an ELAN `.eaf` or
OpenTimelineIO JSON document cannot be represented fully in WorkRecord parts.
Imports are best-effort projections, not complete implementations of either
source format.

The machine-readable type is `ImportWarningCode` in `src/index.ts`. Each
diagnostic has the shape `{ code, message, path? }`. Tests can compare codes with
`warningCodes(warnings)`.

## Warning codes

| Code | Source | Condition | Effect |
|---|---|---|---|
| `UNKNOWN_TIER` | EAF | Tier id is not `regions` or `comments` | The tier is not mapped into WorkRecord parts |
| `MISSING_MEDIA` | EAF or OTIO | EAF has no media descriptor, or an OTIO clip has no target URL | No media path is attached as a take |
| `UNSUPPORTED_OTIO_NODE` | OTIO | `OTIO_SCHEMA` is outside the supported set and is not a gap or transition | The node is skipped |
| `GAP_SKIPPED` | OTIO | A track contains a `Gap.*` child | The hold or spacer is omitted from the WorkRecord spine |
| `TRANSITION_SKIPPED` | OTIO | A track contains a `Transition.*` child | The transition is omitted |
| `EMPTY_ANNOTATION` | EAF | An alignable annotation has a blank value | The annotation is omitted |
| `ORPHAN_COMMENT` | EAF | A comment time range matches no region | The comment is bound to a synthetic `r-import-*` id |
| `MISSING_TIME_SLOT` | EAF | An annotation refers to an absent `TIME_SLOT_ID` | The missing time defaults to zero |
| `MARKERS_NOT_IMPORTED` | OTIO | The timeline contains markers | Markers are recognized but not projected into WorkRecord regions |
| `EMPTY_DOCUMENT` | EAF or OTIO | Import yields no usable regions, comments, tracks, or takes | The caller receives an empty projection warning |

## Supported OTIO schemas

The importer recognizes `Timeline.1`, `Stack.1`, `Track.1`, `Clip.1`,
`Marker.1`, `TimeRange.1`, `RationalTime.1`, and `ExternalReference.1`.
Markers currently produce `MARKERS_NOT_IMPORTED`.

## Recognized EAF tiers

| Tier id | WorkRecord projection |
|---|---|
| `regions` | Spine regions |
| `comments` | Region-anchored comments using the `author: body` convention |
| Any other id | `UNKNOWN_TIER` warning only |

## Fixtures

| Path | Coverage |
|---|---|
| `packages/interop/fixtures/sample-field.eaf` | Unknown tiers and missing media |
| `packages/interop/fixtures/sample-nle.otio.json` | Gap, transition, unsupported node, missing media, and markers |
| `fixtures/partner-lab/SESSION-README.md` | Cover sheet for synthetic partner-lab fixtures |
| `fixtures/partner-lab/partner-session.eaf` | Unknown tiers, orphan annotations, empty values, and bad time slots |
| `fixtures/partner-lab/partner-nle.otio.json` | Multiple gaps and transitions, offline media, and markers |

## Non-goals

- Full ELAN linguistic types or controlled vocabularies
- Sample-accurate OTIO effects and transitions
- Lossless round trips with ELAN or commercial editing software
- Replacement of the source authoring environments

## Test

```bash
pnpm --filter @practice-relay/interop test
```

The field-fidelity tests assert the warning codes emitted for the committed
synthetic fixtures.
