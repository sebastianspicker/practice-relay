# OSC federation

Practice Relay projects selected WorkRecord fields into OSC-shaped messages. It
does not open a UDP socket, schedule cues, control playback, or replace a show
control application. External software remains responsible for transport and
timing.

## Package surface

The current `@practice-relay/interop` package exports:

| API | Result |
|---|---|
| `exportRecord(record, "osc-cue-map")` | Serialized region and selected track cues |
| `buildOscDeepLinkProjection(record)` | Address catalogue and cue list |
| `projectOscBundle(record)` | Ordered `{ address, args, tMs }[]` messages |
| `formatOscUdpPayload(messages)` | NDJSON plus a transport description |
| `toOssianHint(record)` | JSON mapping for an ossia score scenario |
| `toMaxDict(record)` | JSON mapping for Max route and dictionary objects |

The structural input type is currently named `InteropScoreLike` for
compatibility. It represents a WorkRecord projection, not a separate score
domain model.

## Address scheme

```text
/practice-relay/{recordId}/region          args: [regionId, label, endMs]
/practice-relay/{recordId}/track           args: [trackId, type, ref, label]
/practice-relay/{recordId}/preferred_take  args: [takeId]
```

Region messages use the region start time as `tMs`. Track and preferred-take
messages use `tMs = 0` because they describe document state rather than timed
transport events.

## Adapter outputs

The examples under [`../../fixtures/osc/`](../../fixtures/osc/) are
hand-checkable JSON documents:

| File | Purpose |
|---|---|
| `ossia-receive-hint.json` | Maps Practice Relay addresses to an ossia score scenario |
| `max-dict-patch.json` | Describes Max `[udpreceive]`, `[route]`, `[dict]`, and `[coll]` wiring |

They are documentation artifacts, not binary `.ossia` or `.maxpat` files.

### ossia score

```ts
import { toOssianHint } from "@practice-relay/interop";

const hint = toOssianHint(record);
```

Create a scenario with `hint.durationMs`, map `hint.receiveAddresses` to local
nodes, and schedule `hint.cues` from the external runtime. Practice Relay does
not start or supervise that runtime.

### Max

```ts
import { toMaxDict } from "@practice-relay/interop";

const patch = toMaxDict(record);
```

Rebuild the documented `patch.patchObjects` and `patch.routeTree` in Max. The
created JSON does not claim binary patch compatibility.

### Generic NDJSON

```ts
import {
  formatOscUdpPayload,
  projectOscBundle,
} from "@practice-relay/interop";

const messages = projectOscBundle(record);
const { jsonLines, description } = formatOscUdpPayload(messages);
```

Pass `jsonLines` to an operator-provided OSC bridge. The package does not select
a destination, port, retry policy, or clock.

### QLab

Create one Network cue per `OscMessage`, with the destination and timing managed
inside QLab. QLab owns GO, fades, and safety behavior. Practice Relay only
supplies the projected message data.

## Validation

```bash
pnpm --filter @practice-relay/interop test
```

The direct interoperability contracts construct a synthetic WorkRecord in
memory and verify:

1. At least two tracks and two track types are represented.
2. Every address is non-empty and begins with `/practice-relay/`.
3. Region, track, and preferred-take address families are present.
4. The ossia and Max route descriptions are non-empty.

These checks validate document projection only. They do not validate UDP
delivery, external application compatibility, or real-time scheduling.

## Non-goals

- A Practice Relay UDP server
- Sample-accurate show control
- Binary Max or ossia project generation
- Replacement of ossia score, Max, or QLab
