# Postgres `RecordStoreAdapter` stub (managed DB path)

## Status

Not shipped. `createPostgresRecordStore()` is exported but always fails closed until an institution supplies an external adapter:

> createPostgresRecordStore is not configured in this monorepo build. Use `PRACTICE_RELAY_STORE=json|memory` (lab default) or implement `RecordStoreAdapter` against managed Postgres.

Zero-native CI must never require `pg`, `better-sqlite3`, or a running database.

## Lab default

| `PRACTICE_RELAY_STORE` | Backend |
|-------------------|---------|
| `json` (default when `PRACTICE_RELAY_DATA` set) | Durable filesystem JSON under `PRACTICE_RELAY_DATA[/{tenantId}]` |
| `memory` | In-process maps (tests) |
| `postgres` / `pg` | Calls `createPostgresRecordStore()` and throws without loading a database driver |

JSON path namespace: `PRACTICE_RELAY_TENANT_ID` prefixes durable paths as
`{root}/{tenant}/records`, `events`, `audit`, and `backups`. The caller selects
the value, so this is not an authorization or managed multi-tenant boundary.

No automated backup SLO drill is shipped in this public tree.

## Interface to implement

Implement the `@practice-relay/record-store` `RecordStoreAdapter` contract:

```ts
interface RecordStoreAdapter extends RecordStore {
  listByMember(userId: string): WorkRecord[];
  appendEvent(recordId, kind, detail?, actorId?): void;
  listEvents(recordId: string): RecordEvent[];
  listAllEvents(): RecordEvent[];
  backup(backupRoot?: string): BackupManifest;
  listBackups(backupRoot?: string): BackupManifest[];
  restoreFromBackup(backupDir: string): BackupManifest;
  healthMetrics(): StoreHealthMetrics;
  rootDir: string;
  tenantId?: string;
  backend?: string; // e.g. "postgres"
}
```

Suggested table sketch for an external institutional implementation:

```sql
-- illustrative only; not applied by Practice Relay CI
CREATE TABLE work_records (
  tenant_id TEXT NOT NULL,
  id        TEXT NOT NULL,
  body      JSONB NOT NULL,
  revision  INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE record_events (
  tenant_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  at        TIMESTAMPTZ NOT NULL,
  kind      TEXT NOT NULL,
  detail    TEXT,
  actor_id  TEXT
);

CREATE TABLE audit_events (
  tenant_id TEXT NOT NULL,
  at        TIMESTAMPTZ NOT NULL,
  kind      TEXT NOT NULL,
  record_id TEXT NOT NULL,
  detail    TEXT,
  actor_id  TEXT
);
```

In an institutional fork, provide an external `RecordStoreAdapter` at API boot instead of relying on `createStoreFromEnv()` to create a Postgres adapter. Do not add native drivers to this monorepo unless CI remains optional.

## Honesty

Managed SQL is an institutional residual path, not a Practice Relay “production certified HA” claim. See `deploy/README.md` and `practice-relay/docs/slo.md`.
