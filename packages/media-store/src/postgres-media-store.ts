/** PostgreSQL-authoritative media reservations, leases, metadata, and cleanup. */
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Readable } from "node:stream";
import type { Database } from "@practice-relay/database";
import { requireMediaStoreMigrations } from "./migrations.js";
import { resolveMediaStoreLimits } from "./filesystem-media-store.js";
import { safeId } from "./media-safety.js";
import { stageReadable, TransferGate, verifiedDownloadStage } from "./staging.js";
import { MediaAdmissionError, MediaLeaseExpiredError, MediaQuotaError, type AttachMediaUploadOptions, type MediaBlobMeta, type MediaStoreAdapter, type MediaStoreLimits, type MediaUploadReservation, type ObjectStorageAdapter, type ReserveMediaUploadInput, type StagedMediaFile } from "./types.js";

type UploadRow = {
  upload_id: string; owner_token: string; record_id: string; take_id: string;
  storage_key: string; content_type: string; original_name: string | null;
  reserved_bytes: string; actual_bytes: string | null; sha256: string | null;
  state: string; lease_expires_at: Date | string; created_at: Date | string;
};
type ObjectRow = {
  storage_key: string; record_id: string; take_id: string; content_type: string;
  original_name: string | null; byte_size: string; sha256: string;
  state: string; created_at: Date | string;
};

/** PostgreSQL authority, byte backend, and lifecycle settings. */
export interface PostgresMediaStoreOptions {
  readonly database: Database;
  readonly objectStore: ObjectStorageAdapter;
  readonly tenantId?: string;
  readonly stagingRoot?: string;
  readonly limits?: Partial<MediaStoreLimits>;
}

function tenantId(value: string | undefined): string {
  const tenant = value ?? "default";
  if (tenant.length < 1 || tenant.length > 128 || /[\u0000-\u001f\u007f]/u.test(tenant)) throw new Error("invalid database tenant id");
  return tenant;
}

function reservationFrom(row: UploadRow): MediaUploadReservation {
  return { id: row.upload_id, ownerToken: row.owner_token, storageKey: row.storage_key,
    recordId: row.record_id, takeId: row.take_id, reservedBytes: Number(row.reserved_bytes),
    expiresAt: new Date(row.lease_expires_at).toISOString() };
}

function metaFrom(row: ObjectRow | UploadRow): MediaBlobMeta {
  const upload = "upload_id" in row;
  const byteSize = Number(upload ? row.actual_bytes : row.byte_size);
  const sha256 = row.sha256;
  if (!Number.isSafeInteger(byteSize) || byteSize < 0 || typeof sha256 !== "string") throw new Error("invalid PostgreSQL media metadata");
  return { storageKey: row.storage_key, recordId: row.record_id, takeId: row.take_id,
    contentType: row.content_type, ...(row.original_name === null ? {} : { originalName: row.original_name }),
    byteSize, sha256, createdAt: new Date(row.created_at).toISOString(),
    ...((!upload && row.state === "cleanup_pending") ? { cleanupPending: true } : {}) };
}

async function lockedUpload(database: Database, tenant: string, reservation: MediaUploadReservation): Promise<UploadRow> {
  const result = await database.query<UploadRow>(`SELECT * FROM practice_relay_media_uploads
    WHERE tenant_id = $1 AND upload_id = $2 AND lease_expires_at > clock_timestamp() FOR UPDATE`, [tenant, reservation.id]);
  const row = result.rows[0];
  if (!row || row.owner_token !== reservation.ownerToken || row.storage_key !== reservation.storageKey || row.state === "abandoned" || row.state === "attached") throw new MediaLeaseExpiredError();
  return row;
}

/** Create a media store with PostgreSQL-authoritative metadata and leases. */
export function createPostgresMediaStore(options: PostgresMediaStoreOptions): MediaStoreAdapter {
  const { database, objectStore } = options;
  const tenant = tenantId(options.tenantId);
  const limits = resolveMediaStoreLimits(options.limits);
  const writerQuietMs = Math.max(limits.leaseMs * 2, 300_000);
  const stagingRoot = options.stagingRoot ?? path.join(process.cwd(), ".media-staging");
  const processGate = new TransferGate(limits.maxActiveTransfers);
  const uploadReleases = new Map<string, { ownerToken: string; release: () => void }>();
  const uploadControllers = new Map<string, AbortController>();
  const activeControllers = new Set<AbortController>();
  const activeStageCleanups = new Set<() => Promise<void>>();
  let readyPromise: Promise<void> | undefined;
  let closed = false;
  const ready = (): Promise<void> => readyPromise ??= requireMediaStoreMigrations(database);

  function releaseUploadProcess(uploadId: string, ownerToken: string): void {
    const owned = uploadReleases.get(uploadId);
    if (!owned || owned.ownerToken !== ownerToken) return;
    owned.release();
    uploadReleases.delete(uploadId);
  }

  function abortUploadProcess(uploadId: string, ownerToken: string, reason: Error): void {
    if (uploadReleases.get(uploadId)?.ownerToken !== ownerToken) return;
    uploadControllers.get(uploadId)?.abort(reason);
  }

  async function acquireDeploymentLease(input: { id: string; token: string; kind: "upload" | "download"; recordId: string; storageKey?: string }, tx: Database): Promise<void> {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`practice-relay:media-transfers:${tenant}`]);
    await tx.query("DELETE FROM practice_relay_media_transfer_leases WHERE tenant_id = $1 AND expires_at <= clock_timestamp()", [tenant]);
    const count = await tx.query<{ count: string }>("SELECT count(*)::text AS count FROM practice_relay_media_transfer_leases WHERE tenant_id = $1", [tenant]);
    if (Number(count.rows[0]?.count ?? 0) >= limits.maxActiveTransfersDeployment) throw new MediaAdmissionError("deployment media transfer capacity exhausted");
    await tx.query(`INSERT INTO practice_relay_media_transfer_leases
      (tenant_id, transfer_id, owner_token, kind, record_id, storage_key, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp() + ($7 * interval '1 millisecond'))`,
      [tenant, input.id, input.token, input.kind, input.recordId, input.storageKey ?? null, limits.leaseMs]);
  }

  async function releaseTransfer(id: string, token: string): Promise<void> {
    await database.query("DELETE FROM practice_relay_media_transfer_leases WHERE tenant_id = $1 AND transfer_id = $2 AND owner_token = $3", [tenant, id, token]);
  }

  async function renewTransfer(targetDatabase: Database, id: string, token: string): Promise<boolean> {
    const result = await targetDatabase.query(`UPDATE practice_relay_media_transfer_leases
      SET expires_at = clock_timestamp() + ($4 * interval '1 millisecond')
      WHERE tenant_id = $1 AND transfer_id = $2 AND owner_token = $3 AND expires_at > clock_timestamp()`,
      [tenant, id, token, limits.leaseMs]);
    return result.rowCount === 1;
  }

  async function runWithUploadRenewal<T>(reservation: MediaUploadReservation, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    await store.renewUpload(reservation);
    const controller = new AbortController();
    activeControllers.add(controller);
    uploadControllers.set(reservation.id, controller);
    let renewing = false;
    const timer = setInterval(() => {
      if (renewing) return;
      renewing = true;
      void store.renewUpload(reservation).catch(() => controller.abort(new MediaLeaseExpiredError())).finally(() => { renewing = false; });
    }, Math.max(1_000, Math.floor(limits.leaseMs / 3)));
    timer.unref();
    try {
      return await operation(controller.signal);
    } finally {
      clearInterval(timer);
      activeControllers.delete(controller);
      if (uploadControllers.get(reservation.id) === controller) uploadControllers.delete(reservation.id);
    }
  }

  function trackStage<T extends StagedMediaFile>(staged: T): T {
    const original = staged.cleanup;
    let cleaned = false;
    const cleanup = async (): Promise<void> => {
      if (cleaned) return;
      cleaned = true;
      activeStageCleanups.delete(cleanup);
      await original();
    };
    activeStageCleanups.add(cleanup);
    return { ...staged, cleanup };
  }

  const store: MediaStoreAdapter = {
    rootDir: `postgres-media:${tenant}`, backend: `postgres+${objectStore.backend}`, limits,
    async initialize() { if (closed) throw new Error("media store is closed"); await ready(); await objectStore.checkHealth?.(); },
    async reserveUpload(input: ReserveMediaUploadInput) {
      await ready(); safeId(input.recordId); safeId(input.takeId);
      if (input.declaredByteSize !== undefined && (!Number.isSafeInteger(input.declaredByteSize) || input.declaredByteSize < 0 || input.declaredByteSize > limits.maxObjectBytes)) throw new MediaQuotaError("invalid or oversized declared media length");
      const release = processGate.acquire();
      try {
        const reservation = await database.transaction(async (tx) => {
          await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`practice-relay:media-record:${tenant}:${input.recordId}`]);
          const active = await tx.query<{ count: string }>(`SELECT count(*)::text AS count FROM practice_relay_media_uploads
            WHERE tenant_id=$1 AND record_id=$2 AND state IN ('reserved','transferring','object_ready')`, [tenant, input.recordId]);
          if (Number(active.rows[0]?.count ?? 0) >= limits.maxActiveUploadsPerRecord) throw new MediaAdmissionError("another media upload is active for this record");
          const usage = await tx.query<{ bytes: string }>(`SELECT (COALESCE((SELECT sum(byte_size) FROM practice_relay_media_objects WHERE tenant_id=$1 AND record_id=$2),0)
            + COALESCE((SELECT sum(COALESCE(actual_bytes,reserved_bytes)) FROM practice_relay_media_uploads WHERE tenant_id=$1 AND record_id=$2 AND state IN ('reserved','transferring','object_ready','abandoned')),0))::text AS bytes`, [tenant, input.recordId]);
          const charge = input.declaredByteSize ?? limits.maxObjectBytes;
          if (Number(usage.rows[0]?.bytes ?? 0) + charge > limits.maxRecordBytes) throw new MediaQuotaError();
          const id = randomUUID(), token = randomUUID();
          const key = `${input.recordId}/${input.takeId}-${id}.bin`;
          await acquireDeploymentLease({ id, token, kind: "upload", recordId: input.recordId, storageKey: key }, tx);
          const inserted = await tx.query<UploadRow>(`INSERT INTO practice_relay_media_uploads
            (tenant_id,upload_id,owner_token,record_id,take_id,storage_key,content_type,original_name,reserved_bytes,state,lease_expires_at,writer_quiet_after)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'reserved',clock_timestamp()+($10*interval '1 millisecond'),clock_timestamp()+($11*interval '1 millisecond')) RETURNING *`,
            [tenant,id,token,input.recordId,input.takeId,key,input.contentType,input.originalName ?? null,charge,limits.leaseMs,writerQuietMs]);
          return reservationFrom(inserted.rows[0]!);
        });
        uploadReleases.set(reservation.id, { ownerToken: reservation.ownerToken, release });
        return reservation;
      } catch (error) { release(); throw error; }
    },
    async renewUpload(reservation) {
      await ready();
      try {
        return await database.transaction(async (tx) => {
          const row = await lockedUpload(tx, tenant, reservation);
          if (!["reserved","transferring","object_ready"].includes(row.state)) throw new MediaLeaseExpiredError();
          const updated = await tx.query<UploadRow>(`UPDATE practice_relay_media_uploads SET
            lease_expires_at=clock_timestamp()+($4*interval '1 millisecond'), writer_quiet_after=clock_timestamp()+($5*interval '1 millisecond')
            WHERE tenant_id=$1 AND upload_id=$2 AND owner_token=$3 RETURNING *`, [tenant,reservation.id,reservation.ownerToken,limits.leaseMs,writerQuietMs]);
          if (!await renewTransfer(tx, reservation.id, reservation.ownerToken)) throw new MediaLeaseExpiredError();
          return reservationFrom(updated.rows[0]!);
        });
      } catch (error) {
        abortUploadProcess(reservation.id, reservation.ownerToken, error instanceof Error ? error : new MediaLeaseExpiredError());
        releaseUploadProcess(reservation.id, reservation.ownerToken);
        throw error;
      }
    },
    async stageUpload(reservation, source: Readable, transferOptions) {
      await ready();
      return trackStage(await runWithUploadRenewal(reservation, (leaseSignal) => {
        const signal = transferOptions?.signal
          ? AbortSignal.any([leaseSignal, transferOptions.signal])
          : leaseSignal;
        return stageReadable(stagingRoot, source, limits.maxObjectBytes, signal);
      }));
    },
    async storeUpload(reservation, staged: StagedMediaFile, transferOptions) {
      await ready();
      const contentType = await database.transaction(async (tx) => {
        const row = await lockedUpload(tx, tenant, reservation);
        if (row.state !== "reserved") throw new MediaLeaseExpiredError();
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`practice-relay:media-record:${tenant}:${row.record_id}`]);
        const other = await tx.query<{ bytes: string }>(`SELECT (COALESCE((SELECT sum(byte_size) FROM practice_relay_media_objects WHERE tenant_id=$1 AND record_id=$2),0)
          + COALESCE((SELECT sum(COALESCE(actual_bytes,reserved_bytes)) FROM practice_relay_media_uploads WHERE tenant_id=$1 AND record_id=$2 AND upload_id<>$3 AND state IN ('reserved','transferring','object_ready','abandoned')),0))::text AS bytes`, [tenant,row.record_id,row.upload_id]);
        if (staged.byteSize > limits.maxObjectBytes || Number(other.rows[0]?.bytes ?? 0) + staged.byteSize > limits.maxRecordBytes) throw new MediaQuotaError();
        await tx.query(`UPDATE practice_relay_media_uploads SET state='transferring',actual_bytes=$4,sha256=$5,
          lease_expires_at=clock_timestamp()+($6*interval '1 millisecond'),writer_quiet_after=clock_timestamp()+($7*interval '1 millisecond')
          WHERE tenant_id=$1 AND upload_id=$2 AND owner_token=$3`, [tenant,row.upload_id,row.owner_token,staged.byteSize,staged.sha256,limits.leaseMs,writerQuietMs]);
        return row.content_type;
      });
      try {
        await runWithUploadRenewal(reservation, (leaseSignal) => {
          const signal = transferOptions?.signal
            ? AbortSignal.any([leaseSignal, transferOptions.signal])
            : leaseSignal;
          return objectStore.putFile(reservation.storageKey, staged.path, { contentType, byteSize: staged.byteSize, sha256: staged.sha256, signal });
        });
        return await database.transaction(async (tx) => {
          const row = await lockedUpload(tx, tenant, reservation);
          if (row.state !== "transferring") throw new MediaLeaseExpiredError();
          const updated = await tx.query<UploadRow>("UPDATE practice_relay_media_uploads SET state='object_ready' WHERE tenant_id=$1 AND upload_id=$2 AND owner_token=$3 RETURNING *", [tenant,row.upload_id,row.owner_token]);
          return metaFrom(updated.rows[0]!);
        });
      } catch (error) {
        await store.abandonUpload(reservation, staged).catch(() => undefined);
        throw error;
      }
    },
    async attachUpload(reservation, attachOptions: AttachMediaUploadOptions = {}) {
      await ready();
      const operation = async (tx: Database): Promise<MediaBlobMeta> => {
        const row = await lockedUpload(tx, tenant, reservation);
        if (row.state !== "object_ready") throw new MediaLeaseExpiredError();
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`practice-relay:media-record:${tenant}:${row.record_id}`]);
        const meta = metaFrom(row);
        await tx.query(`INSERT INTO practice_relay_media_objects
          (tenant_id,storage_key,record_id,take_id,content_type,original_name,byte_size,sha256,state,created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'attached',$9)`, [tenant,meta.storageKey,meta.recordId,meta.takeId,meta.contentType,meta.originalName ?? null,meta.byteSize,meta.sha256,meta.createdAt]);
        await tx.query("UPDATE practice_relay_media_uploads SET state='attached',reserved_bytes=0 WHERE tenant_id=$1 AND upload_id=$2", [tenant,row.upload_id]);
        await tx.query("DELETE FROM practice_relay_media_transfer_leases WHERE tenant_id=$1 AND transfer_id=$2 AND owner_token=$3", [tenant,row.upload_id,row.owner_token]);
        const oldKey = attachOptions.replacedStorageKey;
        if (oldKey && oldKey !== meta.storageKey) {
          const old = await tx.query<ObjectRow>("UPDATE practice_relay_media_objects SET state='cleanup_pending' WHERE tenant_id=$1 AND storage_key=$2 AND record_id=$3 AND take_id=$4 RETURNING *", [tenant,oldKey,row.record_id,row.take_id]);
          if (old.rows[0]) { const oldMeta = metaFrom(old.rows[0]); await tx.query(`INSERT INTO practice_relay_media_cleanup_jobs
            (tenant_id,storage_key,record_id,take_id,content_type,byte_size,sha256,ready_at) VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp())
            ON CONFLICT (tenant_id,storage_key) DO NOTHING`, [tenant,oldMeta.storageKey,oldMeta.recordId,oldMeta.takeId,oldMeta.contentType,oldMeta.byteSize,oldMeta.sha256]); }
        }
        return meta;
      };
      const result = attachOptions.database ? await operation(attachOptions.database) : await database.transaction(operation);
      releaseUploadProcess(reservation.id, reservation.ownerToken);
      return result;
    },
    async abandonUpload(reservation, staged) {
      await staged?.cleanup().catch(() => undefined);
      await ready();
      abortUploadProcess(reservation.id, reservation.ownerToken, new MediaLeaseExpiredError());
      try {
        await database.transaction(async (tx) => {
          const result = await tx.query<UploadRow>(`UPDATE practice_relay_media_uploads SET state='abandoned',
            writer_quiet_after=GREATEST(writer_quiet_after,clock_timestamp()+($4*interval '1 millisecond'))
            WHERE tenant_id=$1 AND upload_id=$2 AND owner_token=$3 AND state<>'attached' RETURNING *`, [tenant,reservation.id,reservation.ownerToken,writerQuietMs]);
          const row = result.rows[0];
          await tx.query("DELETE FROM practice_relay_media_transfer_leases WHERE tenant_id=$1 AND transfer_id=$2 AND owner_token=$3", [tenant,reservation.id,reservation.ownerToken]);
          if (row?.actual_bytes === null) {
            await tx.query("DELETE FROM practice_relay_media_uploads WHERE tenant_id=$1 AND upload_id=$2 AND state='abandoned'", [tenant,row.upload_id]);
          } else if (row) await tx.query(`INSERT INTO practice_relay_media_cleanup_jobs
            (tenant_id,storage_key,record_id,take_id,content_type,byte_size,sha256,ready_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+($8*interval '1 millisecond'))
            ON CONFLICT (tenant_id,storage_key) DO UPDATE SET ready_at=GREATEST(practice_relay_media_cleanup_jobs.ready_at,EXCLUDED.ready_at)`,
            [tenant,row.storage_key,row.record_id,row.take_id,row.content_type,row.actual_bytes ?? row.reserved_bytes,row.sha256 ?? "",writerQuietMs]);
        });
      } finally {
        releaseUploadProcess(reservation.id, reservation.ownerToken);
      }
    },
    async stageDownload(storageKey, transferOptions) {
      await ready();
      const result = await database.query<ObjectRow>("SELECT * FROM practice_relay_media_objects WHERE tenant_id=$1 AND storage_key=$2 AND state='attached'", [tenant,storageKey]);
      if (!result.rows[0]) return undefined;
      const meta = metaFrom(result.rows[0]);
      const releaseProcess = processGate.acquire(); const id = randomUUID(), token = randomUUID();
      try { await database.transaction((tx) => acquireDeploymentLease({ id, token, kind: "download", recordId: meta.recordId, storageKey }, tx)); }
      catch (error) { releaseProcess(); throw error; }
      const controller = new AbortController();
      activeControllers.add(controller);
      const signal = transferOptions?.signal
        ? AbortSignal.any([controller.signal, transferOptions.signal])
        : controller.signal;
      let renewing = false;
      const timer = setInterval(() => {
        if (renewing) return;
        renewing = true;
        void renewTransfer(database, id, token).then((ok) => { if (!ok) controller.abort(new MediaLeaseExpiredError()); }, () => controller.abort()).finally(() => { renewing = false; });
      }, Math.max(1_000, Math.floor(limits.leaseMs / 3)));
      timer.unref();
      const release = async (): Promise<void> => { clearInterval(timer); controller.abort(); activeControllers.delete(controller); await releaseTransfer(id, token).catch(() => undefined); releaseProcess(); };
      try {
        const source = await objectStore.getStream(storageKey, { signal });
        if (!source) { await release(); return undefined; }
        const staged = trackStage(await verifiedDownloadStage(stagingRoot, source, meta, { maxBytes: limits.maxObjectBytes, signal }));
        return { ...staged, cleanup: async () => { try { await staged.cleanup(); } finally { await release(); } } };
      } catch (error) { await release(); throw error; }
    },
    async listForRecord(recordId) { await ready(); const result = await database.query<ObjectRow>("SELECT * FROM practice_relay_media_objects WHERE tenant_id=$1 AND record_id=$2 AND state='attached' ORDER BY created_at,storage_key", [tenant,recordId]); return result.rows.map(metaFrom); },
    async totalBytesForRecord(recordId) { await ready(); const result = await database.query<{ bytes: string }>(`SELECT (COALESCE((SELECT sum(byte_size) FROM practice_relay_media_objects WHERE tenant_id=$1 AND record_id=$2),0)+COALESCE((SELECT sum(COALESCE(actual_bytes,reserved_bytes)) FROM practice_relay_media_uploads WHERE tenant_id=$1 AND record_id=$2 AND state IN ('reserved','transferring','object_ready','abandoned')),0))::text AS bytes`, [tenant,recordId]); return Number(result.rows[0]?.bytes ?? 0); },
    async totalBytesAll() { await ready(); const result = await database.query<{ bytes: string }>(`SELECT (COALESCE((SELECT sum(byte_size) FROM practice_relay_media_objects WHERE tenant_id=$1),0)+COALESCE((SELECT sum(COALESCE(actual_bytes,reserved_bytes)) FROM practice_relay_media_uploads WHERE tenant_id=$1 AND state IN ('reserved','transferring','object_ready','abandoned')),0))::text AS bytes`, [tenant]); return Number(result.rows[0]?.bytes ?? 0); },
    async recover(recoveryOptions) {
      await ready(); const now = recoveryOptions.now ?? new Date();
      const expiredUploads = await database.transaction(async (tx) => {
        const expired = await tx.query<UploadRow>(`UPDATE practice_relay_media_uploads SET state='abandoned'
          WHERE tenant_id=$1 AND state IN ('reserved','transferring','object_ready') AND lease_expires_at <= $2 RETURNING *`, [tenant,now]);
        for (const row of expired.rows) {
          if (row.actual_bytes === null) {
            await tx.query("DELETE FROM practice_relay_media_uploads WHERE tenant_id=$1 AND upload_id=$2 AND state='abandoned'", [tenant,row.upload_id]);
            continue;
          }
          await tx.query(`INSERT INTO practice_relay_media_cleanup_jobs
          (tenant_id,storage_key,record_id,take_id,content_type,byte_size,sha256,ready_at) VALUES ($1,$2,$3,$4,$5,$6,$7,GREATEST($8,clock_timestamp()))
          ON CONFLICT (tenant_id,storage_key) DO NOTHING`, [tenant,row.storage_key,row.record_id,row.take_id,row.content_type,row.actual_bytes,row.sha256 ?? "",new Date(new Date(row.lease_expires_at).getTime()+writerQuietMs)]);
        }
        await tx.query("DELETE FROM practice_relay_media_transfer_leases WHERE tenant_id=$1 AND expires_at <= $2", [tenant,now]);
        return expired.rows.map((row) => ({ id: row.upload_id, ownerToken: row.owner_token }));
      });
      for (const expired of expiredUploads) {
        abortUploadProcess(expired.id, expired.ownerToken, new MediaLeaseExpiredError());
        releaseUploadProcess(expired.id, expired.ownerToken);
      }
      const claimOwner = randomUUID();
      const jobs = await database.transaction((tx) => tx.query<ObjectRow>(`WITH candidates AS (
          SELECT storage_key FROM practice_relay_media_cleanup_jobs
          WHERE tenant_id=$1 AND ready_at <= $2 AND (claim_expires_at IS NULL OR claim_expires_at <= clock_timestamp())
          ORDER BY ready_at LIMIT 100 FOR UPDATE SKIP LOCKED
        ) UPDATE practice_relay_media_cleanup_jobs j SET claim_owner=$3,claim_expires_at=clock_timestamp()+($4*interval '1 millisecond')
          FROM candidates c WHERE j.tenant_id=$1 AND j.storage_key=c.storage_key
          RETURNING j.storage_key,j.record_id,j.take_id,j.content_type,NULL::text AS original_name,j.byte_size::text,j.sha256,'cleanup_pending'::text AS state,j.ready_at AS created_at`,
        [tenant,now,claimOwner,writerQuietMs]));
      const requeuePromoted = async (meta: MediaBlobMeta): Promise<void> => {
        await database.transaction(async (tx) => {
          const updated = await tx.query<ObjectRow>(`UPDATE practice_relay_media_objects SET state='cleanup_pending'
            WHERE tenant_id=$1 AND storage_key=$2 AND state='attached' RETURNING *`, [tenant,meta.storageKey]);
          const pending = updated.rows[0];
          if (!pending) return;
          await tx.query(`INSERT INTO practice_relay_media_cleanup_jobs
            (tenant_id,storage_key,record_id,take_id,content_type,byte_size,sha256,ready_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp()) ON CONFLICT (tenant_id,storage_key) DO NOTHING`,
          [tenant,pending.storage_key,pending.record_id,pending.take_id,pending.content_type,pending.byte_size,pending.sha256]);
        });
      };
      let deleted=0, retained=0, failed=0;
      for (const row of jobs.rows) { const meta=metaFrom(row); try {
        if (await recoveryOptions.isReferenced(meta)) {
          const promoted = await database.transaction(async (tx) => {
            const upload = await tx.query<UploadRow>("SELECT * FROM practice_relay_media_uploads WHERE tenant_id=$1 AND storage_key=$2 AND state='abandoned' FOR UPDATE", [tenant,meta.storageKey]);
            const abandoned = upload.rows[0];
            const recordId = abandoned?.record_id ?? meta.recordId;
            await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`practice-relay:media-record:${tenant}:${recordId}`]);
            if (abandoned?.actual_bytes !== null && abandoned?.sha256) {
              await tx.query(`INSERT INTO practice_relay_media_objects
                (tenant_id,storage_key,record_id,take_id,content_type,original_name,byte_size,sha256,state,created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'attached',$9)
                ON CONFLICT (tenant_id,storage_key) DO UPDATE SET state='attached'`,
              [tenant,abandoned.storage_key,abandoned.record_id,abandoned.take_id,abandoned.content_type,abandoned.original_name,abandoned.actual_bytes,abandoned.sha256,abandoned.created_at]);
              await tx.query("DELETE FROM practice_relay_media_uploads WHERE tenant_id=$1 AND upload_id=$2", [tenant,abandoned.upload_id]);
            } else {
              await tx.query(`INSERT INTO practice_relay_media_objects
                (tenant_id,storage_key,record_id,take_id,content_type,original_name,byte_size,sha256,state,created_at)
                VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,'attached',$8)
                ON CONFLICT (tenant_id,storage_key) DO UPDATE SET state='attached'`,
              [tenant,meta.storageKey,meta.recordId,meta.takeId,meta.contentType,meta.byteSize,meta.sha256,meta.createdAt]);
            }
            await tx.query("DELETE FROM practice_relay_media_cleanup_jobs WHERE tenant_id=$1 AND storage_key=$2 AND claim_owner=$3", [tenant,meta.storageKey,claimOwner]);
            return abandoned ? { id: abandoned.upload_id, ownerToken: abandoned.owner_token } : undefined;
          });
          if (promoted) releaseUploadProcess(promoted.id,promoted.ownerToken);
          let stillReferenced: boolean;
          try { stillReferenced = await recoveryOptions.isReferenced(meta); }
          catch (error) { await requeuePromoted(meta); throw error; }
          if (stillReferenced) retained += 1;
          else await requeuePromoted(meta);
          continue;
        }
        await objectStore.deleteObject(meta.storageKey);
        const removedUploads = await database.transaction(async(tx)=>{ await tx.query("DELETE FROM practice_relay_media_objects WHERE tenant_id=$1 AND storage_key=$2",[tenant,meta.storageKey]); const removed=await tx.query<{upload_id:string;owner_token:string}>("DELETE FROM practice_relay_media_uploads WHERE tenant_id=$1 AND storage_key=$2 AND state='abandoned' RETURNING upload_id,owner_token",[tenant,meta.storageKey]); await tx.query("DELETE FROM practice_relay_media_cleanup_jobs WHERE tenant_id=$1 AND storage_key=$2 AND claim_owner=$3",[tenant,meta.storageKey,claimOwner]); return removed.rows; }); for (const removed of removedUploads) releaseUploadProcess(removed.upload_id,removed.owner_token); deleted+=1;
      } catch(error) { failed+=1; await database.query("UPDATE practice_relay_media_cleanup_jobs SET attempts=attempts+1,last_error=$3,ready_at=clock_timestamp()+interval '1 minute',claim_owner=NULL,claim_expires_at=NULL WHERE tenant_id=$1 AND storage_key=$2 AND claim_owner=$4",[tenant,meta.storageKey,error instanceof Error?error.message.slice(0,500):"cleanup failed",claimOwner]); } }
      return { examined: jobs.rows.length, deleted, retained, failed };
    },
    async checkHealth() { await ready(); await database.checkHealth(); await objectStore.checkHealth?.(); },
    async close() {
      closed = true;
      for (const controller of activeControllers) controller.abort(new Error("media store closed"));
      await Promise.allSettled([...activeStageCleanups].map((cleanup) => cleanup()));
      for (const owned of uploadReleases.values()) owned.release();
      uploadReleases.clear();
    },
  };
  return store;
}
