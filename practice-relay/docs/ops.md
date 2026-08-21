<!-- Practice Relay operations guide. Why: records the implemented lab-only runtime boundary and its recovery limits. -->
# Practice Relay operations

Practice Relay currently supports a single-process, lab-only deployment. The
filesystem adapters are suitable for local evaluation and controlled lab work.
They do not provide the locking, shared state, or recovery guarantees required
for a multi-replica service.

## Start the API

The API listens on `127.0.0.1:8787` by default.

```bash
PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH=1 pnpm --filter @practice-relay/api start
```

Direct startup requires either both strict identity flags or the explicit
synthetic-auth opt-in above. This keeps the shipped development users and
development signing secret out of an accidental direct runtime.

`PRACTICE_RELAY_HOST` and `PORT` change the listener. A non-loopback host is
accepted only when both strict deployment flags are enabled:

```text
PRACTICE_RELAY_REQUIRE_SECRETS=1
PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS=1
```

Browser CORS is denied unless `PRACTICE_RELAY_ALLOWED_ORIGINS` contains the
request `Origin` exactly. Use a comma-separated list of origins, for example
`http://127.0.0.1:5173`. Accepted browser responses include `Vary: Origin`.
Requests with a non-loopback `Host` header are also rejected unless that exact
host and optional port appears in `PRACTICE_RELAY_ALLOWED_HOSTS`. Non-browser
API clients do not need an `Origin` header.

Valid ports are integers from 1 through 65535. The server uses a 15-second
header timeout, a 120-second request timeout, and a 5-second keep-alive
timeout.

## Record storage

The record-store selection rules are:

| Configuration | Selected store |
|---|---|
| Neither `PRACTICE_RELAY_STORE` nor `PRACTICE_RELAY_DATA` | In-memory |
| `PRACTICE_RELAY_STORE=memory` | In-memory |
| `PRACTICE_RELAY_STORE=json` | JSON filesystem |
| `PRACTICE_RELAY_DATA` without an explicit store | JSON filesystem |
| `PRACTICE_RELAY_STORE=postgres`, `pg`, or `sqlite` | Startup failure because no adapter is shipped |

Set the backend explicitly in deployment scripts. Other unrecognized store
values currently fall back to the data-based default.

For the JSON store, `PRACTICE_RELAY_DATA` selects the root. If it is absent,
the root is `./data/practice-relay` relative to the process working directory.
`PRACTICE_RELAY_TENANT_ID` adds one static path segment when the store is
created. It is not request-level tenancy and it does not scope media.

```text
{root}/[tenantId/]records/{id}.json
{root}/[tenantId/]events/{id}.jsonl
{root}/[tenantId/]audit/audit.jsonl
{root}/[tenantId/]backups/{ISO-stamp}-{8-hex}/
```

The `RecordStoreAdapter` contract is exported by
`@practice-relay/record-store`. The JSON implementation is
`createDurableRecordStore`. The in-memory implementation is a supported
non-durable runtime mode and is also used by tests.

New JSON-store directories are created with mode `0700`. New record, event,
audit, manifest, restore, and backup files are created with mode `0600`.
Existing paths are not automatically repaired if their modes are broader.

## Backup and restore

Record backups include records, per-record event logs, the global audit log,
and a manifest. They do not include media. Backup and restore do not quiesce
writers.

The HTTP operations routes require an authenticated configured user whose
`defaultRole` is `admin`:

```bash
curl -X POST http://127.0.0.1:8787/ops/backup \
  -H "authorization: Bearer $PRACTICE_RELAY_ADMIN_SESSION"

curl http://127.0.0.1:8787/ops/backups \
  -H "authorization: Bearer $PRACTICE_RELAY_ADMIN_SESSION"
```

Restore is disabled unless `PRACTICE_RELAY_LAB_OPS=1`:

```bash
curl -X POST http://127.0.0.1:8787/ops/restore \
  -H "authorization: Bearer $PRACTICE_RELAY_ADMIN_SESSION" \
  -H 'content-type: application/json' \
  -d '{"backupId":"<backup directory name>"}'
```

The HTTP boundary validates the backup identifier format, containment, and
resolved path beneath the configured backup root. It does not establish
cryptographic provenance. Restore validates record JSON, JSONL data, and the
manifest inventory before replacing `records`, `events`, and `audit`. It does
not restore media, enforce the manifest tenant value, lock concurrent writers,
or provide automatic rollback.

Do not use the in-memory adapter when durable backup behavior is required. Its
backup metadata exists only in process memory and restore does not reconstruct
records.

The repository does not ship automated recovery or SLO drills. The planning
targets and remaining evidence limits are recorded in [slo.md](slo.md); validate
them only in an operator-controlled environment.

## Media storage

`PRACTICE_RELAY_OBJECT_STORE` accepts `fs`, `memory`, or `s3`. The default is
`fs`. The filesystem root is `PRACTICE_RELAY_MEDIA`, or `./data/media` when the
variable is absent.

The media adapter supports `put`, `get`, `getByTake`, `listForRecord`,
`softDelete`, `hardDelete`, `purgeDeleted`, `totalBytesForRecord`, and optional
`totalBytesAll` operations.

Direct filesystem media uses this layout:

```text
{root}/{recordId}/{takeId}-{8-hex}.bin
{root}/{recordId}/{takeId}-{8-hex}.bin.meta.json
```

Object and S3 adapters store the object and metadata at the storage key, with
per-record manifests under `__media-index/{recordId}.json` and a catalogue at
`__media-index/~catalog.json`. The runtime does not add a tenant or configurable
key prefix.

New filesystem media directories use mode `0700`; new media and metadata files
use `0600`. Pre-existing path modes are not repaired automatically.

The HTTP media routes are:

| Method and path | Behavior |
|---|---|
| `POST /work-records/:id/takes/:takeId/media` | Mutation-authorized upload |
| `GET /media/*` | Bearer-authenticated download with record membership and exact take/key checks |

The API admits at most one active upload per process. Request bodies are capped
at 200 MiB, retained media is capped at 1 GiB per record, and upload and
download bodies are buffered in memory. The server creates `media://` metadata
for stored keys. There is no implemented CDN rewriting, signed URL, presigned
download, or `PRACTICE_RELAY_MEDIA_CDN` contract.

S3 mode requires `PRACTICE_RELAY_S3_ENDPOINT`,
`PRACTICE_RELAY_S3_BUCKET`, `PRACTICE_RELAY_S3_ACCESS_KEY`, and
`PRACTICE_RELAY_S3_SECRET_KEY`. The region defaults to `us-east-1` and path
style defaults to enabled. S3 responses are buffered and the adapter does not
set a request timeout or use conditional writes.

## Health, readiness, metrics, and logs

| Endpoint | Access | Scope |
|---|---|---|
| `GET /health` | Public | Service version and non-secret runtime labels |
| `GET /readyz` | Public | Record-store, media-root, and secret-mode probes |
| `GET /metrics` | Authenticated configured admin | Process-local Prometheus metrics |
| `GET /ops/audit` | Authenticated configured admin | Store audit events |

`/health` identifies the product tier as `lab-only`. Its `durable` label, and
the readiness `durableConfigured` label, reflect whether
`PRACTICE_RELAY_DATA` is configured rather than proving the selected backend.
Feature detection also reports durable methods on the in-memory adapter. Use
explicit backend configuration and an actual backup/restore drill as the
durability check.

The exact metrics are:

- `practice_relay_request_count{method,path,status}`
- `practice_relay_request_latency_ms_bucket`, `_sum`, and `_count`
- `practice_relay_record_count`
- `practice_relay_media_bytes`
- `practice_relay_audit_events`

Request counters, metrics, login throttles, collaboration rooms, OIDC
state/nonce, upload admission, and the in-memory stores are process-local.
Request logs are JSON lines containing `ts`, `level`, `msg`, `requestId`,
`method`, `path`, `status`, and `ms`. A caller-provided `x-request-id` is
accepted and echoed.

## Secrets and configured users

`SECRET_BACKEND` accepts `env`, `file`, or `kms-stub`. If it is absent,
`SECRET_SOURCE=file` or `SECRET_SOURCE=kms-stub` also selects that backend.
Otherwise `SECRET_SOURCE` is an operator-provided provenance label.

| Backend | Inputs |
|---|---|
| `env` | `PRACTICE_RELAY_AUTH_SECRET`, `PRACTICE_RELAY_LTI_SECRET` |
| `file` | Per-secret `_FILE` variables or `SECRET_FILE_DIR/{auth,lti}`, with environment fallback for an unset file path |
| `kms-stub` | Per-secret `_CIPHER` values plus `KMS_STUB_KEY`; local and test use only |

Strict secret mode requires two resolved secrets that are distinct,
non-placeholder values of at least 32 characters. Auth users are loaded from
`PRACTICE_RELAY_AUTH_USERS_FILE` before
`PRACTICE_RELAY_AUTH_USERS_JSON`. Strict configured-user mode rejects missing
configuration. Secret and user-file readers do not validate file ownership or
mode, so deployment tooling must set and verify those permissions.

LTI RSA configuration uses `PRACTICE_RELAY_LTI_RSA_PRIVATE`,
`PRACTICE_RELAY_LTI_RSA_PUBLIC`, `PRACTICE_RELAY_LTI_KEYS_DIR`,
`PRACTICE_RELAY_LTI_GENERATE_RSA=1`, and optional
`PRACTICE_RELAY_LTI_KID`. Created key directories use `0700`, private keys
use `0600`, and public keys use `0644`.

Do not commit secret values or created private keys. See
[lab-only-tier.md](lab-only-tier.md) and
[lti-lms-registration.md](lti-lms-registration.md) for the current setup
boundary.

## LTI lab routes

| Method | Path | Purpose |
|---|---|---|
| `GET` or `POST` | `/lti/login` | Local OIDC login initiation |
| `GET` | `/lti/jwks` | Platform public keys or the local HS256 status response |
| `POST` | `/lti/launch` | Token verification with one-time process-local state and nonce |
| `POST` | `/lti/oauth/token` | Local AGS client-credentials token |
| `POST` | `/lti/ags/scores` | Local AGS score endpoint |
| `POST` | `/work-records/:id/lti` | Mutation-authorized launch registration or simulated AGS passback |

The mock platform defaults to `127.0.0.1:8790` and accepts
`MOCK_PLATFORM_HOST` and `MOCK_PLATFORM_PORT`. It does not apply the API's
strict non-loopback host guard.

```bash
pnpm --filter @practice-relay/lti-mock-platform start
```

The local mock is not a Canvas integration. See
[lab-only-tier.md](lab-only-tier.md) for the local evaluation
boundary.

## Deployment limits

Run one API writer with the JSON and filesystem media adapters. Revision checks
reject stale supplied record revisions inside a process, but the filesystem
read/check/rename sequence has no cross-process lock or compare-and-swap.
Object media mutations use process-local queues, and S3 mode has no conditional
write protection.

Replacing only `RecordStoreAdapter` is not enough for multiple replicas. A
multiwriter deployment would also require shared or coordinated media indexes,
OIDC state, rate limits, collaboration state, upload admission, and metrics.
Those capabilities are not implemented in this alpha.

The example compose boundary and its limitations are documented in
[deploy/README.md](../../deploy/README.md).
