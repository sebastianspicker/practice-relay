<!-- Practice Relay scope. Why: fixes the alpha boundary around WorkRecord handoffs rather than earlier system-of-record plans. -->
# Practice Relay scope

Practice Relay prepares a bounded WorkRecord handoff. A record associates
selected evidence, revisions, participants, represented subjects, permitted
uses, and export provenance while specialist systems continue to own creation,
course administration, asset management, and repository publication.

## Implemented alpha boundary

- WorkRecord Core types and mutation rules
- WorkRecord lifecycle and role checks in the local API
- tracks, takes, regions, comments, represented subjects, artifacts,
  annotations, policies, versions, and snapshots
- purpose-bound JSON and ZIP package export, including RO-Crate metadata
- local JSON record storage and filesystem or S3-compatible media adapters
- OTIO and EAF import/export projections with explicit loss warnings
- OSC cue-map projections, not a show-control runtime
- local-mock LTI routes and assignment payloads
- a read-only browser presentation shell with an explicit synthetic fallback
- optional MvEI references through a `movement_notation` track

## Current limits

- The browser shell does not authenticate, upload media, or submit API
  mutations. Its snapshot and export controls update local status only.
- The API's built-in users and plaintext configured-user format are for
  synthetic local evaluation only.
- The LTI implementation is a local mock and is not an IMS-certified or live
  LMS integration.
- Filesystem persistence is single-process and lab-only. No managed database
  adapter is shipped.
- Interop projections are lossy and do not establish compatibility with an
  external product.
- MvEI Workbench remains a separate application.

## Non-goals

- LMS, ePortfolio, DAM, repository, video editor, notation editor, DAW, or
  show-control replacement
- participant assessment or automated grading
- capture or motion-analysis platform
- production identity, multi-replica operation, or institutional service-level
  guarantees
- ownership of MvEI or MvEI Workbench user interfaces

The [product scope](../../PRODUCT.md) is the current
research boundary. Implementation details are indexed in
[`../IMPLEMENTATION.md`](../IMPLEMENTATION.md).
