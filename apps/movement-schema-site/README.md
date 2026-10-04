# MvEI schema site

`@practice-relay/movement-schema-site` is a local static reference for MvEI
profiles, schemas, vocabulary, corpus fixtures, and implementation limits. The
packaged schemas and corpus are authoritative; the site summarizes them.

## Run and generate

From the repository root:

```bash
pnpm --filter @practice-relay/movement-schema-site dev
```

The server defaults to `http://127.0.0.1:5174`; set `MVEI_SCHEMA_SITE_PORT` to
change the port. It mounts the movement corpus from
`packages/movement/fixtures/corpus`.

Regenerate the checked-in page after changing `src/content.mjs` or a rendered
content contract:

```bash
pnpm --filter @practice-relay/movement-schema-site generate
```

This overwrites `index.html`. Review the generated diff rather than editing the
page by hand.

The site is a local reference implementation, not a standards publication or a
compatibility certification.
