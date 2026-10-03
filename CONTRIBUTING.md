# Contributing

Thanks for looking at Practice Relay. Contributions can touch Practice Relay,
MvEI, MvEI Workbench, or the shared WorkRecord contracts. Keep those product
boundaries visible in code, tests, and documentation.

## Setup

You need Node.js 24 LTS and pnpm 9.15.0. From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check:all
```

If Corepack cannot write its shims, use a Node.js install where it can rather
than substituting an unpinned package manager.

## Where things live

- `apps/` holds runnable delivery surfaces and process composition.
- `packages/` holds reusable domain, adapter, and interchange contracts.
- `packages/work-record` and `packages/movement` are independent domains.
- Practice Relay and MvEI Workbench are separate applications.
- Movement schemas and vocabulary belong only in `packages/movement`.

Read [Architecture](docs/ARCHITECTURE.md) before moving behavior between
components or changing dependencies.

## Making a change

1. Read the current implementation, manifest scripts, tests, and relevant docs.
2. Leave unrelated worktree changes alone, and keep `@practice-relay/*` exports stable.
3. Add or update tests for observable behavior and edge cases.
4. Run the narrowest relevant workspace test first, then the broadest practical
   root gate from [Testing](docs/testing.md).
5. Update documentation when behavior, routes, exports, commands,
   configuration, or limitations change.

Please do not add production dependencies without maintainer approval, and do
not add product, adoption, certification, compatibility, pilot, or performance
claims the repository cannot support.

For a public API change, update both
[`apps/relay-api/src/public-routes.ts`](apps/relay-api/src/public-routes.ts) and
[`apps/relay-api/openapi.yaml`](apps/relay-api/openapi.yaml). For handoff work,
validate the manifest schema and keep projection loss reporting intact. For
movement-schema work, update the canonical schema, the generated contract, the
corpus, affected consumers, and compatibility notes together.

## Validation

The complete local gate is:

```bash
pnpm check:all
```

It runs `check:types`, `check:build`, `check:packages`, `check:tooling`,
`check:contracts`, `check:docs`, `check:boundaries`, and `check:unit`, in that
order. Use `pnpm check:release` when the public source set is in scope.

For an interface change, run the affected app tests, start the surface, and
inspect it in a browser. `pnpm demo:render-html` produces portable review
snapshots, but it is no substitute for the live application. `pnpm screenshots`
refreshes the README and Pages tour images.

Report failed, skipped, unavailable, and environment-blocked checks separately.
A green local gate does not authorize a commit, tag, push, package publication,
deployment, or GitHub release.

## Community

Follow the [Code of Conduct](CODE_OF_CONDUCT.md). Do not put a vulnerability,
credential, personal data, or participant media in a public issue; the current
reporting limitation is in [SECURITY.md](SECURITY.md).

Documentation entry points are the [root README](README.md),
[architecture](docs/ARCHITECTURE.md), the [Practice Relay guide](docs/relay/README.md),
and the [MvEI guide](docs/movement/README.md).

The repository is licensed under Apache License 2.0. See [LICENSE](LICENSE) and
[NOTICE](NOTICE).
