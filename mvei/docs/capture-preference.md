# MvEI capture bridge boundary

<!-- What: the accepted landmark input labels and output quality contract. Why: the alpha converts local landmark records without claiming a capture product. -->

The alpha contains a conversion bridge at `mvei/packages/capture-bridge`. It does not implement a capture application, device connection, or an external-product integration.

## Accepted landmark record

The TypeScript `LandmarkDocument` contract accepts:

| Field | Accepted value |
| --- | --- |
| `schemaVersion` | `"0.2.0-landmarks"` |
| `source` | `"opencap"`, `"mediapipe"`, `"pose2sim"`, or `"other"` |
| `id` | string |
| `frames` | timestamped landmark frames |

Each frame has `tMs` and `points`. A point has `name`, `x`, and `y`; `z` and `conf` are optional. The `source` values are exact accepted labels in this bridge type. They are provenance labels, not claims of compatibility, endorsement, or a recommended capture workflow.

## Output quality

`landmarksToAnnotation()` compares adjacent frames and emits one `movement_annotation` event per comparison. The current heuristic assigns `travel` when mean point displacement is greater than `0.05`; otherwise it assigns `stillness`.

Every emitted event has `source: "plugin_pose"`, `quality: "sketch"`, `bodySegment: "full"`, and a created region ID. The output is coarse derived analysis and remains non-symbolic.

`annotationToMotifSketch()` maps `travel`, `stillness`, and `walk` labels to the same Motif symbols. Other labels become `stillness`. The result has `profile: "mvei-motif"`, `schemaVersion: "0.2.0"`, and `completeness: "sketch"`.

Human review remains necessary before using derived labels for an assessment or notation decision.
