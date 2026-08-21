# OSC federation example patches (JSON)

Not binary Max `.maxpat` or ossia score files.
Not a Practice Relay show-control runtime.

| File | Consumer | Rebuild command |
|------|----------|--------------|
| `ossia-receive-hint.json` | ossia score wiring | `toOssianHint(score)` |
| `max-dict-patch.json` | Max [udpreceive]/route/dict | `toMaxDict(score)` |

See [`practice-relay/docs/osc-federation.md`](../../practice-relay/docs/osc-federation.md) for the interoperability contract.

Regenerate from a WorkRecord-like object:

```ts
import { toOssianHint, toMaxDict } from "@practice-relay/interop";
// write JSON.stringify(toOssianHint(score), null, 2)
```
