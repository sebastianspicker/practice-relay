# Practice Relay operations

This guide covers local labs and PostgreSQL coordination for multiple API
processes. Read [migration and recovery](multi-process.md) before changing
storage. Deployment, production hardening, and backup scheduling stay with the
operator.

## Runtime modes

The API listens on `127.0.0.1:8787` by default. Direct startup requires either:

- `PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH=1` for local evaluation; or
- both `PRACTICE_RELAY_REQUIRE_SECRETS=1` and
  `PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS=1` with valid configuration.

A non-loopback `PRACTICE_RELAY_HOST` requires those two strict identity flags.
Keep direct host ports loopback-bound and put an operator-controlled,
authenticated TLS reverse proxy in front of anything wider. No proxy or TLS
configuration is provided here.

## Configuration reference

Where the implementation accepts both a file and an inline value, the file wins.
Use files for secrets and configured users.

### Listener and ingress

| Variable | Meaning | Default |
| --- | --- | --- |
| `PRACTICE_RELAY_HOST` | API bind host | `127.0.0.1` |
| `PORT` | API port, integer 1-65535 | `8787` |
| `PRACTICE_RELAY_ALLOWED_HOSTS` | Comma-separated exact additional Host authorities | none |
| `PRACTICE_RELAY_ALLOWED_ORIGINS` | Comma-separated exact browser origins | none |
| `PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH` | Explicit local opt-in to seed users and development secrets | disabled |

### Authentication and secrets

| Variable | Meaning |
| --- | --- |
| `PRACTICE_RELAY_REQUIRE_SECRETS=1` | Reject missing, weak, placeholder, or identical auth and LTI secrets |
| `PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS=1` | Reject built-in synthetic users |
| `PRACTICE_RELAY_AUTH_USERS_FILE` | Private JSON file containing configured users |
| `PRACTICE_RELAY_AUTH_USERS_JSON` | Inline configured-user JSON; file setting takes precedence |
| `SECRET_BACKEND` | `env`, `file`, or test-only `kms-stub` |
| `PRACTICE_RELAY_AUTH_SECRET`, `PRACTICE_RELAY_LTI_SECRET` | Inline HMAC secrets for `env` mode |
| `PRACTICE_RELAY_AUTH_SECRET_FILE`, `PRACTICE_RELAY_LTI_SECRET_FILE` | Secret paths for `file` mode |
| `SECRET_FILE_DIR` | Fallback directory containing `auth` and `lti` files |

Configured users are a non-empty JSON array. Each item requires `userId`,
`displayName`, a supported `defaultRole`, and a versioned `scrypt-v1`
`passwordHash`; plaintext `password` fields are rejected. Generate a hash with
`pnpm hash-password "<password>"` (`packages/auth/scripts/hash-password.mjs`). The committed
`deploy/secrets/example/users.json` shows the shape with placeholder-only values.
The secrets tree is intentionally excluded from documentation links.

### Record and media storage

| Variable | Meaning | Default |
| --- | --- | --- |
| `PRACTICE_RELAY_STORE` | `memory`, `json`, or `postgres` (`pg` alias) | JSON when data is set, otherwise memory |
| `PRACTICE_RELAY_TOPOLOGY` | `single-process` or `multi-process`; multiple processes require PostgreSQL | `single-process` |
| `PRACTICE_RELAY_DATABASE_URL` | PostgreSQL connection string | unset |
| `PRACTICE_RELAY_MEDIA_SHARED_HOST=1` | Explicit shared-host filesystem declaration for multiple processes | disabled |
| `PRACTICE_RELAY_DATA` | JSON record-store root | unset |
| `PRACTICE_RELAY_TENANT_ID` | Namespace within JSON and PostgreSQL adapters; not actor authorization | unset |
| `PRACTICE_RELAY_REQUIRE_DURABLE=1` | Fail readiness unless the active record adapter declares durability | disabled |
| `PRACTICE_RELAY_OBJECT_STORE` | `memory`, `fs`, or `s3` | `fs` |
| `PRACTICE_RELAY_MEDIA` | Filesystem media root, or local lifecycle metadata root for single-process S3 | `data/media` under the process working directory |

S3 mode also requires `PRACTICE_RELAY_S3_ENDPOINT`,
`PRACTICE_RELAY_S3_BUCKET`, `PRACTICE_RELAY_S3_ACCESS_KEY`, and
`PRACTICE_RELAY_S3_SECRET_KEY`. The Compose entrypoint can populate the last two
from their `_FILE` counterparts. Optional controls are
`PRACTICE_RELAY_S3_FORCE_PATH_STYLE`, `PRACTICE_RELAY_S3_REGION`, and
`PRACTICE_RELAY_S3_REQUEST_TIMEOUT_MS`. Single-process S3 keeps its reservations
and media metadata in the private media root; preserve that directory with JSON
record and S3 snapshots. PostgreSQL mode keeps authoritative lifecycle metadata
in the database.

Transfer defaults are four active transfers per process, sixteen per deployment,
and one upload per record. Controls are
`PRACTICE_RELAY_MEDIA_MAX_ACTIVE_TRANSFERS`,
`PRACTICE_RELAY_MEDIA_MAX_ACTIVE_TRANSFERS_DEPLOYMENT`,
`PRACTICE_RELAY_MEDIA_MAX_ACTIVE_UPLOADS_PER_RECORD`, and
`PRACTICE_RELAY_MEDIA_LEASE_MS` (120000 by default). Use a private local staging
root through `PRACTICE_RELAY_MEDIA_STAGING`. Object and per-record limits may be
lowered with `PRACTICE_RELAY_MEDIA_MAX_OBJECT_BYTES` and
`PRACTICE_RELAY_MEDIA_MAX_RECORD_BYTES`; the ceilings stay at 200 MiB and 1 GiB.
Pending reservations and objects awaiting physical deletion remain charged.
Each media download has a 120-second process-side deadline; timed-out streams
release their staging and transfer admission before clients retry.

### Local LTI

| Variable | Meaning |
| --- | --- |
| `PRACTICE_RELAY_LTI_LAUNCH_URL` | Tool launch URL returned by local login initiation |
| `PRACTICE_RELAY_LTI_PLATFORM_AUTH_URL` | Local platform authorization endpoint |
| `PRACTICE_RELAY_LTI_PLATFORM_ISS` | Expected local platform issuer |
| `PRACTICE_RELAY_LTI_CLIENT_ID` | Local tool client identifier |
| `PRACTICE_RELAY_LTI_CLIENT_SECRET` | Local client-credentials secret override |
| `PRACTICE_RELAY_LTI_KEYS_DIR` | Directory containing persisted local RSA keys |
| `PRACTICE_RELAY_LTI_GENERATE_RSA=1` | Generate missing local RSA keys in the configured directory |
| `PRACTICE_RELAY_LTI_RSA_PRIVATE`, `PRACTICE_RELAY_LTI_RSA_PUBLIC` | Explicit PEM values instead of a key directory |
| `PRACTICE_RELAY_LTI_KID` | Key identifier override |

The campus-lab Compose file is the implemented example. These settings do not
turn the simulator into a real LMS registration.

## Health and observability

- `GET /health` reports process liveness.
- `GET /readyz` checks bounded database/coordination access, declared durability
  requirements, media health and root access, and strict-secret readiness.
- `GET /metrics` exposes process-local Prometheus text to an authenticated
  configured operations administrator. Shared storage gauges use a periodic
  snapshot and expose refresh time and failures; quotas never read that cache.
- Request logs are JSON lines.

Metrics and logs do not establish an external monitoring, retention, alerting, or
incident-response system. Readiness does not enumerate all remote media or prove
object integrity. The Prometheus file under `deploy/prometheus/` is a scrape
example, not a monitoring deployment.

## Backup and restore

The authenticated `/ops/backup`, `/ops/backups`, `/ops/restore`, and `/ops/audit`
routes operate only on the durable JSON record store. Restore also requires
`PRACTICE_RELAY_LAB_OPS=1` and a named backup identifier.

Backups contain WorkRecords, events, and audit state; they do not contain
filesystem or object-store media. There is no scheduler, retention policy,
off-host copy, encryption workflow, RPO, or RTO. An operator using the lab stack
must back up media separately and rehearse record plus media recovery in the
target environment.

The production-lab Compose example fixes `PRACTICE_RELAY_LAB_OPS=0`, so restore
stays disabled until an operator deliberately changes and reviews that boundary.

## Start and stop

For direct local evaluation:

```bash
pnpm --filter @practice-relay/relay-api run build
PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH=1 pnpm --filter @practice-relay/relay-api start
```

For the single-host lab stacks, follow [`../../deploy/README.md`](../../deploy/README.md).
The documented `docker compose ... down` commands retain named volumes. The
repository provides no graceful-shutdown coordinator beyond normal Node and
container process handling.

## Operational gaps

Before any production claim, an operator must independently supply and verify
managed identity, confidential security reporting, TLS and proxy policy,
least-privilege runtime configuration, database or single-writer guarantees,
object-storage recovery, backup scheduling and restore drills, monitoring,
alerting, incident ownership, capacity limits, and deployment rollback.
