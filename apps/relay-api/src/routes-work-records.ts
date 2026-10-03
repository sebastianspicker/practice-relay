/** Evidence, subject, policy, snapshot, and RO-Crate HTTP routes. */
import { createHash, randomUUID } from "node:crypto";
import {
  COMMAND_PERMISSIONS,
  PROFILE_DEFINITIONS,
  transitionWorkRecord,
  type Artifact,
  type Snapshot,
  type UsePolicy,
  type WorkAnnotation,
} from "@practice-relay/work-record";
import { requireMutationAccess } from "./access.ts";
import { readJson, sendJson, sendProblem, validResourceId } from "./api-http.ts";
import { explicitEvidenceExport } from "./application/evidence.ts";
import { executeRecordCommand, mutateRecord } from "./application/records.ts";
import { sendOperationError } from "./request-errors.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";

const nonBlank = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function validAnnotationTarget(target: unknown): target is WorkAnnotation["target"] {
  if (typeof target === "string") return true;
  if (target === null || Array.isArray(target) || typeof target !== "object") return false;
  return typeof Object.getOwnPropertyDescriptor(target, "source")?.value === "string";
}

function digest(record: object): string {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

async function addSubject(ctx: RequestContext, recordId: string): Promise<void> {
  const access = await requireMutationAccess(ctx, recordId, COMMAND_PERMISSIONS["add-subject"]);
  if (!access) return;
  const body = await readJson<{ id?: unknown; label?: unknown; type?: unknown }>(ctx.req);
  const id = nonBlank(body.id) ? body.id.trim() : `subject-${randomUUID()}`;
  const type = body.type ?? "Person";
  if (!validResourceId(id) || !nonBlank(body.label) || !["Person", "Group", "Place", "Other"].includes(String(type))) {
    sendProblem(ctx.res, 400, "Bad Request", "valid subject id, label, and type are required");
    return;
  }
  try {
    sendJson(ctx.res, 201, await executeRecordCommand(ctx, recordId, {
      type: "add-subject", subject: { id, label: body.label.trim(), type: type as "Person" | "Group" | "Place" | "Other" },
    }));
  } catch (error) { sendOperationError(ctx.res, error); }
}

async function addArtifact(ctx: RequestContext, recordId: string): Promise<void> {
  const access = await requireMutationAccess(ctx, recordId, COMMAND_PERMISSIONS["add-artifact"]);
  if (!access) return;
  const body = await readJson<Partial<Artifact>>(ctx.req);
  const id = nonBlank(body.id) ? body.id.trim() : `artifact-${randomUUID()}`;
  if (!validResourceId(id) || !nonBlank(body.name) || (body.representedSubjectIds !== undefined && (!Array.isArray(body.representedSubjectIds) || body.representedSubjectIds.some((item) => !nonBlank(item))))) {
    sendProblem(ctx.res, 400, "Bad Request", "valid artifact id, name, and represented subject ids are required");
    return;
  }
  try {
    sendJson(ctx.res, 201, await executeRecordCommand(ctx, recordId, {
      type: "add-artifact", artifact: { id, name: body.name.trim(), mediaType: body.mediaType, contentUrl: body.contentUrl, sha256: body.sha256, representedSubjectIds: body.representedSubjectIds ?? [], preservationRequired: body.preservationRequired ?? false },
    }));
  } catch (error) { sendOperationError(ctx.res, error); }
}

async function addAnnotation(ctx: RequestContext, recordId: string): Promise<void> {
  const access = await requireMutationAccess(ctx, recordId, COMMAND_PERMISSIONS["add-annotation"]);
  if (!access) return;
  const body = await readJson<{ body?: unknown; target?: unknown }>(ctx.req);
  if (body.body === undefined || !validAnnotationTarget(body.target)) {
    sendProblem(ctx.res, 400, "Bad Request", "annotation body and target are required");
    return;
  }
  const annotation: WorkAnnotation = { "@context": "http://www.w3.org/ns/anno.jsonld", id: `annotation-${randomUUID()}`, type: "Annotation", body: body.body, target: body.target, creator: access.actorUserId, created: new Date().toISOString() };
  try { sendJson(ctx.res, 201, await executeRecordCommand(ctx, recordId, { type: "add-annotation", annotation }));
  } catch (error) { sendOperationError(ctx.res, error); }
}

async function addPolicy(ctx: RequestContext, recordId: string): Promise<void> {
  const access = await requireMutationAccess(ctx, recordId, COMMAND_PERMISSIONS["add-use-policy"]);
  if (!access) return;
  const body = await readJson<Partial<UsePolicy>>(ctx.req);
  const id = nonBlank(body.id) ? body.id : `policy-${randomUUID()}`;
  if (!validResourceId(id) || !nonBlank(body.representedSubjectId) || !nonBlank(body.purpose) || !nonBlank(body.destination) || !["granted", "denied", "withdrawn"].includes(String(body.state))) {
    sendProblem(ctx.res, 400, "Bad Request", "valid policy id, subject, purpose, destination, and state are required");
    return;
  }
  try { sendJson(ctx.res, 201, await executeRecordCommand(ctx, recordId, {
    type: "add-use-policy", policy: { id, representedSubjectId: body.representedSubjectId, purpose: body.purpose.trim(), destination: body.destination.trim(), state: body.state as UsePolicy["state"], createdAt: new Date().toISOString(), evidenceRef: body.evidenceRef },
  }));
  } catch (error) { sendOperationError(ctx.res, error); }
}

async function addSnapshot(ctx: RequestContext, recordId: string): Promise<void> {
  const access = await requireMutationAccess(ctx, recordId, COMMAND_PERMISSIONS["add-snapshot"]);
  if (!access) return;
  const body = await readJson<{ id?: unknown; reason?: unknown }>(ctx.req);
  const id = nonBlank(body.id) ? body.id : `snapshot-${randomUUID()}`;
  if (!validResourceId(id)) { sendProblem(ctx.res, 400, "Bad Request", "snapshot id must be valid"); return; }
  try {
    const saved = await mutateRecord(ctx, recordId, (latest) => {
      const snapshot: Snapshot = { id, createdAt: new Date().toISOString(), artifactIds: latest.artifacts.map((artifact) => artifact.id), reason: nonBlank(body.reason) ? body.reason.trim() : `sha256:${digest(latest)}` };
      return transitionWorkRecord(latest, { type: "add-snapshot", snapshot });
    }, { mutations: [COMMAND_PERMISSIONS["add-snapshot"]], kind: "add-snapshot" });
    sendJson(ctx.res, 201, saved.snapshots.find((snapshot) => snapshot.id === id));
  } catch (error) { sendOperationError(ctx.res, error); }
}

async function exportRecord(ctx: RequestContext, recordId: string): Promise<void> {
  const access = await requireMutationAccess(ctx, recordId, "export");
  if (!access) return;
  const body = await readJson<{ purpose?: unknown; destination?: unknown }>(ctx.req);
  const current = await requireMutationAccess(ctx, recordId, "export");
  if (!current) return;
  const exported = explicitEvidenceExport(current.record, nonBlank(body.purpose) ? body.purpose.trim() : "", nonBlank(body.destination) ? body.destination.trim() : "");
  sendJson(ctx.res, exported.decision.allowed ? 200 : 422, exported);
}

/** Handle profile discovery and evidence child resources only; core owns base records. */
export async function handleWorkRecordRoutes(ctx: RequestContext): Promise<RouteResult> {
  if (ctx.pathname === "/profiles" && ctx.method === "GET") { sendJson(ctx.res, 200, PROFILE_DEFINITIONS); return "handled"; }
  const match = ctx.pathname.match(/^\/work-records\/([^/]+)\/(subjects|artifacts|annotations|policies|snapshots|exports)$/);
  if (!match || ctx.method !== "POST") return "unmatched";
  const recordId = decodeURIComponent(match[1]!);
  switch (match[2]) {
    case "subjects": await addSubject(ctx, recordId); break;
    case "artifacts": await addArtifact(ctx, recordId); break;
    case "annotations": await addAnnotation(ctx, recordId); break;
    case "policies": await addPolicy(ctx, recordId); break;
    case "snapshots": await addSnapshot(ctx, recordId); break;
    case "exports": await exportRecord(ctx, recordId); break;
  }
  return "handled";
}
