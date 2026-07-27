# External MvEI review

External review checks whether an implementation can consume the published
schemas and corpus without relying on application-local behavior. It is not a
standards certification or evidence of adoption.

## Suitable review scope

A reviewer may provide any of the following:

- a corpus validation result from an independent Draft 2020-12 validator;
- a read-only Motif or Laban-subset consumer;
- an engraver or conversion experiment with explicit loss reporting;
- a compatibility report for a proposed schema change.

Reviewers should use the shared interfaces documented in
[`external-implementer-kit.md`](external-implementer-kit.md). Practice Relay
and MvEI Workbench private modules are outside the external contract.

## Required report fields

Submit compatibility feedback with
[`mvei/docs/rfcs/external-review-log.template.md`](../mvei/docs/rfcs/external-review-log.template.md).
Include:

- implementation or project name;
- public contact or durable project handle;
- validator and runtime versions;
- schema versions and fixture identifiers tested;
- pass, fail, or partial result;
- unsupported fields and conversion losses;
- reproducible commands or source references.

Do not include credentials, private contact information, participant data, or
unpublished institutional records.

## Breaking-change review

When a proposed change would invalidate an existing document or consumer,
follow [`mvei/docs/dual-rfc.md`](../mvei/docs/dual-rfc.md). A reviewer records
its stance in `mvei/docs/rfcs/signatures/` using the format in
[`signatures/README.md`](../mvei/docs/rfcs/signatures/README.md).

Valid stances are:

- `support`
- `support-with-migration`
- `block`

The stance must identify the schema change and the affected consumer. A
signature file does not establish a consortium, certification, or standards
body.

## Repository checks

Maintainers can reproduce the in-repository interfaces with:

```bash
pnpm validate:schemas
pnpm publish:dry-run
pnpm corpus:site
```

The current packages remain private. These commands validate the source
workspace and do not publish packages.
