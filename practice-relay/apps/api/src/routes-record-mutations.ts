/**
 * Domain mutation routes for a parsed Practice Relay record resource.
 * Why: mutations share revision-safe persistence and record-role authorization.
 */
import { randomUUID } from "node:crypto";
import {
  addAnalysisTrack,
  addComment,
  addRegion,
  addTake,
  addTrack,
  attachUsePolicySnapshot,
  attachMveiMotifTrack,
  setPreferredTake,
  submitVersion,
  type UsePolicySnapshot,
  type Track,
  type TrackType,
} from "@practice-relay/work-record-core";
import { requireMutationAccess } from "./access.ts";
import { readJson, sendJson, sendProblem } from "./api-http.ts";
import {
  attemptRequestValue,
  sendOperationError,
} from "./request-errors.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import type { RecordRouteParams } from "./record-route-types.ts";
import { persistRecord } from "./record-service.ts";
import { simulateAgsScorePassback } from "../../lti/src/index.mjs";

/** Handle ordinary domain mutations for an already parsed generic record route. */
export async function handleRecordMutationRoute(
  ctx: RequestContext,
  params: RecordRouteParams,
): Promise<RouteResult> {
  const handler = mutationHandlers[`${ctx.method}:${params.action ?? ""}`];
  return handler ? handler(ctx, params.recordId) : "unmatched";
}

type MutationHandler = (
  ctx: RequestContext,
  recordId: string,
) => Promise<RouteResult>;

const mutationHandlers: Readonly<Record<string, MutationHandler>> = {
  "POST:tracks": handleTrack,
  "POST:takes": handleTake,
  "PUT:preferred-take": handlePreferredTake,
  "POST:regions": handleRegion,
  "POST:comments": handleComment,
  "POST:consent": handleConsent,
  "POST:submit": handleSubmit,
  "POST:analysis": handleAnalysis,
  "POST:mvei": handleMvei,
};

async function handleTrack(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = requireMutationAccess(ctx, recordId, "add_track");
  if (!access) return "handled";
  const { record } = access;
  const body = await readJson<Track>(ctx.req);
  if (!body.id || !body.type) {
    sendProblem(ctx.res, 400, "Bad Request", "track id and type required");
    return "handled";
  }
  const next = attemptRequestValue(ctx.res, () =>
    addTrack(record, {
      id: body.id,
      type: body.type,
      label: body.label,
      ref: body.ref,
    }),
  );
  if (next.ok) {
    sendJson(ctx.res, 200, persistRecord(ctx.runtime, recordId, next.value));
  }
  return "handled";
}

async function handleTake(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = requireMutationAccess(ctx, recordId, "add_take");
  if (!access) return "handled";
  const { record } = access;
  const body = await readJson<{
    id: string;
    label?: string;
    mediaPath?: string;
    storageKey?: string;
    contentType?: string;
    sha256?: string;
    byteSize?: number;
  }>(ctx.req);
  if (!body.id) {
    sendProblem(ctx.res, 400, "Bad Request", "take id required");
    return "handled";
  }
  if (hasCallerMediaMetadata(body)) {
    sendProblem(
      ctx.res,
      400,
      "Bad Request",
      "media metadata is assigned only by media upload",
    );
    return "handled";
  }
  const next = attemptRequestValue(ctx.res, () =>
    addTake(record, { id: body.id, label: body.label }),
  );
  if (next.ok) {
    sendJson(ctx.res, 200, persistRecord(ctx.runtime, recordId, next.value));
  }
  return "handled";
}

function hasCallerMediaMetadata(body: {
  mediaPath?: string;
  storageKey?: string;
  contentType?: string;
  sha256?: string;
  byteSize?: number;
}): boolean {
  return (
    body.mediaPath !== undefined ||
    body.storageKey !== undefined ||
    body.contentType !== undefined ||
    body.sha256 !== undefined ||
    body.byteSize !== undefined
  );
}

async function handlePreferredTake(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = requireMutationAccess(ctx, recordId, "set_preferred_take");
  if (!access) return "handled";
  const { record } = access;
  const body = await readJson<{ takeId: string }>(ctx.req);
  try {
    const next = setPreferredTake(record, body.takeId);
    sendJson(ctx.res, 200, persistRecord(ctx.runtime, recordId, next));
  } catch (err) {
    sendOperationError(ctx.res, err, "invalid takeId");
  }
  return "handled";
}

async function handleRegion(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = requireMutationAccess(ctx, recordId, "add_region");
  if (!access) return "handled";
  const { record } = access;
  const body = await readJson<{
    id: string;
    startMs: number;
    endMs: number;
    label?: string;
  }>(ctx.req);
  if (!body.id || body.startMs == null || body.endMs == null) {
    sendProblem(
      ctx.res,
      400,
      "Bad Request",
      "region id, startMs, endMs required",
    );
    return "handled";
  }
  const next = attemptRequestValue(ctx.res, () =>
    addRegion(record, {
      id: body.id,
      startMs: body.startMs,
      endMs: body.endMs,
      label: body.label,
    }),
  );
  if (next.ok) {
    sendJson(ctx.res, 200, persistRecord(ctx.runtime, recordId, next.value));
  }
  return "handled";
}

async function handleComment(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = requireMutationAccess(ctx, recordId, "add_comment");
  if (!access) return "handled";
  const { actorUserId: actor, record } = access;
  const body = await readJson<{
    regionId: string;
    body: string;
    trackId?: string;
    id?: string;
  }>(ctx.req);
  if (!body.regionId || body.body == null) {
    sendProblem(ctx.res, 400, "Bad Request", "regionId and body required");
    return "handled";
  }
  try {
    const next = addComment(record, {
      regionId: body.regionId,
      authorId: actor,
      body: body.body,
      trackId: body.trackId,
      id: body.id,
      resolved: false,
    });
    sendJson(ctx.res, 200, persistRecord(ctx.runtime, recordId, next));
  } catch (err) {
    sendOperationError(ctx.res, err, "invalid comment");
  }
  return "handled";
}

async function handleConsent(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = requireMutationAccess(ctx, recordId, "attach_use_policy");
  if (!access) return "handled";
  const { actorUserId: actor, record } = access;
  const body = await readJson<Partial<UsePolicySnapshot>>(ctx.req);
  if (!Array.isArray(body.purposes)) {
    sendProblem(ctx.res, 400, "Bad Request", "purposes required");
    return "handled";
  }
  const consent: UsePolicySnapshot = {
    id: body.id ?? `consent-${randomUUID()}`,
    subjectId: actor,
    purposes: body.purposes,
    exportAllowed: body.exportAllowed,
    createdAt: body.createdAt ?? new Date().toISOString(),
  };
  const next = attemptRequestValue(ctx.res, () => attachUsePolicySnapshot(record, consent));
  if (next.ok) {
    sendJson(ctx.res, 200, persistRecord(ctx.runtime, recordId, next.value));
  }
  return "handled";
}

async function handleSubmit(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = requireMutationAccess(ctx, recordId, "submit");
  if (!access) return "handled";
  const { actorUserId: actor, record } = access;
  const body = await readJson<{ name: string }>(ctx.req);
  if (!body.name) {
    sendProblem(ctx.res, 400, "Bad Request", "name required");
    return "handled";
  }
  const next = attemptRequestValue(ctx.res, () => submitVersion(record, body.name));
  if (next.ok) {
    const saved = persistRecord(ctx.runtime, recordId, next.value);
    const ags = simulateAgsScorePassback({ recordId: record.id, userId: actor });
    sendJson(ctx.res, 200, { ...saved, ags });
  }
  return "handled";
}

async function handleAnalysis(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = requireMutationAccess(ctx, recordId, "analysis");
  if (!access) return "handled";
  const { record } = access;
  const body = await readJson<Partial<Track> & { type?: TrackType }>(ctx.req);
  const track: Track = {
    id: body.id ?? `analysis-${randomUUID()}`,
    type: (body.type as TrackType) ?? "analysis",
    label: body.label,
    ref: body.ref,
  };
  try {
    const next = addAnalysisTrack(record, track);
    sendJson(ctx.res, 200, persistRecord(ctx.runtime, recordId, next));
  } catch (err) {
    sendOperationError(ctx.res, err, "analysis rejected");
  }
  return "handled";
}

async function handleMvei(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = requireMutationAccess(ctx, recordId, "attach_mvei");
  if (!access) return "handled";
  const { record } = access;
  const body = await readJson<{ id?: string; ref: string; label?: string }>(
    ctx.req,
  );
  if (!body.ref) {
    sendProblem(ctx.res, 400, "Bad Request", "ref to Motif JSON required");
    return "handled";
  }
  try {
    const next = attachMveiMotifTrack(record, {
      id: body.id ?? `mvei-${randomUUID()}`,
      ref: body.ref,
      label: body.label,
    });
    sendJson(ctx.res, 200, persistRecord(ctx.runtime, recordId, next));
  } catch (err) {
    sendOperationError(ctx.res, err, "mvei attach failed");
  }
  return "handled";
}
