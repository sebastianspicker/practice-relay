/**
 * Evidence, represented-subject, policy, snapshot, and RO-Crate routes.
 * Why: these WorkRecord concerns extend the core lifecycle without a second store.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  PROFILE_DEFINITIONS,
  evaluateExport,
  writeRoCrate13,
  type Artifact,
  type Snapshot,
  type UsePolicy,
  type WorkAnnotation,
  type WorkRecord,
} from "@practice-relay/work-record-core";
import { requireActor } from "./access.ts";
import { readJson, sendJson, sendProblem, validResourceId } from "./api-http.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { persistRecord } from "./record-service.ts";

const nonBlank = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0;
}

const evidenceRoleByMemberRole: Readonly<Record<string, string>> = {
  admin: "owner",
  faculty: "steward",
  student: "contributor",
  guest: "viewer",
};

function recordRole(record: WorkRecord, actorId: string): string[] {
  const actorRoles = record.actors.find((actor) => actor.id === actorId)?.roles ?? [];
  const memberRole = record.members.find((member) => member.userId === actorId)?.role;
  const evidenceRole = memberRole ? evidenceRoleByMemberRole[memberRole] : undefined;
  return evidenceRole ? [...actorRoles, evidenceRole] : actorRoles;
}

function requireRecord(
  ctx: RequestContext,
  id: string,
  actorId: string,
  roles: readonly string[],
): WorkRecord | undefined {
  if (!validResourceId(id)) {
    sendProblem(ctx.res, 400, "Bad Request", "invalid WorkRecord id");
    return undefined;
  }
  const record = ctx.runtime.recordStore.get(id);
  if (!record) {
    sendProblem(ctx.res, 404, "Not Found", `WorkRecord ${id} not found`);
    return undefined;
  }
  if (!recordRole(record, actorId).some((role) => roles.includes(role))) {
    sendProblem(ctx.res, 403, "Forbidden", "WorkRecord role denied");
    return undefined;
  }
  return record;
}

function workRecordDigest(record: WorkRecord): string {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

async function handleTopLevel(ctx: RequestContext): Promise<RouteResult> {
  if (ctx.pathname === "/profiles" && ctx.method === "GET") {
    sendJson(ctx.res, 200, PROFILE_DEFINITIONS);
    return "handled";
  }
  return "unmatched";
}

async function addSubject(ctx: RequestContext, record: WorkRecord): Promise<RouteResult> {
  const body = await readJson<{ id?: unknown; label?: unknown; type?: unknown }>(ctx.req);
  const id = nonBlank(body.id) ? body.id.trim() : `subject-${randomUUID()}`;
  const type = body.type ?? "Person";
  const validType = ["Person", "Group", "Place", "Other"].includes(String(type));
  if (!validResourceId(id) || !nonBlank(body.label) || !validType || record.representedSubjects.some((subject) => subject.id === id)) {
    sendProblem(ctx.res, 400, "Bad Request", "valid, unique subject id, label, and type are required");
    return "handled";
  }
  record.representedSubjects.push({ id, label: body.label.trim(), type: type as "Person" | "Group" | "Place" | "Other" });
  sendJson(ctx.res, 201, persistRecord(ctx.runtime, record.id, record));
  return "handled";
}

function artifactIdentityProblem(
  record: WorkRecord,
  body: Partial<Artifact>,
  id: string,
): string | undefined {
  if (
    !validResourceId(id) ||
    !nonBlank(body.name) ||
    record.artifacts.some((item) => item.id === id)
  ) return "unique artifact id and name are required";
  return undefined;
}

function representedSubjectsShapeProblem(
  subjectIds: Artifact["representedSubjectIds"] | undefined,
): string | undefined {
  if (subjectIds === undefined) return undefined;
  if (!Array.isArray(subjectIds) || subjectIds.some((id) => !nonBlank(id))) {
    return "representedSubjectIds must contain valid strings";
  }
  return undefined;
}

function unknownRepresentedSubjectProblem(
  record: WorkRecord,
  subjectIds: readonly string[],
): string | undefined {
  const unknown = subjectIds.find((subjectId) =>
    !record.representedSubjects.some((subject) => subject.id === subjectId));
  return unknown ? `unknown represented subject ${unknown}` : undefined;
}

function artifactHashProblem(sha256: Artifact["sha256"] | undefined): string | undefined {
  if (sha256 !== undefined && (!nonBlank(sha256) || !/^[a-fA-F0-9]{64}$/.test(sha256))) {
    return "sha256 must contain exactly 64 hexadecimal characters";
  }
  return undefined;
}

function artifactPreservationProblem(body: Partial<Artifact>): string | undefined {
  if (body.preservationRequired && (!nonBlank(body.contentUrl) || !body.sha256)) {
    return "preservation evidence requires a content URL and SHA-256 hash";
  }
  return undefined;
}

const artifactProblem = (
  record: WorkRecord,
  body: Partial<Artifact>,
  id: string,
): string | undefined => {
  const identityProblem = artifactIdentityProblem(record, body, id);
  if (identityProblem) return identityProblem;
  const subjectsProblem = representedSubjectsShapeProblem(body.representedSubjectIds);
  if (subjectsProblem) return subjectsProblem;
  const hashProblem = artifactHashProblem(body.sha256);
  if (hashProblem) return hashProblem;
  const preservationProblem = artifactPreservationProblem(body);
  if (preservationProblem) return preservationProblem;
  return unknownRepresentedSubjectProblem(
    record,
    body.representedSubjectIds ?? [],
  );
}

async function addArtifact(ctx: RequestContext, record: WorkRecord): Promise<RouteResult> {
  const body = await readJson<Partial<Artifact>>(ctx.req);
  const id = nonBlank(body.id) ? body.id.trim() : `artifact-${randomUUID()}`;
  const problem = artifactProblem(record, body, id);
  if (problem) {
    sendProblem(ctx.res, 400, "Bad Request", problem);
    return "handled";
  }
  record.artifacts.push({
    id, name: body.name!.trim(), mediaType: body.mediaType, contentUrl: body.contentUrl,
    sha256: body.sha256, representedSubjectIds: body.representedSubjectIds ?? [],
    preservationRequired: body.preservationRequired ?? false,
  });
  sendJson(ctx.res, 201, persistRecord(ctx.runtime, record.id, record));
  return "handled";
}

async function addAnnotation(ctx: RequestContext, record: WorkRecord, actorId: string): Promise<RouteResult> {
  const body = await readJson<{ body?: unknown; target?: unknown }>(ctx.req);
  const targetValid = typeof body.target === "string" || (body.target !== null && typeof body.target === "object");
  if (body.body === undefined || !targetValid) {
    sendProblem(ctx.res, 400, "Bad Request", "annotation body and target are required");
    return "handled";
  }
  const annotation: WorkAnnotation = {
    "@context": "http://www.w3.org/ns/anno.jsonld", id: `annotation-${randomUUID()}`,
    type: "Annotation", body: body.body, target: body.target as WorkAnnotation["target"],
    creator: actorId, created: new Date().toISOString(),
  };
  record.annotations.push(annotation);
  sendJson(ctx.res, 201, persistRecord(ctx.runtime, record.id, record));
  return "handled";
}

async function addPolicy(ctx: RequestContext, record: WorkRecord): Promise<RouteResult> {
  const body = await readJson<Partial<UsePolicy>>(ctx.req);
  const knownSubject = nonBlank(body.representedSubjectId) &&
    record.representedSubjects.some((subject) => subject.id === body.representedSubjectId);
  const validState = ["granted", "denied", "withdrawn"].includes(String(body.state));
  if (!knownSubject || !nonBlank(body.purpose) || !nonBlank(body.destination) || !validState) {
    sendProblem(ctx.res, 400, "Bad Request", "known subject, purpose, destination, and explicit policy state are required");
    return "handled";
  }
  const id = nonBlank(body.id) ? body.id : `policy-${randomUUID()}`;
  if (!validResourceId(id) || record.usePolicies.some((policy) => policy.id === id)) {
    sendProblem(ctx.res, 400, "Bad Request", "policy id must be unique and valid");
    return "handled";
  }
  record.usePolicies.push({
    id, representedSubjectId: body.representedSubjectId!, purpose: body.purpose.trim(),
    destination: body.destination.trim(), state: body.state as UsePolicy["state"],
    createdAt: new Date().toISOString(), evidenceRef: body.evidenceRef,
  });
  sendJson(ctx.res, 201, persistRecord(ctx.runtime, record.id, record));
  return "handled";
}

async function addSnapshot(ctx: RequestContext, record: WorkRecord): Promise<RouteResult> {
  const body = await readJson<{ id?: unknown; reason?: unknown }>(ctx.req);
  const id = nonBlank(body.id) ? body.id : `snapshot-${randomUUID()}`;
  if (!validResourceId(id) || record.snapshots.some((snapshot) => snapshot.id === id)) {
    sendProblem(ctx.res, 400, "Bad Request", "snapshot id must be unique and valid");
    return "handled";
  }
  const snapshot: Snapshot = {
    id, createdAt: new Date().toISOString(), artifactIds: record.artifacts.map((artifact) => artifact.id),
    reason: nonBlank(body.reason) ? body.reason.trim() : `sha256:${workRecordDigest(record)}`,
  };
  record.snapshots.push(snapshot);
  persistRecord(ctx.runtime, record.id, record);
  sendJson(ctx.res, 201, snapshot);
  return "handled";
}

async function exportRecord(ctx: RequestContext, record: WorkRecord): Promise<RouteResult> {
  const body = await readJson<{ purpose?: unknown; destination?: unknown }>(ctx.req);
  const decision = evaluateExport(record, {
    purpose: nonBlank(body.purpose) ? body.purpose.trim() : "",
    destination: nonBlank(body.destination) ? body.destination.trim() : "",
  });
  sendJson(ctx.res, decision.allowed ? 200 : 422,
    decision.allowed ? { decision, roCrate: writeRoCrate13(record) } : { decision });
  return "handled";
}

async function postChild(ctx: RequestContext, record: WorkRecord, actorId: string, child: string): Promise<RouteResult> {
  if (child === "subjects") return addSubject(ctx, record);
  if (child === "artifacts") return addArtifact(ctx, record);
  if (child === "annotations") return addAnnotation(ctx, record, actorId);
  if (child === "policies") return addPolicy(ctx, record);
  if (child === "snapshots") return addSnapshot(ctx, record);
  if (child === "exports") return exportRecord(ctx, record);
  return "unmatched";
}

const directRecordRoles = [
  "owner",
  "steward",
  "contributor",
  "reviewer",
  "viewer",
];

async function handleDirectRecord(
  ctx: RequestContext,
  id: string,
  actorId: string,
): Promise<RouteResult> {
  if (ctx.method === "GET") {
    const record = requireRecord(ctx, id, actorId, directRecordRoles);
    if (record) sendJson(ctx.res, 200, record);
    return "handled";
  }
  if (ctx.method !== "PATCH") return "unmatched";
  const record = requireRecord(ctx, id, actorId, ["owner", "steward"]);
  if (!record) return "handled";
  const body = await readJson<{ title?: unknown }>(ctx.req);
  if (!nonBlank(body.title)) {
    sendProblem(ctx.res, 400, "Bad Request", "non-empty title is required");
  } else {
    record.title = body.title.trim();
    sendJson(ctx.res, 200, persistRecord(ctx.runtime, record.id, record));
  }
  return "handled";
}

const childRoles: Readonly<Record<string, readonly string[]>> = {
  exports: ["owner", "steward", "reviewer"],
  policies: ["owner", "steward"],
  subjects: ["owner", "steward", "contributor"],
  artifacts: ["owner", "steward", "contributor"],
  annotations: ["owner", "steward", "contributor"],
  snapshots: ["owner", "steward", "contributor"],
};

const handleRecordResource = async (ctx: RequestContext): Promise<RouteResult> => {
  const match = ctx.pathname.match(/^\/work-records\/([^/]+)(?:\/(subjects|artifacts|annotations|policies|snapshots|exports))?$/);
  if (!match) return "unmatched";
  const id = decodeURIComponent(match[1]!);
  const child = match[2];
  const actorId = requireActor(ctx);
  if (!actorId) return "handled";
  if (!child) return handleDirectRecord(ctx, id, actorId);
  if (ctx.method !== "POST") return "unmatched";
  const roles = childRoles[child];
  if (!roles) return "unmatched";
  const record = requireRecord(ctx, id, actorId, roles);
  return record ? postChild(ctx, record, actorId, child) : "handled";
}

/** Handle profile discovery, WorkRecord lifecycle, export, and explicit imports. */
export async function handleWorkRecordRoutes(ctx: RequestContext): Promise<RouteResult> {
  const topLevel = await handleTopLevel(ctx);
  if (topLevel === "handled") return topLevel;
  return handleRecordResource(ctx);
}
