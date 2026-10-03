/** Coordinate staged media metadata with the latest authorized WorkRecord mutation. */
import { createPostgresRecordStore } from "@practice-relay/record-store";
import type { MediaBlobMeta, MediaUploadReservation } from "@practice-relay/media-store";
import type { WorkRecord } from "@practice-relay/work-record";
import type { RequestContext } from "../request-context.ts";
import { mutateRecord } from "./mutations.ts";

function takeFromMedia(takeId: string, meta: MediaBlobMeta): WorkRecord["takes"][number] {
  return { id: takeId, storageKey: meta.storageKey, contentType: meta.contentType,
    sha256: meta.sha256, byteSize: meta.byteSize, mediaPath: `media://${meta.storageKey}` };
}

function attachTake(record: WorkRecord, takeId: string, meta: MediaBlobMeta): WorkRecord {
  const replacement = takeFromMedia(takeId, meta);
  const takes = record.takes.map((take) => take.id === takeId ? { ...take, ...replacement } : take);
  if (!takes.some((take) => take.id === takeId)) takes.push(replacement);
  return { ...record, takes, takeIds: [...new Set([...record.takeIds, takeId])] };
}

/** The local canonical record committed, but media metadata still needs recovery. */
export class MediaAttachmentPendingError extends Error {
  constructor(readonly record: WorkRecord, options: ErrorOptions) {
    super("canonical record committed before media metadata attachment failed", options);
    this.name = "MediaAttachmentPendingError";
  }
}

/** Commit canonical record and PostgreSQL media attachment in one short transaction. */
export async function attachStoredMedia(
  ctx: RequestContext,
  reservation: MediaUploadReservation,
  meta: MediaBlobMeta,
): Promise<{ record: WorkRecord; replacedStorageKey?: string }> {
  let replacedStorageKey: string | undefined;
  const transition = (latest: WorkRecord): WorkRecord => {
    replacedStorageKey = latest.takes.find((take) => take.id === reservation.takeId)?.storageKey;
    return attachTake(latest, reservation.takeId, meta);
  };
  if (ctx.runtime.database && ctx.runtime.recordStore.backend === "postgres") {
    return ctx.runtime.database.transaction(async (database) => {
      const transactionStore = createPostgresRecordStore({ database, tenantId: ctx.runtime.recordStore.tenantId });
      const transactionContext: RequestContext = { ...ctx, runtime: { ...ctx.runtime, recordStore: transactionStore } };
      const record = await mutateRecord(transactionContext, reservation.recordId, transition, { mutations: ["add_take"], kind: "media-upload" });
      await ctx.runtime.mediaStore.attachUpload(reservation, { database, replacedStorageKey });
      return { record, ...(replacedStorageKey ? { replacedStorageKey } : {}) };
    });
  }
  const record = await mutateRecord(ctx, reservation.recordId, transition, { mutations: ["add_take"], kind: "media-upload" });
  try {
    await ctx.runtime.mediaStore.attachUpload(reservation, { replacedStorageKey });
  } catch (cause) {
    throw new MediaAttachmentPendingError(record, { cause });
  }
  return { record, ...(replacedStorageKey ? { replacedStorageKey } : {}) };
}
