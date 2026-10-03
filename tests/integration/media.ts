/** Durable media failure injection against disposable PostgreSQL and real S3 bytes. */
import assert from "node:assert/strict";
import path from "node:path";
import { Readable } from "node:stream";
import type { Database } from "@practice-relay/database";
import { createPostgresMediaStore, createS3CompatibleObjectStore, type MediaBlobMeta, type MediaStoreAdapter } from "@practice-relay/media-store";

async function stagedUpload(store: MediaStoreAdapter, input: { recordId: string; takeId: string; size: number }) {
  const reservation = await store.reserveUpload({ recordId: input.recordId, takeId: input.takeId, declaredByteSize: input.size, contentType: "application/octet-stream" });
  const staged = await store.stageUpload(reservation, Readable.from(Buffer.alloc(input.size, 17)));
  await store.storeUpload(reservation, staged);
  await staged.cleanup();
  return reservation;
}

/** Verify quota accounting and crash recovery through independent media adapters. */
export async function verifySharedMedia(input: { database: Database; endpoint: string; root: string }): Promise<void> {
  const { database } = input;
  const tenantId = "media-integration";
  const objectStore = createS3CompatibleObjectStore({ endpoint: input.endpoint, bucket: "relay-integration", accessKey: process.env.RELAY_TEST_S3_USER!, secretKey: process.env.RELAY_TEST_S3_PASSWORD! });
  let failDeletion = false;
  const options = { database, tenantId, limits: { maxObjectBytes: 512, maxRecordBytes: 1_024, maxActiveTransfersDeployment: 2 }, objectStore: {
    ...objectStore,
    async deleteObject(key: string) { if (failDeletion) throw new Error("injected physical deletion failure"); return objectStore.deleteObject(key); },
  } };
  const first = createPostgresMediaStore({ ...options, stagingRoot: path.join(input.root, "media-a") });
  const second = createPostgresMediaStore({ ...options, stagingRoot: path.join(input.root, "media-b") });
  const references = new Set<string>();
  const isReferenced = async (meta: MediaBlobMeta) => references.has(meta.storageKey);
  const makeJobsReady = async () => {
    await database.query("UPDATE practice_relay_media_cleanup_jobs SET ready_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1", [tenantId]);
    await database.query("UPDATE practice_relay_media_uploads SET writer_quiet_after=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND state='abandoned'", [tenantId]);
  };
  try {
    await first.initialize(); await second.initialize();
    const pending = await first.reserveUpload({ recordId: "reserved-only", takeId: "take", contentType: "application/octet-stream" });
    assert.equal(await second.totalBytesForRecord("reserved-only"), 512, "unknown size reserves maximum");
    await assert.rejects(second.reserveUpload({ recordId: "reserved-only", takeId: "other", declaredByteSize: 1, contentType: "application/octet-stream" }), /active|capacity/);
    await first.abandonUpload(pending);
    await makeJobsReady(); await second.recover({ isReferenced });
    assert.equal(await second.totalBytesForRecord("reserved-only"), 0, "crash before staging eventually releases a quiet reservation");

    const original = await stagedUpload(first, { recordId: "replace", takeId: "take", size: 400 });
    await first.attachUpload(original); references.add(original.storageKey);
    const read = await second.stageDownload(original.storageKey);
    assert.ok(read); assert.equal(read.byteSize, 400); await read.cleanup();
    const replacement = await stagedUpload(second, { recordId: "replace", takeId: "take", size: 400 });
    await second.attachUpload(replacement, { replacedStorageKey: original.storageKey });
    references.delete(original.storageKey); references.add(replacement.storageKey);
    assert.equal(await first.totalBytesForRecord("replace"), 800, "replacement is charged before physical deletion");
    failDeletion = true;
    await makeJobsReady();
    const failed = await first.recover({ isReferenced });
    assert.ok(failed.failed > 0);
    assert.equal(await second.totalBytesForRecord("replace"), 800);
    await assert.rejects(first.reserveUpload({ recordId: "replace", takeId: "third", declaredByteSize: 400, contentType: "application/octet-stream" }), /quota/);
    failDeletion = false; await makeJobsReady(); await second.recover({ isReferenced });
    assert.equal(await first.totalBytesForRecord("replace"), 400);

    const expired = await stagedUpload(first, { recordId: "expired", takeId: "take", size: 20 });
    await database.query("UPDATE practice_relay_media_uploads SET lease_expires_at=clock_timestamp()-interval '1 second',writer_quiet_after=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND upload_id=$2", [tenantId, expired.id]);
    await assert.rejects(first.attachUpload(expired), /expired/);
    await first.abandonUpload(expired); await makeJobsReady(); await second.recover({ isReferenced });
    assert.equal(await second.totalBytesForRecord("expired"), 0);
    assert.equal(await objectStore.getStream(expired.storageKey), undefined);

    const referenceJob = await stagedUpload(first, { recordId: "protected", takeId: "take", size: 30 });
    const meta = await first.attachUpload(referenceJob); references.add(meta.storageKey);
    await database.query(`INSERT INTO practice_relay_media_cleanup_jobs (tenant_id,storage_key,record_id,take_id,content_type,byte_size,sha256,ready_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp()-interval '1 second')`, [tenantId, meta.storageKey, meta.recordId, meta.takeId, meta.contentType, meta.byteSize, meta.sha256]);
    const retained = await second.recover({ isReferenced });
    assert.ok(retained.retained > 0, "cleanup consults current canonical references");
    const verified = await first.stageDownload(meta.storageKey); assert.ok(verified); await verified.cleanup();
    assert.equal((await first.recover({ isReferenced })).deleted, 0, "repeat recovery is idempotent");
  } finally { await first.close(); await second.close(); }
}
