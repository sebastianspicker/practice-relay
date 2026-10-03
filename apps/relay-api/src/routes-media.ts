/** Authorized staged media upload and verified streaming download routes. */
import { pipeline } from "node:stream/promises";
import { MediaAdmissionError, MediaLeaseExpiredError, MediaQuotaError, type MediaUploadReservation, type StagedMediaDownload } from "@practice-relay/media-store";
import { requireActor, requireMutationAccess, requireRecordForActor } from "./access.ts";
import { corsHeaders, normalizedMediaContentType, responseMetaOf, sendJson, sendProblem, validMediaStorageKey, validResourceId } from "./api-http.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { attachStoredMedia, MediaAttachmentPendingError } from "./application/media.ts";

type TransferLifetime = { signal: AbortSignal; dispose: () => void };

function transferLifetime(ctx: RequestContext): TransferLifetime {
  const controller = new AbortController();
  const abort = (): void => controller.abort(new Error("media client disconnected"));
  const responseClosed = (): void => { if (!ctx.res.writableFinished) abort(); };
  const responseEvents = ctx.res as Partial<Pick<typeof ctx.res, "once" | "off">>;
  ctx.req.once("aborted", abort);
  responseEvents.once?.("close", responseClosed);
  return { signal: controller.signal, dispose: () => {
    ctx.req.off("aborted", abort);
    responseEvents.off?.("close", responseClosed);
  } };
}

function declaredLength(ctx: RequestContext): number | undefined {
  const raw = ctx.req.headers["content-length"];
  if (raw === undefined) return undefined;
  if (Array.isArray(raw) || !/^\d+$/u.test(raw.trim())) throw new MediaQuotaError("invalid media Content-Length");
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new MediaQuotaError("invalid media Content-Length");
  return value;
}

async function uploadAdmission(ctx: RequestContext, match: RegExpMatchArray): Promise<MediaUploadReservation | undefined> {
  const recordId = decodeURIComponent(match[1]!);
  const takeId = decodeURIComponent(match[2]!);
  if (!validResourceId(takeId)) { sendProblem(ctx.res, 400, "Bad Request", "invalid take id"); return undefined; }
  if (!await requireMutationAccess(ctx, recordId, "add_take")) return undefined;
  return ctx.runtime.mediaStore.reserveUpload({ recordId, takeId, declaredByteSize: declaredLength(ctx),
    contentType: normalizedMediaContentType(typeof ctx.req.headers["content-type"] === "string" ? ctx.req.headers["content-type"] : undefined) });
}

async function serveUpload(ctx: RequestContext, match: RegExpMatchArray): Promise<void> {
  const lifetime = transferLifetime(ctx);
  let reservation: MediaUploadReservation | undefined;
  let staged: Awaited<ReturnType<typeof ctx.runtime.mediaStore.stageUpload>> | undefined;
  try {
    reservation = await uploadAdmission(ctx, match);
    if (!reservation) return;
    staged = await ctx.runtime.mediaStore.stageUpload(reservation, ctx.req, { signal: lifetime.signal });
    const meta = await ctx.runtime.mediaStore.storeUpload(reservation, staged, { signal: lifetime.signal });
    const attached = await attachStoredMedia(ctx, reservation, meta);
    sendJson(ctx.res, 200, { record: attached.record, media: meta, cleanupPending: Boolean(attached.replacedStorageKey) });
  } catch (error) {
    if (reservation && !(error instanceof MediaAttachmentPendingError)) {
      await ctx.runtime.mediaStore.abandonUpload(reservation, staged).catch(() => undefined);
    }
    if (error instanceof MediaAdmissionError) { ctx.req.resume(); sendProblem(ctx.res, 429, "Too Many Requests", error.message); return; }
    if (error instanceof MediaQuotaError || (error instanceof Error && /media stream exceeds/u.test(error.message))) { ctx.req.resume(); sendProblem(ctx.res, 413, "Payload Too Large", error.message); return; }
    if (error instanceof MediaLeaseExpiredError) { ctx.req.resume(); sendProblem(ctx.res, 409, "Conflict", error.message); return; }
    throw error;
  } finally {
    lifetime.dispose();
    await staged?.cleanup().catch(() => undefined);
  }
}

async function authorizeDownload(ctx: RequestContext): Promise<string | undefined> {
  if (!requireActor(ctx)) return undefined;
  const key = decodeURIComponent(ctx.pathname.slice("/media/".length));
  if (!validMediaStorageKey(key)) { sendProblem(ctx.res, 400, "Bad Request", "invalid media storage key"); return undefined; }
  const record = await requireRecordForActor(ctx, key.split("/", 1)[0]!);
  if (!record) return undefined;
  if (!record.takes.some((take) => take.storageKey === key)) { sendProblem(ctx.res, 404, "Not Found", "media not found"); return undefined; }
  return key;
}

async function serveDownload(ctx: RequestContext): Promise<void> {
  const key = await authorizeDownload(ctx);
  if (!key) return;
  const lifetime = transferLifetime(ctx);
  let staged: StagedMediaDownload | undefined;
  try {
    staged = await ctx.runtime.mediaStore.stageDownload(key, { signal: lifetime.signal });
    if (!staged || staged.meta.storageKey !== key || staged.meta.recordId !== key.split("/", 1)[0]) {
      sendProblem(ctx.res, 404, "Not Found", "media not found"); return;
    }
    const contentType = normalizedMediaContentType(staged.meta.contentType);
    const responseMeta = responseMetaOf(ctx.res);
    if (responseMeta) responseMeta.status = 200;
    const headers: Record<string, string> = { "content-type": contentType, "content-length": String(staged.byteSize),
      "x-content-type-options": "nosniff", ...corsHeaders(ctx.requestId, responseMeta?.corsOrigin) };
    if (contentType === "application/octet-stream") headers["content-disposition"] = 'attachment; filename="media.bin"';
    ctx.res.writeHead(200, headers);
    try { await pipeline(staged.createReadStream(), ctx.res, { signal: lifetime.signal }); }
    catch (error) { if (!ctx.res.destroyed) throw error; }
  } catch (error) {
    if (error instanceof MediaAdmissionError) { sendProblem(ctx.res, 429, "Too Many Requests", error.message); return; }
    throw error;
  } finally {
    lifetime.dispose();
    await staged?.cleanup().catch(() => undefined);
  }
}

/** Handle media upload and authorized download paths. */
export async function handleMediaRoutes(ctx: RequestContext): Promise<RouteResult> {
  const upload = ctx.pathname.match(/^\/work-records\/([^/]+)\/takes\/([^/]+)\/media$/u);
  if (upload && ctx.method === "POST") { await serveUpload(ctx, upload); return "handled"; }
  if (ctx.pathname.startsWith("/media/") && ctx.method === "GET") { await serveDownload(ctx); return "handled"; }
  return "unmatched";
}
