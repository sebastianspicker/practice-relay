# LabanWriter import boundary

The current repository implements a lossy JSON-intermediate path into the pedagogical `mvei-laban-subset` profile. It does not parse proprietary `.lw` binary files and does not claim LabanWriter parity.

| Component | Current state |
|---|---|
| Intermediate JSON fixtures | Implemented for the `0.2.0-lw-intermediate` shape |
| Import CLI | Converts the intermediate JSON to `mvei-laban-subset` |
| Motif mapping | Best-effort `motifToLabanSubset` helper |
| Unknown symbols | Reported in migration provenance rather than silently removed |
| Binary `.lw` parser | Not implemented |
| Full `mvei-laban` output | Not implemented |

Run the local importer from the repository root:

```bash
node --import tsx mvei/packages/labanwriter-import/src/cli.ts \
  mvei/packages/labanwriter-import/fixtures/lw-intermediate-01.json
```

Movement annotation and ELAN-style references remain peer representations. The importer must not relabel non-symbolic annotation as Labanotation.
