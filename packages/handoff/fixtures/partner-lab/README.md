# Partner-lab field fixtures (hand-authored)

Synthetic "as if from a partner lab anonymized export" files for lossy ELAN/OTIO
import tests. They are not real multi-site pilot exports and not evidence of
completed field deployments.

| File | Purpose |
|------|---------|
| [`SESSION-README.md`](./SESSION-README.md) | Cover sheet as if a partner lab dumped the session |
| `partner-session.eaf` | ELAN-like: regions, comments, multiple unknown tiers, empty annotation, orphan comment, missing media, bad time slots |
| `partner-nle.otio.json` | OTIO-like NLE: multi-clip, multiple gaps and transitions, freeze, generator, offline media, markers |

`packages/handoff/tests/field-fidelity.test.ts` consumes these files and asserts
specific `ImportWarningCode` values. The taxonomy lives in
`packages/handoff/src/projections/import-warnings.ts`.
