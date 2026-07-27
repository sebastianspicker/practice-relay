/**
 * Authorized media upload and download routes for Practice Relay records.
 * Why: quota, rollback, and access ordering form one security transaction.
 */
import type { WorkRecord } from "@practice-relay/work-record-core";
import { awaitMaybe } from "@practice-relay/media-store";
import {
  requireActor,
  requireMutationAccess,
  requireRecordForActor,
} from "./access.ts";
import {
  normalizedMediaContentType,
  readBody,
  sendBinary,
  sendJson,
  sendProblem,
  validMediaStorageKey,
  validResourceId,
} from "./api-http.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { persistRecord } from "./record-service.ts";

const MAX_MEDIA_BODY_BYTES = 200 * 1024 * 1024;
const MAX_MEDIA_BYTES_PER_SCORE = 1024 * 1024 * 1024;
const MAX_CONCURRENT_MEDIA_UPLOADS = 1;

type MediaUploadAdmission = {
  recordId: string;
  takeId: string;
  record: WorkRecord;
};

function beginMediaUpload(
  ctx: RequestContext,
  match: RegExpMatchArray,
): MediaUploadAdmission | undefined {
  const { req, res, runtime } = ctx;
  const recordId = decodeURIComponent(match[1]!);
  const takeId = decodeURIComponent(match[2]!);
  if (!validResourceId(takeId)) {
    sendProblem(res, 400, "Bad Request", "invalid take id");
    return undefined;
  }
  const access = requireMutationAccess(ctx, recordId, "add_take");
  if (!access) return undefined;
  if (runtime.activeMediaUploads >= MAX_CONCURRENT_MEDIA_UPLOADS) {
    req.resume();
    sendProblem(res, 429, "Too Many Requests", "another media upload is active");
    return undefined;
  }
  runtime.activeMediaUploads += 1;
  return { recordId, takeId, record: access.record };
}

async function retainedMediaBytes(
  ctx: RequestContext,
  recordId: string,
  record: WorkRecord,
): Promise<number> {
  const adapterRetained = await awaitMaybe(
    ctx.runtime.mediaStore.totalBytesForRecord(recordId),
  );
  const recordRetained = (record.takes ?? []).reduce(
    (total, take) => total + (take.byteSize ?? 0),
    0,
  );
  return Math.max(adapterRetained, recordRetained);
}

function mediaTakeFromMeta(takeId: string, meta: {
  storageKey: string;
  contentType: string;
  sha256: string;
  byteSize: number;
}): WorkRecord["takes"][number] {
  return {
    id: takeId,
    storageKey: meta.storageKey,
    contentType: meta.contentType,
    sha256: meta.sha256,
    byteSize: meta.byteSize,
    mediaPath: `media://${meta.storageKey}`,
  };
}

function recordWithMediaTake(
  record: WorkRecord,
  takeId: string,
  meta: Parameters<typeof mediaTakeFromMeta>[1],
): WorkRecord {
  const replacement = mediaTakeFromMeta(takeId, meta);
  const takes = (record.takes ?? []).map((take) =>
    take.id === takeId ? { ...take, ...replacement } : take,
  );
  if (!takes.some((take) => take.id === takeId)) takes.push(replacement);
  return {
    ...record,
    takes,
    takeIds: [...new Set([...(record.takeIds ?? []), takeId])],
  };
}

async function rollbackMedia(
  ctx: RequestContext,
  storageKey: string,
): Promise<void> {
  try {
    await awaitMaybe(ctx.runtime.mediaStore.hardDelete(storageKey));
  } catch {
    // Failed deletion remains durably charged to the adapter's quota.
  }
}

async function cleanupReplacedMedia(
  ctx: RequestContext,
  oldStorageKey: string | undefined,
  newStorageKey: string,
): Promise<boolean> {
  if (!oldStorageKey || oldStorageKey === newStorageKey) return false;
  try {
    await awaitMaybe(ctx.runtime.mediaStore.hardDelete(oldStorageKey));
    return false;
  } catch {
    return true;
  }
}

function authorizeMediaDownload(
  ctx: RequestContext,
): { key: string; record: WorkRecord } | undefined {
  const { pathname, res } = ctx;
  if (!requireActor(ctx)) return undefined;
  const key = decodeURIComponent(pathname.slice("/media/".length));
  if (!validMediaStorageKey(key)) {
    sendProblem(res, 400, "Bad Request", "invalid media storage key");
    return undefined;
  }
  const recordId = key.split("/", 1)[0]!;
  const record = requireRecordForActor(ctx, recordId);
  if (!record) return undefined;
  if (!(record.takes ?? []).some((take) => take.storageKey === key)) {
    sendProblem(res, 404, "Not Found", "media not found");
    return undefined;
  }
  return { key, record };
}

async function serveMediaUpload(
  ctx: RequestContext,
  match: RegExpMatchArray,
): Promise<void> {
  const { req, res, runtime } = ctx;
  const admission = beginMediaUpload(ctx, match);
  if (!admission) return;
  const { recordId, takeId, record } = admission;
  try {
    const bytes = await readBody(req, MAX_MEDIA_BODY_BYTES);
    const retained = await retainedMediaBytes(ctx, recordId, record);
    const previousTake = record.takes.find((take) => take.id === takeId);
    const projected =
      retained - (previousTake?.byteSize ?? 0) + bytes.byteLength;
    if (projected > MAX_MEDIA_BYTES_PER_SCORE) {
      sendProblem(
        res,
        413,
        "Payload Too Large",
        "media would exceed the per-record storage quota",
      );
      return;
    }
    const contentType = normalizedMediaContentType(
      typeof req.headers["content-type"] === "string"
        ? req.headers["content-type"]
        : undefined,
    );
    const meta = await awaitMaybe(
      runtime.mediaStore.put(recordId, takeId, bytes, { contentType }),
    );
    const next = recordWithMediaTake(record, takeId, meta);
    let saved: WorkRecord;
    try {
      saved = persistRecord(runtime, recordId, next);
    } catch (err) {
      await rollbackMedia(ctx, meta.storageKey);
      throw err;
    }
    const cleanupPending = await cleanupReplacedMedia(
      ctx,
      previousTake?.storageKey,
      meta.storageKey,
    );
    sendJson(res, 200, { record: saved, media: meta, cleanupPending });
  } finally {
    runtime.activeMediaUploads -= 1;
  }
}

async function serveMediaDownload(ctx: RequestContext): Promise<void> {
  const { res, runtime } = ctx;
  const authorized = authorizeMediaDownload(ctx);
  if (!authorized) return;
  const { key, record } = authorized;
  const got = await awaitMaybe(runtime.mediaStore.get(key));
  if (!got) {
    sendProblem(res, 404, "Not Found", "media not found");
    return;
  }
  if (got.meta.storageKey !== key || got.meta.recordId !== record.id) {
    sendProblem(res, 404, "Not Found", "media not found");
    return;
  }
  const contentType = normalizedMediaContentType(got.meta.contentType);
  sendBinary(res, {
    status: 200,
    bytes: got.bytes,
    contentType,
    filename:
      contentType === "application/octet-stream" ? "media.bin" : undefined,
  });
}

/** Handle media upload and authorized blob-download paths. */
export async function handleMediaRoutes(
  ctx: RequestContext,
): Promise<RouteResult> {
  const upload = ctx.pathname.match(
    /^\/work-records\/([^/]+)\/takes\/([^/]+)\/media$/,
  );
  if (upload && ctx.method === "POST") {
    await serveMediaUpload(ctx, upload);
    return "handled";
  }
  if (ctx.pathname.startsWith("/media/") && ctx.method === "GET") {
    await serveMediaDownload(ctx);
    return "handled";
  }
  return "unmatched";
}
