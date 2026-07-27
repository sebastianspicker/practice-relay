# MvEI architecture

MvEI (Movement Encoding Initiative) owns movement schemas, validation, fixtures, and reference implementations. MvEI Workbench is a separate browser application that consumes those contracts.

| Component | Path | Current responsibility |
|---|---|---|
| Shared schemas and vocabulary | `packages/movement-encode` | Motif, pedagogical laban-subset, movement annotation, co-timeline annex, vocabulary, and corpus |
| Validator | `mvei/packages/validator` | CLI and library schema validation |
| Engraver and glyphs | `mvei/packages/engraver`, `mvei/packages/glyph-font` | Pedagogical SVG rendering |
| LabanWriter import | `mvei/packages/labanwriter-import` | Lossy intermediate-to-subset conversion |
| Reference reader | `mvei/packages/reference-reader` | Read-only summary implementation |
| Schema site | `mvei/apps/schema-site` | Created reference page for shipped profiles and fixtures |
| MvEI Workbench | `mvei/apps/workbench` | Local Motif editing, Motif and laban-subset views, and browser session save/load |

MvEI Workbench imports the controlled Motif vocabulary from `packages/movement-encode`. The application does not own a separate schema copy.

Practice Relay may carry an MvEI document reference in a WorkRecord package. That reference does not merge the applications or make Practice Relay the movement editor.

External capture tools may produce inputs for conversion, but no capture platform is embedded in this repository. Full professional Labanotation density, full LabanWriter parity, remote Workbench persistence, and an externally governed standard are not implemented claims.
