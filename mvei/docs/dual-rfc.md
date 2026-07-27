# Dual-RFC process (MvEI / shared contracts)

## When required

Any breaking change to:

- `@practice-relay/movement-encode` schemas or Motif vocabulary
- `@practice-relay/work-record-package`
- `@practice-relay/use-policy`
- `@practice-relay/time-core`
- Public validator behaviour that rejects previously valid corpus

## Steps

1. Open RFC note under `mvei/docs/rfcs/` or PR description with BREAKING tag.
2. List affected consumers: Practice Relay, MvEI Workbench, engraver, labanwriter-import, capture-bridge.
3. Provide migration: Motif map lossiness / schemaVersion bump.
4. Practice Relay lead + MvEI lead explicit ACK in PR.
5. Expand corpus fixtures; `pnpm validate:schemas` green.
6. Update schema-site profiles table.

## Non-breaking

Additive optional fields, new laban-subset symbols with enum extension + fixtures, new exporters - single maintainer OK with review.

## External multi-implementation reviewers

External implementers (second/third validators, engravers, importers) should open a review issue when consuming public schemas/corpus. Use the field template below so maintainers can triage without a full dual-RFC for non-breaking feedback.

### Issue template fields

Copy into GitHub/GitLab issue body (or `mvei/docs/rfcs/` note for formal RFC):

| Field | Required | Description |
|-------|----------|-------------|
| Title | yes | `[mvei-review] <short topic>` or `[BREAKING] <topic>` |
| Implementer | yes | Org/project name + contact |
| Package / surface | yes | e.g. `@practice-relay/movement-encode` schemas, corpus index, engraver SVG, labanwriter intermediate |
| Profile(s) | yes | `mvei-motif` / `mvei-laban-subset` / `movement_annotation` / annex |
| Corpus ids used | yes | From `fixtures/corpus/index.json` (e.g. `laban-subset-04`) |
| Schema versions | yes | Document `schemaVersion` constants exercised |
| Validator engine | recommended | Ajv / other Draft 2020-12 engine + version |
| Interoperability result | yes | pass / fail / partial - attach failing fixture snippet |
| Proposed change | if any | Additive field vs breaking; migration sketch |
| Lossiness acknowledged | for Motif→subset | Confirm read of `MOTIF_TO_SUBSET_LOSSINESS` |
| Non-claims check | yes | No first-browser-Laban / LabanLite=MvEI / Practice Relay-merge claims in your docs |
| Dual-RFC needed? | yes | `no` (feedback only) / `yes` (breaking consumer impact) |
| Attachments | optional | Diff, second-impl repo link, CI log |

### Reviewer checklist (paste into issue)

```markdown
## External MvEI review

- Implementer:
- Package / surface:
- Profile(s):
- Corpus ids:
- Schema versions:
- Validator engine:
- Result: pass | fail | partial
- Failing detail: (fixture id + error text)
- Proposed change: none | additive | breaking
- MOTIF_TO_SUBSET_LOSSINESS read: yes | n/a
- Non-claims OK: yes
- Dual-RFC needed: no | yes
- Links:
```

### When review becomes dual-RFC

Escalate to the dual-RFC steps above if the change would reject previously valid corpus, rename required fields, or change profile discriminators. Additive optional fields + new fixtures alone stay non-breaking.

## External review log file

Use the template at [`rfcs/external-review-log.template.md`](rfcs/external-review-log.template.md) for durable logs under `mvei/docs/rfcs/`.

## Signature files

External implementer stance files live under
[`rfcs/signatures/`](rfcs/signatures/). Submission requirements are documented
in [`docs/recruit-external-implementers.md`](../../docs/recruit-external-implementers.md).
