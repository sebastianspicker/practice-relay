# MvEI alpha scope

<!-- What: the implemented and unimplemented MvEI alpha boundary. Why: MvEI, MvEI Workbench, and Practice Relay have separate product roles. -->

MvEI is the repository's shared movement encoding, validation, fixture, and reference work. MvEI Workbench is a separate local browser authoring application. Practice Relay can carry MvEI references, but is not the MvEI authoring application.

## Implemented in this alpha

- `mvei-motif` schema, controlled vocabulary, corpus fixtures, validation, local Workbench editing, and pedagogical SVG rendering.
- `mvei-laban-subset` schema, corpus fixtures, validation, local Workbench view, and pedagogical rendering below full notation density.
- `movement_annotation` v0 schema and fixtures as a non-symbolic Practice Relay-native annotation peer.
- Optional Motif and subset time anchors plus the music co-timeline annex.
- Landmark JSON conversion to sketch-quality movement annotations and Motif sketches through `mvei/packages/capture-bridge`.
- Loss-aware import from the repository's LabanWriter intermediate JSON into `mvei-laban-subset`; proprietary `.lw` binary parsing is not implemented.

## Not implemented in this alpha

- `mvei-laban`, full professional Labanotation density, and full LabanWriter parity.
- `mvei-benesh` or another Benesh profile.
- A capture application, capture-device integration, remote Workbench persistence, or external governance and adoption.
- A merged Practice Relay and MvEI Workbench application.

The capture bridge consumes a local landmark document shape only. Its source labels identify the input record and do not establish support, compatibility, or a recommendation for external capture products.
