# WorkRecord package and video boundary

Status: current for the `0.4.0-alpha.1` local evaluation tier.

A Practice Relay handoff is not equivalent to a video submission. A current WorkRecord package can associate several artifact types, revisions, participants, represented subjects, use decisions, and an immutable handoff snapshot.

| Concern | Current representation |
|---|---|
| Media process | Multiple takes and a preferred take |
| Music reference | MusicXML or MEI reference where applicable |
| Movement reference | `movement_annotation` or an MvEI document reference |
| Other evidence | Text, documents, cues, and external artifact references |
| Use boundary | Explicit purpose, destination, representation, and decision fields |
| Handoff | Validated WorkRecord manifest and RO-Crate 1.3 package output |

A single video URL with comments does not exercise the implemented WorkRecord boundary. The package tests and acceptance checks therefore require multi-asset identity, roles, policy, and export behavior.

Practice Relay does not replace video-review, authoring, LMS, portfolio, or repository products. It references outputs from existing systems and prepares a bounded handoff.

See [`../../docs/positioning-kill-switches.md`](../../docs/positioning-kill-switches.md),
[`acceptance-criteria.md`](acceptance-criteria.md), and
[`../../docs/EVIDENCE.md`](../../docs/EVIDENCE.md).
