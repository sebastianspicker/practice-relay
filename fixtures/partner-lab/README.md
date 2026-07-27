# Partner-lab field fixtures (hand-authored)

Status: Synthetic “as if from partner lab anonymized export” for lossy ELAN/OTIO import tests.
Not real multi-site pilot exports. Not claimed completed field deployments.

| File | Purpose |
|------|---------|
| [`SESSION-README.md`](./SESSION-README.md) | Cover sheet as if partner lab dumped the session |
| `partner-session.eaf` | ELAN-like: regions, comments, multiple unknown tiers, empty ann, orphan comment, missing media, bad time slots |
| `partner-nle.otio.json` | OTIO-like NLE: multi-clip, multiple gaps/transitions, freeze, generator, offline media, markers |

Consumed by `@practice-relay/interop` field-fidelity tests (`field-fidelity.test.ts`), which assert specific `ImportWarningCode` values.

Taxonomy: [`packages/interop/LOSS-TAXONOMY.md`](../../packages/interop/LOSS-TAXONOMY.md).
