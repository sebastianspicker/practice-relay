<!-- Synthetic capture bridge demo. Why: documents the exercised landmarks-to-MvEI fixture path without implying a participant session or browser workflow. -->
# Synthetic capture bridge demo

This repository demo converts a synthetic landmarks fixture into a movement
annotation and an MvEI Motif sketch. It exercises the capture-bridge package and
writes inspectable fixture output. It does not start a capture system, collect
participant data, open Practice Relay, or establish pilot results.

## Run the demo

From the repository root:

```bash
pnpm demo:capture-lab
pnpm test:capture-lab
```

The default input is
`mvei/packages/capture-bridge/fixtures/landmarks-sample.json`. The default
output directory is `test-results/generated-fixtures/capture-lab/`.

| Output | Purpose |
|---|---|
| `movement_annotation.json` | Coarse movement events derived by the capture bridge |
| `motif-sketch.json` | MvEI Motif document with `completeness: "sketch"` |
| `package-notes.json` | Synthetic attachment guidance and source labels |

The optional `--out` value must remain inside the repository and must not cross
a protected directory or symbolic link. The default fixture directory is the
maintained validation target.

The programmatic boundary is
`@practice-relay/mvei-capture-bridge`:

```ts
import {
  annotationToMotifSketch,
  landmarksToAnnotation,
} from "@practice-relay/mvei-capture-bridge";

const annotation = landmarksToAnnotation(landmarkDocument);
const motif = annotationToMotifSketch(annotation);
```

## Limits

- The supplied input is synthetic fixture data.
- Event labels and Motif output are sketch quality and require human review.
- The demo does not implement full Labanotation, assessment, or automated
  grading.
- Capture remains external to MvEI and Practice Relay.
- MvEI Workbench and Practice Relay remain separate applications.
- The current Practice Relay web shell does not upload these files. Attachment
  and export behavior is exercised through domain, API, and package tests.

For the current external-input boundary, see
[MvEI capture recipes](../../mvei/docs/capture-recipes.md). For neutral handoff
study instruments, see the [pilot pack index](README.md).
