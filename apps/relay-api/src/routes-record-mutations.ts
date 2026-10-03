/**
 * Domain mutation routes for a parsed Practice Relay record resource.
 * Why: mutations share revision-safe persistence and record-role authorization.
 */
import { randomUUID } from "node:crypto";
import {
  COMMAND_PERMISSIONS,
  type UsePolicySnapshot,
  type Track,
  type TrackType,
} from "@practice-relay/work-record";
import { requireMutationAccess } from "./access.ts";
import { readJson, sendJson, sendProblem } from "./api-http.ts";
import {
  attemptRequestOperation,
  attemptRequestValue,
  sendOperationError,
} from "./request-errors.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import type { RecordRouteParams } from "./record-route-types.ts";
import { executeRecordCommand } from "./application/records.ts";
import { simulateAgsScorePassback } from "@practice-relay/lti";

type MutationHandler = (
  ctx: RequestContext,
  recordId: string,
) => Promise<RouteResult>;

type RawTrackBody = {
  id: unknown;
  type: unknown;
  label?: string;
  ref?: string;
};

type RawRegionBody = {
  id: unknown;
  startMs: unknown;
  endMs: unknown;
  label?: unknown;
};

type RawCommentBody = {
  regionId: unknown;
  body: unknown;
  trackId?: string;
  id?: string;
};

const trackTypes: readonly TrackType[] = [
  "audio",
  "video",
  "music_notation",
  "movement_annotation",
  "movement_notation",
  "media_cues",
  "text",
  "assessment",
  "analysis",
];

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

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isTrackType(value: string): value is TrackType {
  return trackTypes.some((trackType) => trackType === value);
}

function trackFromBody(body: {
  id: string;
  type: string;
  label?: string;
  ref?: string;
}): Track {
  if (!isTrackType(body.type)) throw new Error("track type must be supported");
  return {
    id: body.id,
    type: body.type,
    label: body.label,
    ref: body.ref,
  };
}

async function handleTrack(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = await requireMutationAccess(ctx, recordId, COMMAND_PERMISSIONS["add-track"]);
  if (!access) return "handled";
  const body = await readJson<RawTrackBody>(ctx.req);
  if (!isNonemptyString(body.id) || !isNonemptyString(body.type)) {
    sendProblem(ctx.res, 400, "Bad Request", "track id and type required");
    return "handled";
  }
  const trackBody = {
    id: body.id,
    type: body.type,
    label: body.label,
    ref: body.ref,
  };
  const track = attemptRequestValue(ctx.res, () => trackFromBody(trackBody));
  if (!track.ok) return "handled";
  const next = await attemptRequestOperation(ctx.res, () => executeRecordCommand(ctx, recordId,
    { type: "add-track", track: track.value },
  ));
  if (next.ok) sendJson(ctx.res, 200, next.value);
  return "handled";
}

async function handleTake(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = await requireMutationAccess(ctx, recordId, COMMAND_PERMISSIONS["add-take"]);
  if (!access) return "handled";
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
  const next = await attemptRequestOperation(ctx.res, () => executeRecordCommand(ctx, recordId, { type: "add-take", take: { id: body.id, label: body.label } },
  ));
  if (next.ok) sendJson(ctx.res, 200, next.value);
  return "handled";
}

async function handlePreferredTake(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = await requireMutationAccess(ctx, recordId, COMMAND_PERMISSIONS["set-preferred-take"]);
  if (!access) return "handled";
  const body = await readJson<{ takeId: string }>(ctx.req);
  try {
    sendJson(ctx.res, 200, await executeRecordCommand(ctx, recordId, {
      type: "set-preferred-take", takeId: body.takeId,
    }));
  } catch (err) {
    sendOperationError(ctx.res, err);
  }
  return "handled";
}

async function handleRegion(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = await requireMutationAccess(ctx, recordId, COMMAND_PERMISSIONS["add-region"]);
  if (!access) return "handled";
  const body = await readJson<RawRegionBody>(ctx.req);
  if (
    !isNonemptyString(body.id) ||
    !isFiniteNumber(body.startMs) ||
    !isFiniteNumber(body.endMs)
  ) {
    sendProblem(
      ctx.res,
      400,
      "Bad Request",
      "region id, startMs, endMs required",
    );
    return "handled";
  }
  if (body.label !== undefined && typeof body.label !== "string") {
    sendProblem(ctx.res, 400, "Bad Request", "region label must be a string");
    return "handled";
  }
  const region = {
    id: body.id,
    startMs: body.startMs,
    endMs: body.endMs,
    label: body.label as string | undefined,
  };
  const next = await attemptRequestOperation(ctx.res, () => executeRecordCommand(ctx, recordId, { type: "add-region", region },
  ));
  if (next.ok) sendJson(ctx.res, 200, next.value);
  return "handled";
}

async function handleComment(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = await requireMutationAccess(ctx, recordId, COMMAND_PERMISSIONS["add-comment"]);
  if (!access) return "handled";
  const { actorUserId: actor } = access;
  const body = await readJson<RawCommentBody>(ctx.req);
  if (!isNonemptyString(body.regionId) || typeof body.body !== "string") {
    sendProblem(ctx.res, 400, "Bad Request", "regionId and body required");
    return "handled";
  }
  try {
    sendJson(ctx.res, 200, await executeRecordCommand(ctx, recordId, {
      type: "add-comment",
      comment: { regionId: body.regionId, authorId: actor, body: body.body, trackId: body.trackId, id: body.id, createdAt: new Date().toISOString(), resolved: false },
    }));
  } catch (err) {
    sendOperationError(ctx.res, err);
  }
  return "handled";
}

async function handleConsent(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = await requireMutationAccess(ctx, recordId, COMMAND_PERMISSIONS["attach-use-policy-snapshot"]);
  if (!access) return "handled";
  const { actorUserId: actor } = access;
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
  const next = await attemptRequestOperation(ctx.res, () => executeRecordCommand(ctx, recordId, { type: "attach-use-policy-snapshot", policy: consent },
  ));
  if (next.ok) sendJson(ctx.res, 200, next.value);
  return "handled";
}

async function handleSubmit(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = await requireMutationAccess(ctx, recordId, COMMAND_PERMISSIONS["submit-version"]);
  if (!access) return "handled";
  const { actorUserId: actor } = access;
  const body = await readJson<{ name: string }>(ctx.req);
  if (!body.name) {
    sendProblem(ctx.res, 400, "Bad Request", "name required");
    return "handled";
  }
  const next = await attemptRequestOperation(ctx.res, () => executeRecordCommand(ctx, recordId, { type: "submit-version", name: body.name, createdAt: new Date().toISOString() },
  ));
  if (next.ok) {
    const ags = simulateAgsScorePassback({ recordId, userId: actor });
    sendJson(ctx.res, 200, { ...next.value, ags });
  }
  return "handled";
}

async function handleAnalysis(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = await requireMutationAccess(ctx, recordId, COMMAND_PERMISSIONS["add-analysis-track"]);
  if (!access) return "handled";
  const body = await readJson<Partial<Track> & { type?: TrackType }>(ctx.req);
  const track: Track = {
    id: body.id ?? `analysis-${randomUUID()}`,
    type: body.type ?? "analysis",
    label: body.label,
    ref: body.ref,
  };
  try {
    sendJson(ctx.res, 200, await executeRecordCommand(ctx, recordId, {
      type: "add-analysis-track", track,
    }));
  } catch (err) {
    sendOperationError(ctx.res, err);
  }
  return "handled";
}

async function handleMvei(
  ctx: RequestContext,
  recordId: string,
): Promise<RouteResult> {
  const access = await requireMutationAccess(ctx, recordId, COMMAND_PERMISSIONS["attach-mvei-motif-track"]);
  if (!access) return "handled";
  const body = await readJson<{ id?: string; ref: string; label?: string }>(
    ctx.req,
  );
  if (!body.ref) {
    sendProblem(ctx.res, 400, "Bad Request", "ref to Motif JSON required");
    return "handled";
  }
  try {
    sendJson(ctx.res, 200, await executeRecordCommand(ctx, recordId, {
      type: "attach-mvei-motif-track",
      track: { id: body.id ?? `mvei-${randomUUID()}`, ref: body.ref, label: body.label },
    }));
  } catch (err) {
    sendOperationError(ctx.res, err);
  }
  return "handled";
}

const mutationHandlers: ReadonlyMap<string, MutationHandler> = new Map([
  ["POST:tracks", handleTrack],
  ["POST:takes", handleTake],
  ["PUT:preferred-take", handlePreferredTake],
  ["POST:regions", handleRegion],
  ["POST:comments", handleComment],
  ["POST:consent", handleConsent],
  ["POST:submit", handleSubmit],
  ["POST:analysis", handleAnalysis],
  ["POST:mvei", handleMvei],
]);

/** Handle ordinary domain mutations for an already parsed generic record route. */
export async function handleRecordMutationRoute(
  ctx: RequestContext,
  params: RecordRouteParams,
): Promise<RouteResult> {
  const handler = mutationHandlers.get(`${ctx.method}:${params.action ?? ""}`);
  if (handler === undefined) return "unmatched";
  return handler(ctx, params.recordId);
}
