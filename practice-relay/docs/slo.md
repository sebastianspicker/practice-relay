# Practice Relay lab operations objectives

Status: planning objectives for a single-host lab evaluation. They are not measured service commitments, a production support policy, or evidence of multi-region recovery.

## Recovery objectives

| Metric | Planning target | Boundary |
|---|---|---|
| Recovery point objective | 24 hours | Assumes a daily external backup of record JSON and media |
| Recovery time objective | 4 hours | Assumes an operator can restore record JSON and reattach the media volume on one lab host |

`pnpm test:ops-restore` exercises backup, deletion, restore, and tenant isolation in a temporary directory. Its elapsed time is unit-test evidence only. It does not validate these operational targets.

## Signals

| Signal | Source |
|---|---|
| Liveness and release identity | `GET /health` |
| Store, media, and strict-configuration readiness | `GET /readyz` |
| Request count and latency | Authenticated `GET /metrics` |
| Record, media, and audit counts | `practice_relay_record_count`, `practice_relay_media_bytes`, and `practice_relay_audit_events` |

The metrics endpoint requires an administrator session and must not expose secret values.

## Checks

```bash
pnpm test:ops-slo
pnpm test:ops-restore
```

The default SLO check uses the API handler directly, forces in-memory stores, removes ambient application and secret-file settings, and disables network access. A live check is a separate, explicit command and also requires `PRACTICE_RELAY_ADMIN_SESSION`:

```bash
PRACTICE_RELAY_API_URL=http://127.0.0.1:8787 \
PRACTICE_RELAY_ADMIN_SESSION=<admin-session> \
pnpm test:ops-slo:live
```

Do not put a real session value in tracked documentation, shell history intended for sharing, or issue output.

## Restore drill

1. Confirm that `PRACTICE_RELAY_DATA` and `PRACTICE_RELAY_MEDIA` identify durable local paths.
2. Confirm `GET /readyz` returns `ok: true` with ready store and media checks.
3. Authenticate as a configured administrator and call `POST /ops/backup`.
4. Record the returned backup identifier and confirm `backup-manifest.json` exists under the backup directory.
5. Quarantine a copy of the live `records/` directory or restore into a separate data root. Do not test destructive recovery against the only copy.
6. Set `PRACTICE_RELAY_LAB_OPS=1`, call `POST /ops/restore`, and verify a known record through `GET /work-records/:id`.
7. Restore or reattach media separately, then verify one authorized media request.
8. Record the backup age, elapsed restore time, errors, and operator actions. A unit drill is not a measured lab RPO or RTO result.

## Incident checks

| Symptom | Check | Response boundary |
|---|---|---|
| `/readyz` returns 503 | Inspect the boolean readiness checks | Correct local configuration before accepting traffic |
| Store check is false | Inspect the configured data root and tenant id | Stop mutation if corruption is suspected; restore from a verified copy |
| Media check is false | Inspect the media volume or S3-compatible endpoint and bucket | Keep the object store private and verify authorization before retrieval |
| Record list is unexpectedly empty | Compare `PRACTICE_RELAY_TENANT_ID` with the on-disk tenant path | Correct the tenant selection; do not merge tenant directories |
| Compose service is unhealthy | Review local Compose logs without printing secret values | Correct bucket, mount, or strict-secret configuration |

There is no 24-hour on-call service, escalation roster, or response-time commitment in this repository. Institution-specific contacts must be established outside the source tree before a real lab deployment.

## Storage and database boundaries

- Tenant ids scope durable paths on one host. This is not a managed multi-tenant control plane.
- Filesystem record and media stores are single-writer local adapters. Do not mount one data directory into multiple API writers.
- S3-compatible media support is optional and requires explicit endpoint, bucket, and credential configuration.
- New sensitive local directories use owner-only `0700` permissions and new sensitive files use `0600`. Encryption at rest and host access control remain operator responsibilities.
- `createPostgresRecordStore()` is exported but intentionally throws. No Postgres driver or database implementation is shipped.

See [`ops.md`](ops.md), [`../../deploy/README.md`](../../deploy/README.md), and [`../packages/record-store/src/postgres-adapter.stub.md`](../packages/record-store/src/postgres-adapter.stub.md) for the current local adapters and configuration.
