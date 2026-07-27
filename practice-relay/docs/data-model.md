<!-- WorkRecord model guide. Why: summarizes the current shared contract while keeping source types authoritative. -->
# WorkRecord data model

The exported TypeScript definitions in
[`packages/work-record-core/src`](../../packages/work-record-core/src) are
authoritative. JSON package validation is implemented in
[`packages/work-record-package`](../../packages/work-record-package).

```text
WorkRecord
  id, schemaVersion, profile, title, revision
  members[], actors[], representedSubjects[]
  spine { mode, durationMs, markers[], regions[] }
  tracks[], takes[], takeIds[], preferredTakeId
  comments[], versions[], snapshots[]
  artifacts[], iterations[], annotations[], views[], relations[]
  usePolicySnapshots[], usePolicies[]
  movementCapability
  provenance
```

## Track types

The current contract accepts:

```text
audio
video
music_notation
movement_annotation
movement_notation
media_cues
text
assessment
analysis
```

`movement_annotation` is non-symbolic annotation. `movement_notation` carries
an MvEI reference and does not merge MvEI Workbench into Practice Relay.

## Takes and media

A take has an identifier and optional label. The media upload route assigns its
storage key, content type, digest, byte count, and `media://` path. The ordinary
add-take route rejects caller-supplied media metadata. `preferredTakeId` must
refer to an existing take.

## Policies and exports

The older `usePolicySnapshots` array records purpose lists and an
`exportAllowed` value. The current evidence model also contains represented
subjects and destination-specific `usePolicies`. Export routes apply the
policy form required by that route and fail closed when required information is
missing or denied.

## Versions and snapshots

Version tags record named submission points. Evidence snapshots record an
artifact identifier set plus a creation time and reason. The JSON store also
appends mutation events. These mechanisms do not provide a distributed version
control system or cross-process transaction log.

## Profiles

The source currently defines WorkRecord Core, design-studio, and field-study
profile identifiers. Profile definitions declare required fields, while the
shared WorkRecord shape remains the stored object. `GET /profiles` returns the
definitions used by the API.
