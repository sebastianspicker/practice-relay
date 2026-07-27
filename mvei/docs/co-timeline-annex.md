# Music co-timeline annex (v0 hooks)

MvEI residual: music co-timeline annex so movement encoding sits beside MusicXML/MEI, not only under video.

## Annex shape (v0)

Optional object on Motif documents (and future Laban profiles):

```json
{
  "musicCoTimeline": {
    "schemaVersion": "0.1.0-annex",
    "musicxmlRef": "scores/piece.musicxml",
    "meiRef": null,
    "anchors": [
      { "motifItemId": "i1", "musicMeasure": "4", "tMs": 1200 }
    ]
  }
}
```

## Schema / types

- JSON Schema: `packages/movement-encode/schemas/music-co-timeline-annex.schema.json`
- Types/helpers: `@practice-relay/movement-encode` (`MusicCoTimeline`, `attachMusicCoTimeline`)
- Motif stub allows optional `musicCoTimeline` property (additionalProperties was false - extended carefully)

## Practice Relay binding

WorkRecord `music_notation` track `ref` + Motif `musicCoTimeline.musicxmlRef` should agree when both present. work-record package export already surfaces `musicxmlRef` and `mveiRef`.

## Non-goals

- Live SMPTE/Link score following
- Bidirectional video scrub production polish
