# MvEI capture bridge recipe

<!-- What: a local landmark-to-sketch conversion example. Why: implementers can reproduce the alpha bridge without inferring capture-system support. -->

This recipe exercises the implemented local conversion only. It accepts a landmark JSON record with `schemaVersion: "0.2.0-landmarks"` and source label `opencap`, `mediapipe`, `pose2sim`, or `other`.

```json
{
  "schemaVersion": "0.2.0-landmarks",
  "source": "mediapipe",
  "id": "cap-session-01",
  "frames": [
    { "tMs": 0, "points": [{ "name": "nose", "x": 0.5, "y": 0.2 }] },
    { "tMs": 100, "points": [{ "name": "nose", "x": 0.52, "y": 0.21 }] }
  ]
}
```

Run the conversion from the repository root:

```bash
node --import tsx -e '
import { readFileSync } from "node:fs";
import { landmarksToAnnotation, annotationToMotifSketch } from "./mvei/packages/capture-bridge/src/index.ts";
const landmarks = JSON.parse(readFileSync("landmarks.json", "utf8"));
const annotation = landmarksToAnnotation(landmarks);
const motif = annotationToMotifSketch(annotation);
console.log(JSON.stringify({ annotation, motif }, null, 2));
'
```

The bridge compares each adjacent frame pair. It emits `travel` when the mean point displacement is greater than `0.05`; otherwise it emits `stillness`. These events always have `source: "plugin_pose"` and `quality: "sketch"`.

The Motif output is a valid sketch candidate, not full notation: it uses `profile: "mvei-motif"`, `schemaVersion: "0.2.0"`, and `completeness: "sketch"`. `travel`, `stillness`, and `walk` map directly; any other annotation label becomes `stillness`.

Use `mvei/packages/capture-bridge/fixtures/landmarks-sample.json` as the repository fixture. The bridge has no capture-system integration or external-product compatibility guarantee.
