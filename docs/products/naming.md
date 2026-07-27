# Product naming

| Name | Role | Primary path |
|---|---|---|
| Practice Relay | Programme and main WorkRecord handoff application | `practice-relay/` |
| WorkRecord Core | Shared technical domain and contracts, not a user-facing application | `packages/work-record-core/` |
| MvEI (Movement Encoding Initiative) | Movement encoding schemas, validators, and fixtures | `packages/movement-encode/`, `mvei/` |
| MvEI Workbench | Separate MvEI authoring application | `mvei/apps/workbench/` |

Use the full form MvEI (Movement Encoding Initiative) on first public mention. Do not call MvEI simply MEI because that conflicts with the Music Encoding Initiative.

Practice Relay and MvEI Workbench may share WorkRecord and MvEI references. They must not be presented as one application.

Only the `@practice-relay/*` package scope is current.

Do not use firstness claims, replacement claims, or WorkRecord Core as a student-facing product name. The enforced list and rationale are in [`../positioning-kill-switches.md`](../positioning-kill-switches.md).
