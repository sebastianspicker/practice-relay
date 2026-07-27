# Synthetic demo pack

This directory contains the synthetic fixture set used by the Practice Relay and MvEI automated demonstrations. It contains no real participant media.

| File | Purpose |
|---|---|
| `work-record-seed.json` | Multi-asset WorkRecord seed with tracks, takes, use decisions, a region comment, and an MvEI reference |
| `motif.json` | MvEI Motif document loaded by MvEI Workbench and referenced by Practice Relay |
| `scenario.json` | Synthetic scenario metadata and product-separation assertions |
| `score.musicxml`, `score.mei` | Small peer-notation references used by co-timeline checks |

Media paths intentionally name files that are not stored in the repository. The e2e runner constructs the WorkRecord through `@practice-relay/work-record-core`; the JSON fixture is not a second implementation model.

Fixture identities such as `faculty-ada` and `student-lee` are synthetic. The package identifier is `ps-demo-week6-duet` for historical fixture compatibility.

Run the current scenario from the repository root:

```bash
pnpm demo:e2e
```

An optional ignored local log can be written under the fixture directory:

```bash
pnpm demo:e2e -- --log fixtures/demo/last-e2e-demo.txt
```

The demo rejects output paths outside the repository and paths that cross
protected or symbolic-link boundaries.

Practice Relay, MvEI, and MvEI Workbench remain separate products. The fixture passes an MvEI reference through the shared contract; it does not combine the applications.
