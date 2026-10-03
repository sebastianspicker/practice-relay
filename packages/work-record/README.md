# @practice-relay/work-record

This private workspace package owns the portable WorkRecord v0.4 domain:
aggregate state, membership authorization, pure commands and transitions,
evidence and movement references, time spines, media take contracts, policy
evaluation, schema-backed parsing, and the minimal persistence port.

Persistence implementations belong to `@practice-relay/record-store`. Package
manifests, RO-Crate metadata, ZIP archives, and external projections belong to
`@practice-relay/handoff`.

## Exports

| Import | Contents |
| --- | --- |
| `@practice-relay/work-record` | Complete public facade |
| `@practice-relay/work-record/domain` | Aggregate, commands, parsing, access, evidence, and store port |
| `@practice-relay/work-record/time` | Time-spine contracts |
| `@practice-relay/work-record/policy` | Use-policy and release decisions |
| `@practice-relay/work-record/media` | WorkRecord take contracts |

Supported neutral profile identifiers are
`urn:work-record:profile:core:0.4`,
`urn:work-record:profile:design-studio:0.1`, and
`urn:work-record:profile:field-study:0.1`.

## Invariants

- Complete records are parsed against the canonical schema and aggregate
  invariants before use or persistence.
- Record access derives from WorkRecord membership. Descriptive actor roles do
  not grant access, and empty membership fails closed.
- Commands return new validated state; adapters own persistence and revision
  conflicts.
- `COMMAND_PERMISSIONS` declares the membership permission each command
  requires, and `ROLES` is the closed role vocabulary.
- Role denials, policy/release denials, duplicate identities, and validation
  failures carry stable `code` values (`WORK_RECORD_ROLE_DENIED`,
  `WORK_RECORD_POLICY_DENIED`, `WORK_RECORD_DUPLICATE`, `WORK_RECORD_INVALID`);
  boundaries classify errors by code, not by message text.
  `asWorkRecordValidation` wraps pure parsing or transition code and turns its
  rule violations (plain `Error` or `RangeError`) into
  `WorkRecordValidationError`; other error types pass through as defects.
- Policy and release decisions fail closed.
- Movement integration is a neutral document reference, not a dependency on
  `@practice-relay/movement`.

## Validation

From the repository root:

```bash
pnpm --filter @practice-relay/work-record typecheck
pnpm --filter @practice-relay/work-record test
pnpm check:contracts
```
