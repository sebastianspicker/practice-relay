/**
 * Interop and work-record package integration routes for parsed Practice Relay records.
 * Why: external serialization boundaries stay isolated from core mutations.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  addComment,
  addRegion,
  addTake,
  addTrack,
  type WorkRecord,
  type RecordMutation,
  type Track,
} from "@practice-relay/work-record-core";
import {
  buildWorkRecordPackageManifest,
  exportWorkRecordPackage,
  exportWorkRecordPackageZip,
} from "@practice-relay/work-record-package";
import {
  exportRecord,
  importEafToRecordParts,
  importOtioToRecordParts,
  type ExportFormat,
} from "@practice-relay/interop";
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
import { persistRecord } from "./record-service.ts";

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

const saveEafImport = (
  ctx: RequestContext,
  recordId: string,
  record: WorkRecord,
  body: string,
): void => {
  const imported = attemptRequestValue(ctx.res, () => importEafToRecordParts(body));
  if (!imported.ok) return;
  try {
    let next = record;
    for (const region of imported.value.regions) next = addRegion(next, region);
    for (const comment of imported.value.comments) {
      next = addComment(next, {
        id: comment.id,
        regionId: comment.regionId,
        authorId: comment.authorId,
        body: comment.body,
        resolved: comment.resolved,
      });
    }
    const saved = persistRecord(ctx.runtime, recordId, next);
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
    sendOperationError(ctx.res, err, "invalid EAF import");
  }
}

const saveOtioImport = (
  ctx: RequestContext,
  recordId: string,
  record: WorkRecord,
  body: string,
): void => {
  const imported = attemptRequestValue(ctx.res, () => importOtioToRecordParts(body));
  if (!imported.ok) return;
  try {
    let next = record;
    for (const track of imported.value.tracks) {
      if (!next.tracks.some((existing) => existing.id === track.id)) {
        next = addTrack(next, track as Track);
      }
    }
    for (const take of imported.value.takes) {
      if (!next.takeIds.includes(take.id)) {
        // OTIO target_url is caller-controlled. Only media upload may mint a
        // persisted mediaPath that the server treats as an owned media object.
        next = addTake(next, { id: take.id, label: take.label });
      }
    }
    const saved = persistRecord(ctx.runtime, recordId, next);
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
    sendOperationError(ctx.res, err, "invalid OTIO import");
  }
}

const sendInteropExport = (
  ctx: RequestContext,
  record: WorkRecord,
  format: InteropRequestBody["format"],
): void => {
  try {
    const result = exportRecord(
      {
        id: record.id,
        title: record.title,
        tracks: record.tracks,
        takes: record.takes,
        preferredTakeId: record.preferredTakeId,
        spine: record.spine,
        regions: record.spine?.regions,
        comments: record.comments,
      },
      (format ?? "otio-json") as ExportFormat,
    );
    sendJson(ctx.res, 200, result);
  } catch (err) {
    sendProblem(
      ctx.res,
      400,
      "Bad Request",
      err instanceof Error ? err.message : "interop failed",
    );
  }
}

const serveInterop = async (
  ctx: RequestContext,
  recordId: string,
): Promise<void> => {
  const access = requireAnyMutationAccess(
    ctx,
    recordId,
    ["import", "export"],
  );
  if (!access) return;
  const { actorUserId, record } = access;
  const body = await readJson<InteropRequestBody>(ctx.req);
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
    saveEafImport(ctx, recordId, record, mode.body);
    return;
  }

  if (mode.kind === "import") {
    saveOtioImport(ctx, recordId, record, mode.body);
    return;
  }

  sendInteropExport(ctx, record, body.format);
}

const serveWorkRecordExport = async (
  ctx: RequestContext,
  recordId: string,
): Promise<void> => {
  const access = requireMutationAccess(ctx, recordId, "export");
  if (!access) return;
  const { record } = access;
  const body = await readJson<{ format?: string }>(ctx.req);
  try {
    if (body.format === "zip") {
      const extraFiles = [];
      const demoMotif = path.join(
        ctx.runtime.repoRoot,
        "fixtures/demo/motif.json",
      );
      const usesShippedDemoMotif = record.tracks.some(
        (track) => track.ref === "fixtures/demo/motif.json",
      );
      if (usesShippedDemoMotif && existsSync(demoMotif)) {
        extraFiles.push({ path: "motif.json", bytes: readFileSync(demoMotif) });
      }
      const pkg = exportWorkRecordPackageZip(record, {
        requireConsent: true,
        extraFiles,
      });
      sendBinary(ctx.res, {
        status: 200,
        bytes: pkg.zipBytes,
        contentType: "application/zip",
        filename: `${record.id}.work-record.zip`,
      });
      return;
    }
    const pkg = exportWorkRecordPackage(record, { requireConsent: true });
    sendJson(ctx.res, 200, {
      manifest: pkg.manifest,
      roCrateMetadata: pkg.roCrateMetadata,
      validated: pkg.validated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "export failed";
    if (/consent|use policy/i.test(message)) {
      sendProblem(ctx.res, 403, "Forbidden", message);
      return;
    }
    sendProblem(ctx.res, 400, "Bad Request", message);
  }
}

const serveShare = async (
  ctx: RequestContext,
  recordId: string,
): Promise<void> => {
  const access = requireMutationAccess(ctx, recordId, "share");
  if (!access) return;
  const { record } = access;
  await readJson(ctx.req);
  try {
    buildWorkRecordPackageManifest(record, { requireConsent: true });
    sendJson(ctx.res, 200, { ok: true, recordId: record.id, shared: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "share failed";
    if (/consent|use policy/i.test(message)) {
      sendProblem(ctx.res, 403, "Forbidden", message);
      return;
    }
    sendProblem(ctx.res, 400, "Bad Request", message);
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
