# Product scope

## What Practice Relay is

Practice Relay prepares portable, versioned, policy-aware WorkRecord handoffs.
One record ties together heterogeneous evidence and the context that makes it
usable: identity and provenance, participants, represented subjects, revisions,
permitted uses, and purpose-bound export decisions.

Specialist authoring, assessment, portfolio, and repository tools stay
responsible for their own records. Practice Relay addresses the handoff between
them, not the work they create.

The 0.4 alpha ships performing-arts, design-studio, and field-study profile
fixtures. These exercise the contract shape; they are not evidence of external
adoption or completed pilots.

## Who it is for

The current design targets students, educators, reviewers, researchers, data
stewards, and external collaborators working on practice-based projects.
Real-user suitability has not been established yet.

## Relationship to MvEI

MvEI (Movement Encoding Initiative) is a separate movement-schema and validation
effort, and MvEI Workbench is its authoring client. WorkRecord contracts are
shared technical infrastructure, not a user-facing product.

## Design requirements

1. Work is still created in existing tools.
2. WorkRecord identity and immutable snapshots stay stable across handoffs.
3. Policy and provenance decisions stay visible.
4. Domain profiles add meaning without changing the neutral core.
5. Blocked and incomplete states name the next safe action.
6. Practice Relay and MvEI Workbench remain separate applications.

## Accessibility

The maintained browser surfaces target keyboard-operable controls, visible
focus, semantic landmarks, status announcements, sufficient contrast,
reduced-motion handling, and non-color state cues. No external WCAG conformance
audit is claimed.

## What the alpha does not claim

Production readiness, IMS certification, multi-campus identity integration,
external pilots, full professional Labanotation density, or replacement of
existing authoring and review tools.
