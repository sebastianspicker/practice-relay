# Shared contract versioning

## Semver for schemas

- `schemaVersion` field inside each JSON document.
- Breaking change: major bump and a migration note in the release description.
- Fixtures in each package must pass `pnpm validate:schemas`.

## Dual-RFC

Any change to:

- time-core region/marker IDs
- take / preferredTake identity
- consent purpose enum
- work-record package track type enum
- movement-encode kinds

requires approval from Practice Relay tech lead and MvEI tech lead (or single owner until second exists - document in PR).

## Package export path

```text
WorkRecord (WorkRecord Core)
  → work-record package manifest (@practice-relay/work-record-package)
  → files on disk / zip
  → RO-Crate 1.3 representation
```

## Movement track capability ladder

| Capability | Schema |
|------------|--------|
| annotation only | `movement-annotation-v0` |
| Motif symbolic | `mvei-motif` |
| Laban subset | `mvei-laban-subset` |
