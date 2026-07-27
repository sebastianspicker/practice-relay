# MvEI validator API and CLI

<!-- What: the current alpha validation entrypoint and accepted document discriminators. Why: consumers need one checked boundary instead of duplicating schema selection. -->

The alpha validator accepts these document forms:

| Document form | Discriminator | Schema |
| --- | --- | --- |
| Motif | `profile: "mvei-motif"` | `packages/movement-encode/schemas/mvei-motif-stub.schema.json` |
| Pedagogical Laban subset | `profile: "mvei-laban-subset"` | `packages/movement-encode/schemas/mvei-laban-subset.schema.json` |
| Movement annotation | `kind: "movement_annotation"` | `packages/movement-encode/schemas/movement-annotation-v0.schema.json` |

`movement_annotation` is a Practice Relay-native annotation shape, not symbolic MvEI or Labanotation. `mvei-laban` is not accepted by this validator because the full profile is not implemented.

## CLI

```bash
pnpm --filter @practice-relay/mvei-validator exec mvei-validate path/to/document.json
```

The command prints `OK <path>` and exits with status 0 for a valid document. It exits with status 1 for invalid JSON, schema failures, an unreadable file, or an unknown discriminator. It exits with status 2 when no file path is supplied.

## Capture bridge API

`@practice-relay/mvei-capture-bridge` exports two in-process conversion functions:

```ts
landmarksToAnnotation(document)
annotationToMotifSketch(annotation)
```

The first creates sketch-quality `movement_annotation` events. The second maps those event labels into a Motif document with `profile: "mvei-motif"` and `completeness: "sketch"`. See [capture recipes](capture-recipes.md) for the exact input labels and conversion limits.
