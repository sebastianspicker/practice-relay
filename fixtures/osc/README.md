# OSC federation example patches (JSON)

Not binary Max `.maxpat` or ossia score files.
Not a Practice Relay show-control runtime.

| File | Consumer | Rebuild command |
|------|----------|--------------|
| `ossia-receive-hint.json` | ossia score wiring | `toOssianHint(score)` |
| `max-dict-patch.json` | Max [udpreceive]/route/dict | `toMaxDict(score)` |
| `staged/` | CI / harness output from demo seed | `pnpm test:osc-stage` |

See [`practice-relay/docs/osc-federation.md`](../../practice-relay/docs/osc-federation.md) (staged validation section).

```bash
pnpm test:osc-stage
# writes test-results/generated-fixtures/osc/{ossia-receive-hint,max-dict-patch,stage-summary}.json
```

Regenerate from a WorkRecord-like object:

```ts
import { toOssianHint, toMaxDict } from "@practice-relay/interop";
// write JSON.stringify(toOssianHint(score), null, 2)
```
