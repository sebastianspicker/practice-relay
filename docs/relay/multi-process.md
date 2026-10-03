# Multiple API processes and migration

Node 24 LTS and PostgreSQL 18 are the infrastructure baseline. WorkRecord and
movement document schemas are unchanged. The asynchronous adapter interfaces and
the collection HTTP response are coordinated breaking changes for this alpha.

## Coordination boundary

Set `PRACTICE_RELAY_TOPOLOGY=multi-process` and
`PRACTICE_RELAY_STORE=postgres`. Every process must share the same database,
tenant namespace, configured users, authentication secret, and LTI settings.
`PRACTICE_RELAY_DATABASE_URL` selects the database. Missing migrations or
unavailable database coordination prevent startup; there is no fallback adapter.
Memory and JSON remain single-process lab adapters.

`packages/database` owns pooling and transactions. `record-store` owns record SQL
and canonical JSONB, membership and summary indexes, revisions, and audit events.
`runtime-state` owns login admission and single-use LTI state. `media-store` owns
media metadata and transfer coordination. Applications compose these packages,
and the domain has no database dependency.

A mutation locks the canonical record, rechecks the current actor's membership
and permission, applies the command, validates the result, and commits its next
revision and audit event together. An optional `If-Match: "7"` requests revision
7, and a stale precondition returns HTTP 409; PATCH also accepts a numeric
`revision`. Without a precondition the command applies to the latest record. The
membership index accelerates collection access but is not the authority for
mutations. PostgreSQL row locks are held until the transaction ends; see
[the PostgreSQL 18 locking reference](https://www.postgresql.org/docs/18/explicit-locking.html).

Login derives scrypt keys asynchronously with four active derivations and a
bounded per-process queue. Admission counts both failures and in-flight work
against shared account and source limits. LTI state is consumed before token
validation, including when the token is invalid.

## Client migration

`GET /work-records` returns `{ items, nextCursor }`, where each item carries only
`id`, `title`, and `revision`. Fetch the complete canonical document from
`GET /work-records/{id}`. The default page size is 50 and `limit` accepts 1
through 100. IDs use ascending keyset order, and `title` is a case-insensitive
substring filter. Supply `cursor` for a later page and keep the same title filter.
Cursors are signed and bound to the actor, filter, and tenant, and membership is
checked again for every page. Concurrent changes can alter later pages; this is
not a frozen export snapshot.

All record persistence, audit, backup, and authentication login methods return
Promises. Await operations, including errors, before serializing a response. Use
`mutate` for command transitions against the latest record. An adapter's `update`
accepts an explicit revision and is meant for trusted adapter consumers; HTTP
authorization lives in the application transaction callback.

Relay Web keeps bearer tokens and private detail caches only in memory. Logout,
expiry, or authentication failure clears both. The synthetic demonstration is an
explicit action and never substitutes for a failed authenticated request.

## Storage topology and recovery

Use S3-compatible storage across hosts. Filesystem storage is allowed only when
all writers share the same host and media root, selected explicitly with
`PRACTICE_RELAY_MEDIA_SHARED_HOST=1`. A record database backup does not contain
media bytes, so preserve matching database and object/filesystem snapshots.

JSON backup and restore remain explicit lab operations. PostgreSQL never uses the
JSON filesystem backup or restore routes; use PostgreSQL-native tools and rehearse
restoration into a disposable database before relying on recovery. See
[PostgreSQL backup and restore](https://www.postgresql.org/docs/18/backup.html).

For rollback, stop all writers, restore the validated prior database and media
snapshot together, and start the compatible application version. Never silently
switch a PostgreSQL deployment to JSON or memory. These configuration and test
artifacts do not deploy infrastructure, migrate user data, schedule backups, or
establish operational recovery objectives.

## Explicit offline import

Stop all source and destination writers and validate matching record and media
snapshots before importing. Configure `PRACTICE_RELAY_DATABASE_URL` and the
intended `PRACTICE_RELAY_TENANT_ID`. Schema changes are a separate explicit step:

```bash
pnpm migrate:postgres --schema --apply
```

The command runs `apps/relay-api/scripts/migrate-postgres.ts`. The migration ledger
records each applied component and migration id, not a checksum, so an edited
historical migration is skipped rather than detected at runtime. Never edit an
applied migration; add a new id. The migration-history tests pin the SQL of every
shipped migration.

Prepare a private media inventory with shape `{ "version": 1, "entries": [] }`.
Each non-empty entry carries the existing media metadata and a `state` of
`attached` or `cleanup_pending`, and includes retained replaced objects since
they still consume quota. The media-store `scanFilesystemMediaInventory` export
reads and hashes existing filesystem sidecars without changing them; preserve its
output as an owner-only JSON file. An empty inventory must still be explicit.

Configure the intended destination filesystem media root or S3 endpoint and
bucket. Existing immutable keys must already be there. The import command
verifies every inventoried object's complete size and SHA-256, requires every
canonical stored take to match an attached inventory entry, and requires every
attached entry to have a canonical reference. Unreferenced retained objects must
be marked `cleanup_pending`; it does not copy or delete media bytes. The
filesystem check also rejects unlisted objects and orphan bytes, while the S3
adapter verifies supplied keys but does not enumerate the bucket — provide a
complete bucket inventory, including retained replaced objects, before import.

```bash
pnpm migrate:postgres --source /absolute/tenant-snapshot --media-inventory /absolute/media-inventory.json
pnpm migrate:postgres --source /absolute/tenant-snapshot --media-inventory /absolute/media-inventory.json --apply --writers-stopped
```

The first command is a read-only dry run. The second imports canonical records,
original revisions and memberships, both validated audit representations, and
media metadata in one database transaction. Destination record and media metadata
namespaces must be empty, including audit history, reservations, and cleanup jobs;
conflicts abort the transaction. That also prevents an ambiguous committed import
from duplicating an audit-only snapshot on retry. Source files remain untouched.
Do not enable writers until you have checked the reported counts, object
verification, and a recovery drill. Assess a failed or interrupted import before
retrying; an existing destination record is never silently overwritten.
