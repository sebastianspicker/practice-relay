# Synthetic demo pack

This directory contains synthetic product demo data for Practice Relay and MvEI. It contains no real participant media.

| File | Purpose |
|---|---|
| `work-record-seed.json` | Multi-asset WorkRecord seed with tracks, takes, use decisions, a region comment, and an MvEI reference |
| `motif.json` | MvEI Motif document loaded by MvEI Workbench and referenced by Practice Relay |
| `scenario.json` | Synthetic scenario metadata and product-separation assertions |
| `score.musicxml`, `score.mei` | Small peer-notation references used by co-timeline checks |

Media paths intentionally name files that are not stored in the repository. The JSON fixture is a product demo input, not a second implementation model.

Fixture identities such as `faculty-ada` and `student-lee` are synthetic. The package identifier is `ps-demo-week6-duet` for historical fixture compatibility.

Practice Relay, MvEI, and MvEI Workbench remain separate products. The fixture passes an MvEI reference through the shared contract; it does not combine the applications.
