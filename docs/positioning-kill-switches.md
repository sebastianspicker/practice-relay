# Positioning kill-switches

Status: permanent release contract for the Practice Relay and MvEI repositories.

These rules prevent the current software from being described as a replacement for adjacent systems or as an implementation of features that are not shipped.

## Authority

| Scope | Current authority |
|---|---|
| Practice Relay product boundary | [`../PRODUCT.md`](../PRODUCT.md) |
| MvEI encoding boundary | [`../mvei/docs/scope.md`](../mvei/docs/scope.md) |
| Repository-wide names and forbidden claims | This document and maintained product copy |
| Package and video distinction | [`../practice-relay/docs/package-vs-video.md`](../practice-relay/docs/package-vs-video.md) |

Practice Relay is a bounded WorkRecord handoff application. MvEI is movement-encoding infrastructure. MvEI Workbench is the separate MvEI authoring application. WorkRecord Core is a shared domain package, not a user-facing product.

## Practice Relay gates

| Gate | Required behavior | Enforcement |
|---|---|---|
| Q3 and Q8 | Roles constrain record mutation; submitted snapshots remain immutable | Domain and API tests |
| Q5 | Residual fixtures contain at least four track types | Acceptance Q5 |
| Q6 | Export remains blocked without an exportable use-policy snapshot | API and acceptance tests |
| Q7 and Q14 | Export produces a WorkRecord package with the current profile URI | Package and acceptance tests |
| Q9 | Analysis routes cannot overwrite media | API rejection test |
| Q10 | The application states which system categories it does not replace | Web and acceptance tests |
| Q11 | The package and single-video boundary remains documented and indexed | Maintained documentation and acceptance test |
| Q12 | OTIO, EAF, OSC, and bounded in-process Yjs behavior remain documented accurately | Architecture documentation and acceptance test |
| Q13 | The maintained neighbour map names adjacent products; the application keeps the category boundary visible | This document, web copy, and acceptance test |
| Q15 | `movement_annotation` is not labelled as Labanotation | WorkRecord Core constants and tests |
| Q16 | Automated coaching or feedback is not Practice Relay product chrome | Web strings and repository claim guard |
| Q17 | The synthetic multi-asset fixture remains available | Fixture and acceptance test |
| Brand boundary | Practice Relay and MvEI Workbench remain separate applications | Repository claim guard and evidence validation |
| LTI boundary | Shipped LTI support remains a local mock, not evidence of IMS certification | Health state, tests, and lab-tier documentation |

The neighbour map includes GoReact, Echo360, ossia score, DigiScore, Motion Bank, Dorico, Newzik, and LabanWriter. Naming a neighbour is not a compatibility, replacement, or superiority claim.

## Forbidden application claims

The application and current release documentation must not claim any of the following:

- `first digital score` or `first collaborative score`
- `first browser Laban editor` or `first LabanXML`
- that Practice Relay replaces GoReact, Echo360, ossia, DigiScore, Motion Bank, Dorico, Newzik, or LabanWriter
- that LabanLite or MARC 358 is MvEI
- that automated coaching is a Practice Relay product
- that Practice Relay and MvEI Workbench are one application

The web guard is `FORBIDDEN_UI_STRINGS` plus `assertNoForbiddenCopy` in `practice-relay/apps/web/src/shell.mjs`. The domain mirror is `FORBIDDEN_STRINGS` in `@practice-relay/work-record-core`. Do not remove either enforcement path.

## MvEI gates

| Gate | Required behavior | Enforcement |
|---|---|---|
| MvEI Q1 | Schemas validate the maintained corpus | `pnpm validate:schemas` |
| MvEI Q2 | The validator rejects invalid Motif input | Validator tests |
| MvEI Q3 | Sketch and partial Motif documents remain valid | Corpus fixtures |
| MvEI Q4 | At least three pedagogical samples remain available | Corpus count in schema validation |
| MvEI Q5 | Practice Relay can carry a real MvEI Motif reference | Fixture and attachment-path tests |
| MvEI Q6 | The schema site identifies relevant neighbours and non-equivalences | Schema-site content and tests |
| MvEI Q7 | Capture guidance consumes external capture tools rather than claiming a replacement | Capture documentation |
| MvEI Q8 | MvEI and MvEI Workbench make no browser-editor firstness claim | Schema-site, Workbench, and claim guard |
| MvEI Q9 and Q10 | Annotation links remain optional; profiles and the corpus remain inspectable | Schemas and schema site |
| Dual RFC | Breaking a shared schema requires Practice Relay and MvEI review | [`../mvei/docs/dual-rfc.md`](../mvei/docs/dual-rfc.md) |

## Verification

| Command or test | Contract checked |
|---|---|
| `packages/work-record-core` tests | Domain forbidden strings and movement-annotation label |
| `pnpm validate:evidence` | Required evidence and product-boundary links |
| `pnpm release:check` | Local type, build, quality, schema, documentation, evidence, contract, and public-hygiene checks |

Current entrypoints must use the maintained names and must not present rejected
directions as implemented behavior.

## Related documents

- [`../practice-relay/docs/acceptance-criteria.md`](../practice-relay/docs/acceptance-criteria.md)
- [`../practice-relay/docs/package-vs-video.md`](../practice-relay/docs/package-vs-video.md)
- [`pilot-pack/README.md`](pilot-pack/README.md)
- [`publish-and-consume.md`](publish-and-consume.md)
