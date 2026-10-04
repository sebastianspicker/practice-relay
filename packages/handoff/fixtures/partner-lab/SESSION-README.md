# Partner-lab anonymized export — session dump

Export label: `partner-conservatoire-movement / duet-study-w6`
Export date (synthetic): 2026-04-12
Anonymization: performer names stripped; media paths are relative offline stubs
Status: hand-authored as if from a partner teaching lab; not a real multi-site pilot result.

This folder is the kind of dump-style package a partner might hand over on a
stick:

```
partner-lab/
  SESSION-README.md          ← this file (export cover sheet)
  partner-session.eaf        ← ELAN 3.0-like annotation session
  partner-nle.otio.json      ← NLE OTIO-like cut (DaVinci-class export sketch)
  README.md                  ← Practice Relay consumer notes (not from partner)
```

---

## Session context (synthetic)

| Field | Value |
|-------|-------|
| Lab | Partner conservatoire movement studio (anonymized) |
| Course pair | Composition seminar + contemporary technique |
| Session | Week-6 duet study (entrance → core → exit) |
| Capture | Multi-cam + boom; offline disk for close-up |
| Annotation tool | ELAN (partner export) |
| NLE | Resolve / DaVinci-class OTIO JSON slice |
| Practice Relay score id (if rebound) | `partner-lab-session-01` / `partner-lab-nle-01` |

---

## What the partner intended

1. ELAN codes regions, faculty comments, effort weight, camera notes, gesture path, and speaker labels.
2. The NLE holds wide + close-up + boom with a breath gap, an audio transition, a generator title card, and timeline markers.
3. Media may be offline (`media_reference: null`); the partner often ships annotations first.

---

## Expected loss on Practice Relay import

Import through `@practice-relay/handoff/projections` is lossy by design. Tests
assert stable `ImportWarningCode` values (see
`packages/handoff/src/projections/import-warnings.ts`).

### From `partner-session.eaf`

| Code | Why |
|------|-----|
| `UNKNOWN_TIER` | Tiers other than `regions` / `comments` (effort, camera, gesture, speaker, …) |
| `MISSING_MEDIA` | Empty `MEDIA_FILE`, no `MEDIA_DESCRIPTOR` |
| `EMPTY_ANNOTATION` | Blank region annotation value |
| `ORPHAN_COMMENT` | Comment span matches no region |
| `MISSING_TIME_SLOT` | Broken `TIME_SLOT_REF` from the partner export |

### From `partner-nle.otio.json`

| Code | Why |
|------|-----|
| `GAP_SKIPPED` | Breath gap after the wide take |
| `TRANSITION_SKIPPED` | Audio crossfade |
| `UNSUPPORTED_OTIO_NODE` | Generator / non-clip schemas |
| `MISSING_MEDIA` | Close-up offline (null media reference) |
| `MARKERS_NOT_IMPORTED` | Timeline markers not mapped to regions |

---

## Non-claims

- Not evidence of a completed multi-institution pilot.
- Not a claim that partner labs already run Practice Relay in production.
- Not lossless ELAN or OpenTimelineIO parity.
- Do not invent course results from these fixtures.
