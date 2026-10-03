/** PostgreSQL media metadata, quota reservation, transfer lease, and cleanup schema. */
import { migrateDatabase, requireDatabaseMigrations, type Database, type DatabaseMigration } from "@practice-relay/database";

export const MEDIA_MIGRATION_IDS = ["0001_media_lifecycle"] as const;

const migrations: readonly DatabaseMigration[] = [{
  id: MEDIA_MIGRATION_IDS[0],
  sql: `
CREATE TABLE practice_relay_media_uploads (
  tenant_id text NOT NULL,
  upload_id uuid NOT NULL,
  owner_token uuid NOT NULL,
  record_id text NOT NULL,
  take_id text NOT NULL,
  storage_key text NOT NULL,
  content_type text NOT NULL,
  original_name text,
  reserved_bytes bigint NOT NULL CHECK (reserved_bytes >= 0),
  actual_bytes bigint CHECK (actual_bytes >= 0),
  sha256 text,
  state text NOT NULL CHECK (state IN ('reserved','transferring','object_ready','attached','abandoned')),
  lease_expires_at timestamptz NOT NULL,
  writer_quiet_after timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, upload_id),
  UNIQUE (tenant_id, storage_key)
);
CREATE INDEX practice_relay_media_upload_record_idx ON practice_relay_media_uploads (tenant_id, record_id, state);

CREATE TABLE practice_relay_media_objects (
  tenant_id text NOT NULL,
  storage_key text NOT NULL,
  record_id text NOT NULL,
  take_id text NOT NULL,
  content_type text NOT NULL,
  original_name text,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  sha256 text NOT NULL,
  state text NOT NULL CHECK (state IN ('attached','cleanup_pending')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, storage_key)
);
CREATE INDEX practice_relay_media_object_record_idx ON practice_relay_media_objects (tenant_id, record_id, state);

CREATE TABLE practice_relay_media_transfer_leases (
  tenant_id text NOT NULL,
  transfer_id uuid NOT NULL,
  owner_token uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('upload','download')),
  record_id text NOT NULL,
  storage_key text,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, transfer_id)
);
CREATE INDEX practice_relay_media_transfer_expiry_idx ON practice_relay_media_transfer_leases (tenant_id, expires_at);

CREATE TABLE practice_relay_media_cleanup_jobs (
  tenant_id text NOT NULL,
  storage_key text NOT NULL,
  record_id text NOT NULL,
  take_id text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  sha256 text NOT NULL,
  ready_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  claim_owner uuid,
  claim_expires_at timestamptz,
  PRIMARY KEY (tenant_id, storage_key)
);`,
}];

/** Apply PostgreSQL media lifecycle migrations. */
export async function migrateMediaStore(database: Database): Promise<void> {
  await migrateDatabase(database, "media-store", migrations);
}

/** Fail unless every required PostgreSQL media migration is present. */
export async function requireMediaStoreMigrations(database: Database): Promise<void> {
  await requireDatabaseMigrations(database, "media-store", MEDIA_MIGRATION_IDS);
}
