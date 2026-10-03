/**
 * Interop and work-record package integration routes for parsed Practice Relay records.
 * Why: external serialization boundaries stay isolated from core mutations.
 */
import {
  asWorkRecordValidation,
  assertTrack,
  transitionWorkRecord,
  type WorkRecord,
  type RecordMutation,
} from "@practice-relay/work-record";
import {
  importEafToRecordParts,
  importOtioToRecordParts,
  type ExportFormat,
} from "@practice-relay/handoff";
import {
  guardMutation,
  requireAnyMutationAccess,
  requireMutationAccess,
} from "./access.ts";
import { readJson, sendBinary, sendJson, sendProblem } from "./api-http.ts";
import {
  attemptRequestValue,
  sendOperationError,
} from "./request-errors.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import type { RecordRouteParams } from "./record-route-types.ts";
import { interoperabilityExport, authorizeShare, packageExport } from "./application/exports.ts";
import { mutateRecord } from "./application/records.ts";

type InteropRequestBody = {
  format?: ExportFormat;
  importBody?: unknown;
  importFormat?: unknown;
};

type InteropMode =
  | { kind: "export" }
  | { kind: "import"; body: string; format: "eaf" | "otio-json" }
  | { kind: "invalid"; detail: string };

/** Distinguish an explicit import request from an ordinary format export. */
const classifyInteropMode = (body: InteropRequestBody): InteropMode => {
  const hasImportBody = body.importBody !== undefined;
  const hasImportFormat = body.importFormat !== undefined;
  if (!hasImportBody && !hasImportFormat) return { kind: "export" };
  if (typeof body.importBody !== "string" || !body.importBody.trim()) {
    return { kind: "invalid", detail: "importBody must be a non-empty string" };
  }
  if (body.importFormat !== "eaf" && body.importFormat !== "otio-json") {
    return { kind: "invalid", detail: "importFormat must be eaf or otio-json" };
  }
  return { kind: "import", body: body.importBody, format: body.importFormat };
}

const saveEafImport = async (
  ctx: RequestContext,
  recordId: string,
  body: string,
): Promise<void> => {
  const imported = attemptRequestValue(ctx.res, () => importEafToRecordParts(body));
  if (!imported.ok) return;
  try {
    const saved = await mutateRecord(ctx, recordId, (latest) => {
    let next = latest;
    for (const region of imported.value.regions) {
      next = transitionWorkRecord(next, { type: "add-region", region });
    }
    for (const comment of imported.value.comments) {
      next = transitionWorkRecord(next, {
        type: "add-comment",
        comment: { id: comment.id, regionId: comment.regionId, authorId: comment.authorId, body: comment.body, resolved: comment.resolved },
      });
    }
    return next;
    }, { mutations: ["import"], kind: "import" });
    sendJson(ctx.res, 200, {
      ok: true,
      imported: {
        regions: imported.value.regions.length,
        comments: imported.value.comments.length,
      },
      warnings: imported.value.warnings,
      record: saved,
    });
  } catch (err) {
    sendOperationError(ctx.res, err);
  }
}

const saveOtioImport = async (
  ctx: RequestContext,
  recordId: string,
  body: string,
): Promise<void> => {
  const imported = attemptRequestValue(ctx.res, () => importOtioToRecordParts(body));
  if (!imported.ok) return;
  try {
    const saved = await mutateRecord(ctx, recordId, (latest) => {
    let next = latest;
    for (const track of imported.value.tracks) {
      if (!next.tracks.some((existing) => existing.id === track.id)) {
        assertTrack(track);
        next = transitionWorkRecord(next, { type: "add-track", track });
      }
    }
    for (const take of imported.value.takes) {
      if (!next.takeIds.includes(take.id)) {
        // OTIO target_url is caller-controlled. Only media upload may mint a
        // persisted mediaPath that the server treats as an owned media object.
        next = transitionWorkRecord(next, {
          type: "add-take", take: { id: take.id, label: take.label },
        });
      }
    }
    return next;
    }, { mutations: ["import"], kind: "import" });
    sendJson(ctx.res, 200, {
      ok: true,
      imported: {
        tracks: imported.value.tracks.length,
        takes: imported.value.takes.length,
        durationMs: imported.value.durationMs,
      },
      warnings: imported.value.warnings,
      record: saved,
    });
  } catch (err) {
    sendOperationError(ctx.res, err);
  }
}

const sendInteropExport = (
  ctx: RequestContext,
  record: WorkRecord,
  format: InteropRequestBody["format"],
): void => {
  try {
    const result = asWorkRecordValidation(() => interoperabilityExport(record, (format ?? "otio-json") as ExportFormat));
    sendJson(ctx.res, 200, result);
  } catch (err) {
    sendOperationError(ctx.res, err);
  }
}

const serveInterop = async (
  ctx: RequestContext,
  recordId: string,
): Promise<void> => {
  const access = await requireAnyMutationAccess(
    ctx,
    recordId,
    ["import", "export"],
  );
  if (!access) return;
  const body = await readJson<InteropRequestBody>(ctx.req);
  const current = await requireAnyMutationAccess(ctx, recordId, ["import", "export"]);
  if (!current) return;
  const { actorUserId, record } = current;
  const mode = classifyInteropMode(body);
  if (mode.kind === "invalid") {
    sendProblem(ctx.res, 400, "Bad Request", mode.detail);
    return;
  }
  const mutation: RecordMutation = mode.kind === "import" ? "import" : "export";
  if (
    !guardMutation(ctx, {
      record,
      actorUserId,
      mutation,
    })
  ) return;

  if (mode.kind === "import" && mode.format === "eaf") {
    await saveEafImport(ctx, recordId, mode.body);
    return;
  }

  if (mode.kind === "import") {
    await saveOtioImport(ctx, recordId, mode.body);
    return;
  }

  sendInteropExport(ctx, record, body.format);
}

const serveWorkRecordExport = async (
  ctx: RequestContext,
  recordId: string,
): Promise<void> => {
  const access = await requireMutationAccess(ctx, recordId, "export");
  if (!access) return;
  const body = await readJson<{ format?: string }>(ctx.req);
  const current = await requireMutationAccess(ctx, recordId, "export");
  if (!current) return;
  const { record } = current;
  try {
    const pkg = asWorkRecordValidation(() => packageExport(record, body.format, ctx.runtime.repoRoot));
    if (pkg.format === "zip") {
      sendBinary(ctx.res, {
        status: 200,
        bytes: pkg.bytes,
        contentType: "application/zip",
        filename: pkg.filename,
      });
      return;
    }
    sendJson(ctx.res, 200, {
      manifest: pkg.manifest,
      roCrateMetadata: pkg.roCrateMetadata,
      validated: pkg.validated,
    });
  } catch (err) {
    sendOperationError(ctx.res, err);
  }
}

const serveShare = async (
  ctx: RequestContext,
  recordId: string,
): Promise<void> => {
  const access = await requireMutationAccess(ctx, recordId, "share");
  if (!access) return;
  await readJson(ctx.req);
  const current = await requireMutationAccess(ctx, recordId, "share");
  if (!current) return;
  const { record } = current;
  try {
    asWorkRecordValidation(() => authorizeShare(record));
    sendJson(ctx.res, 200, { ok: true, recordId: record.id, shared: true });
  } catch (err) {
    sendOperationError(ctx.res, err);
  }
}

/** Handle interop, work-record package export, and share actions for a parsed record route. */
export async function handleRecordIntegrationRoute(
  ctx: RequestContext,
  params: RecordRouteParams,
): Promise<RouteResult> {
  if (params.action === "interop" && ctx.method === "POST") {
    await serveInterop(ctx, params.recordId);
    return "handled";
  }
  if (params.action === "export" && ctx.method === "POST") {
    await serveWorkRecordExport(ctx, params.recordId);
    return "handled";
  }
  if (params.action === "share" && ctx.method === "POST") {
    await serveShare(ctx, params.recordId);
    return "handled";
  }
  return "unmatched";
}
