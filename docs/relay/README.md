# Practice Relay

Current source candidate: `0.4.0-alpha.1`.

Practice Relay accepts authenticated record operations, applies WorkRecord
membership and policy rules, persists approved changes, stores authorized media,
and exports a verifiable handoff. Delivery, domain, persistence, and interchange
responsibilities are deliberately separate.

| Surface | Responsibility | Documentation |
| --- | --- | --- |
| `apps/relay-api` | HTTP ingress, runtime composition, record routes, observability, safety gates | [`apps/relay-api/README.md`](../../apps/relay-api/README.md) |
| `apps/relay-web` | Authenticated workspace with an explicit synthetic demo | [`apps/relay-web/README.md`](../../apps/relay-web/README.md) |
| `apps/lti-simulator` | Local LMS-shaped registration, launch, and AGS driver | [`apps/lti-simulator/README.md`](../../apps/lti-simulator/README.md) |
| `packages/work-record` | Aggregate, parser, membership authorization, time, policy, media-reference, and store contracts | [`packages/work-record/README.md`](../../packages/work-record/README.md) |
| `packages/handoff` | Manifest integrity, RO-Crate, ZIP, imports, and declared-loss projections | [`packages/handoff/README.md`](../../packages/handoff/README.md) |
| `packages/auth` | Local HMAC bearer authentication and configured-user validation | [Operations](operations.md) |
| `packages/record-store` | Memory, JSON, and PostgreSQL WorkRecord persistence | [Operations](operations.md) |
| `packages/media-store` | Filesystem, memory, and S3-compatible media storage | [Operations](operations.md) |
| `packages/lti` | Local OIDC, JWT, assignment, and AGS helpers | [Simulator docs](../../apps/lti-simulator/README.md) |

Start with [Architecture](architecture.md) for the subsystem flow,
[API and contracts](api-and-contracts.md) for the public surface, and
[Operations](operations.md) before enabling durable state, object storage,
configured identities, or a non-loopback listener. The
[optimization validation record](implementation-validation.md) keeps local
implementation measurements separate from service verification.

## Local commands

```bash
pnpm --filter @practice-relay/relay-api run build
PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH=1 pnpm --filter @practice-relay/relay-api start
pnpm --filter @practice-relay/relay-web dev
pnpm --filter @practice-relay/lti-simulator start
```

The simulator is optional and local-only: a test surface, not a real LMS
integration or certification implementation.
