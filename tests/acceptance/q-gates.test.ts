/**
 * Acceptance Q-gates - drive shipped domain, package-export, and API.
 * Maps to practice-relay/docs/acceptance-criteria.md
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addComment,
  addMember,
  addRegion,
  addTake,
  addTrack,
  annotationTrackLabel,
  assertCanExport,
  assertCanMutate,
  attachUsePolicySnapshot,
  attachMveiMotifTrack,
  createEmptyRecord,
  FORBIDDEN_STRINGS,
  getVersionTag,
  hasExportableUsePolicy,
  resolveComment,
  WORK_RECORD_SCHEMA_VERSION,
  setPreferredTake,
  submitVersion,
  type WorkRecord,
} from "@practice-relay/work-record-core";
import {
  exportWorkRecordPackage,
  validateWorkRecordPackageManifest,
} from "@practice-relay/work-record-package";
import { handleRequest } from "@practice-relay/api";
import {
  mockReq,
  mockRes,
} from "../../practice-relay/apps/api/src/test-support/http-mocks.ts";

async function api(
  method: string,
  url: string,
  body?: unknown,
  userId: "teacher-1" | "student-1" = "teacher-1",
): Promise<{ status: number; json: unknown }> {
  const authorization = await bearerFor(userId);
  const res = mockRes();
  await handleRequest(
    mockReq(url, method, body, { authorization }),
    res as unknown as ServerResponse,
  );
  return {
    status: res.statusCode,
    json: res.body ? JSON.parse(res.body) : null,
  };
}

const LOGIN_PASSWORDS = {
  "teacher-1": "teach",
  "student-1": "learn",
} as const;
const sessions = new Map<keyof typeof LOGIN_PASSWORDS, string>();

/** Obtain a real course-local session so Q-gates never spoof route actors. */
async function bearerFor(userId: keyof typeof LOGIN_PASSWORDS): Promise<string> {
  const existing = sessions.get(userId);
  if (existing) return existing;
  const res = mockRes();
  await handleRequest(
    mockReq("/auth/login", "POST", {
      userId,
      password: LOGIN_PASSWORDS[userId],
    }),
    res as unknown as ServerResponse,
  );
  assert.equal(res.statusCode, 200, `login failed for ${userId}`);
  const token = (JSON.parse(res.body) as { token: string }).token;
  const bearer = `Bearer ${token}`;
  sessions.set(userId, bearer);
  return bearer;
}

function multiDomainScore(id: string): WorkRecord {
  let s = createEmptyRecord(id, "Acceptance score");
  s = addTrack(s, { id: "tr-v", type: "video", ref: "media/a.mp4" });
  s = addTrack(s, { id: "tr-a", type: "audio", ref: "media/a.wav" });
  s = addTrack(s, {
    id: "tr-m",
    type: "music_notation",
    ref: "score.musicxml",
  });
  s = addTrack(s, {
    id: "tr-ann",
    type: "movement_annotation",
    label: annotationTrackLabel(),
  });
  s = addTake(s, { id: "take-1", label: "Run 1", mediaPath: "media/t1.mp4" });
  return s;
}

test("Q1 stable workRecordId + schemaVersion", async () => {
  const id = `ps-q1-${randomUUID()}`;
  const created = await api("POST", "/work-records", { id, title: "Q1" });
  assert.equal(created.status, 201);
  const body = created.json as { id: string; schemaVersion: string };
  assert.equal(body.id, id);
  assert.equal(body.schemaVersion, WORK_RECORD_SCHEMA_VERSION);

  const got = await api("GET", `/work-records/${id}`);
  assert.equal(got.status, 200);
  assert.equal((got.json as { id: string }).id, id);
  assert.equal(
    (got.json as { schemaVersion: string }).schemaVersion,
    WORK_RECORD_SCHEMA_VERSION,
  );
});

test("Q2 preferred take", () => {
  let s = multiDomainScore("ps-q2");
  s = setPreferredTake(s, "take-1");
  assert.equal(s.preferredTakeId, "take-1");
  assert.throws(() => setPreferredTake(s, "nope"), /takeId/);
});

test("Q3 roles enforce edit rights (student cannot admin)", async () => {
  const id = `ps-q3-${randomUUID()}`;
  await api("POST", "/work-records", { id, title: "Roles" });
  // Creator is faculty; establish the student membership through that session.
  const r = await api("POST", `/work-records/${id}/members`, {
    userId: "student-1",
    role: "student",
  });
  assert.equal(r.status, 200);
  const members = (r.json as { members: { role: string }[] }).members;
  assert.equal(members.length, 2);
  assert.ok(members.some((m) => m.role === "student"));
  assert.ok(members.some((m) => m.role === "faculty"));

  // Student denied admin/member edit
  const denied = await api("PATCH", `/work-records/${id}`, {
    members: [{ userId: "student-1", role: "admin" }],
  }, "student-1");
  assert.equal(denied.status, 403);
  assert.match(String((denied.json as { detail?: string }).detail), /role denied|student cannot admin/i);

  // Faculty may submit
  const submit = await api("POST", `/work-records/${id}/submit`, {
    name: "submit-q3",
  });
  assert.equal(submit.status, 200);

  // Domain assertCanMutate agrees
  let s = createEmptyRecord("ps-q3-dom", "D");
  s = addMember(s, { userId: "u-student", role: "student" });
  assert.throws(() => assertCanMutate(s, "u-student", "edit_members"), /role denied/i);
});

test("Q4 comments on region + resolve", async () => {
  let s = createEmptyRecord("ps-q4", "Comments");
  s = addRegion(s, { id: "r1", startMs: 100, endMs: 2000 });
  s = addComment(s, {
    id: "cmt-q4",
    regionId: "r1",
    authorId: "faculty-1",
    body: "tighten the gesture",
    resolved: false,
  });
  assert.equal(s.comments.length, 1);
  assert.equal(s.comments[0]!.regionId, "r1");
  assert.ok(s.spine.regions?.some((r) => r.id === "r1"));
  s = resolveComment(s, "cmt-q4");
  assert.equal(s.comments[0]!.resolved, true);

  // API resolve path
  const id = `ps-q4-api-${randomUUID()}`;
  await api("POST", "/work-records", { id, title: "Q4api" });
  await api("POST", `/work-records/${id}/regions`, {
    id: "r1",
    startMs: 0,
    endMs: 1000,
  });
  const posted = await api("POST", `/work-records/${id}/comments`, {
    id: "cmt-api",
    regionId: "r1",
    body: "note",
  });
  assert.equal(posted.status, 200);
  const resolved = await api(
    "POST",
    `/work-records/${id}/comments/cmt-api/resolve`,
    {},
  );
  assert.equal(resolved.status, 200);
  const comments = (resolved.json as { comments: { id: string; resolved: boolean }[] })
    .comments;
  assert.equal(comments.find((c) => c.id === "cmt-api")?.resolved, true);
});

test("Q5 multi-domain tracks (≥4 MVP types)", () => {
  const s = multiDomainScore("ps-q5");
  const types = new Set(s.tracks.map((t) => t.type));
  assert.ok(types.size >= 4, `expected ≥4 track types, got ${types.size}`);
  assert.ok(types.has("video"));
  assert.ok(types.has("audio"));
  assert.ok(types.has("music_notation"));
  assert.ok(types.has("movement_annotation"));
});

test("Q6 consent before share/export", async () => {
  const id = `ps-q6-${randomUUID()}`;
  await api("POST", "/work-records", { id, title: "Consent" });
  await api("POST", `/work-records/${id}/tracks`, {
    id: "tr-v",
    type: "video",
    ref: "m.mp4",
  });

  let r = await api("POST", `/work-records/${id}/export`);
  assert.equal(r.status, 403);
  assert.match(String((r.json as { detail?: string }).detail), /use policy/i);

  r = await api("POST", `/work-records/${id}/share`);
  assert.equal(r.status, 403);

  let s = createEmptyRecord("ps-q6-domain", "x");
  assert.equal(hasExportableUsePolicy(s), false);
  assert.throws(() => assertCanExport(s), /use policy/i);
  s = attachUsePolicySnapshot(s, {
    id: "c1",
    subjectId: "s1",
    purposes: ["course_assessment"],
    exportAllowed: true,
    createdAt: new Date().toISOString(),
  });
  assert.equal(hasExportableUsePolicy(s), true);
});

test("Q7 work-record package export validates against real schema", () => {
  let s = multiDomainScore("ps-q7");
  s = attachUsePolicySnapshot(s, {
    id: "c1",
    subjectId: "s1",
    purposes: ["course_assessment", "formative_feedback"],
    exportAllowed: true,
    createdAt: "2026-07-16T12:00:00.000Z",
  });
  s = setPreferredTake(s, "take-1");

  const { manifest, validated } = exportWorkRecordPackage(s);
  assert.equal(validated, true);
  assert.equal(
    manifest.profile,
    "urn:practice-relay:profile:work-record-package:0.4",
  );

  const result = validateWorkRecordPackageManifest(manifest);
  assert.equal(result.ok, true, result.errors);
});

test("Q8 submit snapshot immutable", () => {
  let s = createEmptyRecord("ps-q8", "Submit");
  s = submitVersion(s, "submit-week6");
  const first = getVersionTag(s, "submit-week6")!;
  const snapshot = structuredClone(first);
  s = submitVersion(s, "submit-week6");
  const again = getVersionTag(s, "submit-week6")!;
  assert.deepEqual(again, snapshot);
  assert.equal(s.versions.filter((v) => v.name === "submit-week6").length, 1);
});

test("Q9 analysis cannot overwrite media", async () => {
  const id = `ps-q9-${randomUUID()}`;
  await api("POST", "/work-records", { id, title: "Analysis" });
  await api("POST", `/work-records/${id}/tracks`, {
    id: "tr-video",
    type: "video",
    ref: "media/x.mp4",
  });

  let r = await api("POST", `/work-records/${id}/analysis`, {
    id: "tr-video",
    type: "analysis",
    ref: "hijack.json",
  });
  assert.equal(r.status, 400);

  r = await api("POST", `/work-records/${id}/analysis`, {
    id: "tr-video",
    type: "video",
    ref: "evil.mp4",
  });
  assert.equal(r.status, 400);

  r = await api("POST", `/work-records/${id}/analysis`, {
    id: "tr-analysis-1",
    type: "analysis",
    ref: "analysis.json",
  });
  assert.equal(r.status, 200);
  const tracks = (r.json as { tracks: { id: string; type: string }[] }).tracks;
  assert.ok(tracks.some((t) => t.id === "tr-video" && t.type === "video"));
  assert.ok(
    tracks.some((t) => t.id === "tr-analysis-1" && t.type === "analysis"),
  );
});

test("Q15 no Labanotation label on annotation track", () => {
  const label = annotationTrackLabel();
  assert.equal(label, "Movement annotation");
  assert.equal(/labanotation/i.test(label), false);
  assert.ok(FORBIDDEN_STRINGS.includes("Labanotation"));
  const s = multiDomainScore("ps-q15");
  const ann = s.tracks.find((t) => t.type === "movement_annotation");
  assert.ok(ann);
  assert.equal(/labanotation/i.test(ann!.label ?? ""), false);
});

test("Q16 prohibited homepage claims remain blocked", () => {
  assert.ok(FORBIDDEN_STRINGS.includes("AI feedback"));
  assert.ok(FORBIDDEN_STRINGS.includes("AI coach"));
  for (const banned of FORBIDDEN_STRINGS) {
    assert.equal(WORK_RECORD_SCHEMA_VERSION.includes(banned), false);
    assert.equal(annotationTrackLabel().includes(banned), false);
  }
});

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("Q10 current web application states its product boundaries", () => {
  const html = readFileSync(join(repoRoot, "practice-relay/apps/web/src/index.html"), "utf8");
  assert.match(html, /Current scope/i);
  assert.match(html, /does not replace/i);
  assert.match(html, /authoring/i);
  assert.match(html, /video critique/i);
});

test("Q11 package vs video boundary is documented and indexed", () => {
  const doc = join(repoRoot, "practice-relay/docs/package-vs-video.md");
  assert.ok(existsSync(doc), "package-vs-video.md must exist");
  const text = readFileSync(doc, "utf8");
  assert.match(text, /package/i);
  assert.match(text, /video/i);
  assert.match(text, /does not replace/i);
  const readme = readFileSync(join(repoRoot, "practice-relay/README.md"), "utf8");
  assert.match(readme, /docs\/package-vs-video\.md/);
});

test("Q12 OTIO/EAF/Yjs strategy documented in architecture", () => {
  const doc = join(repoRoot, "practice-relay/docs/architecture.md");
  const text = readFileSync(doc, "utf8");
  assert.match(text, /OTIO|OpenTimelineIO/i);
  assert.match(text, /EAF|ELAN/i);
  assert.match(text, /Yjs/i);
  assert.match(text, /in-process/i);
});

test("Q13 neighbour map is documented and reflected in application scope", () => {
  const map = readFileSync(join(repoRoot, "docs/positioning-kill-switches.md"), "utf8");
  assert.match(map, /DigiScore|Motion Bank|GoReact|Echo360/);
  const html = readFileSync(join(repoRoot, "practice-relay/apps/web/src/index.html"), "utf8");
  assert.match(html, /does not replace/i);
  assert.match(html, /show-control/i);
  assert.match(html, /portfolio/i);
  assert.match(html, /repository systems/i);
});

test("Q14 export includes work-record package profile URI", () => {
  let s = multiDomainScore("ps-q14");
  s = attachUsePolicySnapshot(s, {
    id: "c",
    subjectId: "u",
    purposes: ["course_assessment"],
    exportAllowed: true,
    createdAt: "2026-07-16T12:00:00.000Z",
  });
  const { manifest } = exportWorkRecordPackage(s);
  assert.equal(
    manifest.profile,
    "urn:practice-relay:profile:work-record-package:0.4",
  );
  assert.ok(validateWorkRecordPackageManifest(manifest).ok);
});

test("Q17 faculty multi-asset template seed exists", () => {
  const doc = join(repoRoot, "practice-relay/docs/faculty-multi-asset-template.md");
  const seed = join(repoRoot, "practice-relay/fixtures/faculty-multi-asset-template.json");
  assert.ok(existsSync(doc));
  assert.ok(existsSync(seed));
  const seedJson = JSON.parse(readFileSync(seed, "utf8")) as {
    tracks: { type: string }[];
  };
  assert.ok(seedJson.tracks.length >= 4);
  const types = new Set(seedJson.tracks.map((t) => t.type));
  assert.ok(types.has("video"));
  assert.ok(types.has("music_notation"));
  assert.ok(types.has("movement_annotation"));
});

test("Practice Relay attach path carries real Motif ref (not mock)", async () => {
  const id = `ps-mvei-${randomUUID()}`;
  await api("POST", "/work-records", { id, title: "Motif attach" });
  const r = await api("POST", `/work-records/${id}/mvei`, {
    id: "tr-motif",
    ref: "mvei/fixtures/practice-relay-loadable/motif.json",
    label: "MvEI Motif",
  });
  assert.equal(r.status, 200);
  const tracks = (r.json as { tracks: { type: string; ref?: string }[] }).tracks;
  const mvei = tracks.find((t) => t.type === "movement_notation");
  assert.ok(mvei);
  assert.match(mvei!.ref ?? "", /motif\.json/);
  assert.equal(/\bmock\b/i.test(mvei!.ref ?? ""), false);

  let s = createEmptyRecord("ps-dom-mvei", "D");
  s = attachMveiMotifTrack(s, {
    id: "t1",
    ref: "mvei/fixtures/practice-relay-loadable/motif.json",
  });
  assert.equal(s.tracks[0]!.type, "movement_notation");
});
