# MvEI external implementer guide

This guide is for independent schema and corpus consumers. It is not a support,
certification, standards-conformance, or interoperability commitment.

## Inputs

Start with:

- [`../packages/movement/schemas`](../packages/movement/schemas) for the canonical
  Draft 2020-12 schemas;
- [`../packages/movement/fixtures/corpus/index.json`](../packages/movement/fixtures/corpus/index.json)
  for the authoritative fixture catalogue;
- [`../packages/movement/fixtures/corpus/README.md`](../packages/movement/fixtures/corpus/README.md)
  for completeness and profile rules; and
- the [MvEI documentation](movement/README.md) for schema identities,
  limitations, and change review.

Validate each catalogue entry against the schema it names. Treat `sketch` and
`partial` documents as intentionally incomplete but valid. A transformation must
report unsupported material rather than presenting a lossy result as equivalent
to its source.

Maintainers can reproduce the in-tree contract with:

```bash
pnpm check:contracts
pnpm check:build
pnpm check:packages
```

A useful external compatibility report identifies the implementation and runtime,
schema versions, fixture identifiers, the exact command run, the result, and any
unsupported fields or losses. Do not include credentials, participant data,
private contact details, or restricted source material.
