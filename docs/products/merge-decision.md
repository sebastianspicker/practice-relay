<!-- Product-boundary decision. Why: prevents shared contracts from turning Practice Relay and MvEI Workbench into one incoherent application. -->
# Product-boundary decision

Decision: Practice Relay and MvEI Workbench remain separate applications. MvEI remains a standards effort. WorkRecord Core and the other `packages/*` modules are the shared technical plane.

| Concern | Practice Relay | MvEI | MvEI Workbench | WorkRecord Core |
|---|---|---|---|---|
| User promise | Carry a work, evidence, decisions, and permitted uses through institutional handoffs | Establish interoperable movement-encoding contracts and governance | Author, validate, and round-trip MvEI records | Supply product-neutral record, policy, time, packaging, and interop contracts |
| Primary users | Creators, reviewers, faculty, repository and research-support staff | Standards contributors, notators, libraries, implementers | Notators, teachers, and MvEI implementers | Application and package developers |
| Release pressure | Workflow and institutional handoff usability | Long-lived schema correctness and independent implementation | Authoring ergonomics and conformance | Stable technical contracts |
| Path | `practice-relay/` | `mvei/` + `packages/movement-encode` | `mvei/apps/workbench` | `packages/work-record-core` + `packages/*` |

## Why they are separate

- A WorkRecord handoff application should not own movement-notation semantics.
- A standards effort must outlive any one editor and accept independent implementations.
- The Workbench can iterate on authoring without forcing the Practice Relay release cadence.
- Shared time, policy, package, and movement references provide interoperability without a single-login megaproduct.

## Allowed integration

Practice Relay may retain an MvEI artefact reference, validate it through the shared movement package, place it on the common time spine, and include it in a purpose-bound export. It may link to or launch MvEI Workbench. It must not silently embed a second application or fork the MvEI schema.

## Review trigger

Reconsider this decision only with observed user evidence that separate applications make a real handoff materially worse and that a merge would not compromise standards governance. Funding convenience, one-logo marketing, or shared package code are not sufficient evidence.

Current names and paths are defined in [naming.md](naming.md). The current
implementation is mapped in
[architecture-and-relationship.md](architecture-and-relationship.md).
