# Motif → mvei-laban-subset map lossiness

Implemented by `motifToLabanSubset()` in `@practice-relay/movement-encode`.

## Guaranteed losses

See `MOTIF_TO_SUBSET_LOSSINESS` constant (source of truth in code):

- Effort symbols collapse to level only
- Phrase markers → stillness
- Locomotion path geometry discarded
- No floor plan
- Limited multi-limb simultaneity
- Not professional Laban density

## Why this is correct residual behaviour

MvEI residual is MEI-scale governance + ladder, not silent full-density claims. Lossy maps must emit `migrationProvenance.warnings`.
