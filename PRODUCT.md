# Product scope

## Current application

Practice Relay prepares portable, versioned, policy-aware WorkRecord handoffs. The current implementation associates heterogeneous evidence with identity, provenance, participants, represented subjects, revisions, permitted uses, and purpose-bound export decisions.

Specialist authoring, assessment, portfolio, and repository tools remain responsible for their own records. Practice Relay addresses the handoff between them.

The 0.4 alpha includes performing-arts, design-studio, and field-study profile fixtures. These fixtures test contract shape only. They are not evidence of external adoption or completed pilots.

## Intended users

The current design is intended for students, educators, reviewers, researchers, data stewards, and external collaborators working with practice-based projects. Real-user suitability has not been established.

## Related products

MvEI (Movement Encoding Initiative) is the separate movement-schema and validation effort. MvEI Workbench is its separate authoring client. WorkRecord Core is the shared technical contract layer and is not a user-facing product.

## Design requirements

1. Existing tools remain the places where work is created.
2. WorkRecord identity and immutable snapshots remain stable across handoffs.
3. Policy and provenance decisions remain visible.
4. Domain profiles add meaning without changing the neutral core.
5. Blocked and incomplete states state the next safe action.
6. Practice Relay and MvEI Workbench remain separate applications.

## Accessibility requirements

The maintained browser surfaces require keyboard-operable controls, visible focus, semantic landmarks, status announcements, sufficient contrast, reduced-motion handling, and non-color state cues. The current screenshot command checks primary controls and mobile horizontal overflow, but no external WCAG conformance audit is claimed.

## Excluded claims

The alpha does not claim production readiness, IMS certification, multi-campus identity integration, external pilots, full professional Labanotation density, or replacement of existing authoring and review tools.
