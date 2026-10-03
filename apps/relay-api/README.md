# Relay API

`@practice-relay/relay-api` is the Node HTTP composition boundary for Practice
Relay. It wires authentication, WorkRecord behavior, record and media stores,
handoff exports, local LTI helpers, ingress policy, readiness, and metrics.

## Run

From the repository root:

```bash
PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH=1 pnpm --filter @practice-relay/relay-api dev
```

Direct startup needs either strict configured identity or the explicit synthetic
local opt-in. To run the emitted production-shaped runtime instead:

```bash
pnpm --filter @practice-relay/relay-api run build
PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH=1 pnpm --filter @practice-relay/relay-api start
```

The listener defaults to `127.0.0.1:8787`. Read the
[operations guide](../../docs/relay/operations.md) before configuring durable
storage, object storage, configured users, secrets, or non-loopback access.

## Contracts

- [`src/public-routes.ts`](src/public-routes.ts) owns the public path and method registry.
- [`openapi.yaml`](openapi.yaml) owns the human- and machine-readable HTTP contract.
- Route handlers do transport translation; application orchestration belongs under `src/application`.
- WorkRecord rules and authorization stay in `@practice-relay/work-record`.
- `@practice-relay/record-store` and `@practice-relay/media-store` own side effects; `@practice-relay/handoff` owns package and projection output.

Add a public operation to the registry and the OpenAPI document together, then
run `pnpm check:contracts`. See
[API and contracts](../../docs/relay/api-and-contracts.md).

## Verify

```bash
pnpm --filter @practice-relay/relay-api typecheck
pnpm --filter @practice-relay/relay-api test
pnpm --filter @practice-relay/relay-api run build
```

The build emits `dist/index.mjs` plus the required schema assets and runs the
production-runtime check. The package is private and ships only through the
repository's lab examples.
