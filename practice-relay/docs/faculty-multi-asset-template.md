<!-- Synthetic multi-asset fixture guide. Why: explains the Q17 package-shape fixture without presenting it as a current browser or participant workflow. -->
# Synthetic multi-asset fixture

[`../fixtures/faculty-multi-asset-template.json`](../fixtures/faculty-multi-asset-template.json)
is a synthetic input used by the Q17 acceptance gate. It demonstrates that a
WorkRecord package can reference several track types rather than reducing the
record to one video.

The fixture includes audio, video, music notation, movement annotation, media
cues, and text references, two take identities, one preferred take, policy
purpose labels, and a submission tag. Referenced media and document paths are
illustrative fixture values and are not files supplied by this repository.

This JSON is not a request body for the current API. In particular, the media
upload route assigns storage metadata and the add-take route rejects
caller-supplied media paths. The current browser shell does not create records,
upload media, or submit this fixture.

The package boundary is tested by:

```bash
pnpm --filter @practice-relay/work-record-package test
```

See [package-vs-video.md](package-vs-video.md) for the current handoff boundary
and [api.md](api.md) for supported mutations.
