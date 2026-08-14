/** Lifecycle test: create → consent gate → export → submit (shipped API). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRecordStore } from "@practice-relay/work-record-core";
import { createDurableRecordStore } from "@practice-relay/record-store";
import {
  mockReq,
  mockRes,
  type MockRes,
} from "./test-support/http-mocks.ts";
import { __setStoreForTests, handleRequest } from "./index.ts";

async function api(
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; json: unknown; headers: MockRes["headers"] }> {
  const res = mockRes();
  await handleRequest(
    mockReq(url, method, body, bearer ? { authorization: bearer } : undefined),
    res as unknown as ServerResponse,
  );
  let json: unknown = null;
  try {
    json = res.body ? JSON.parse(res.body) : null;
  } catch {
    json = res.body;
  }
  return { status: res.statusCode, json, headers: res.headers };
}

let bearer = "";

async function loginAsFaculty(): Promise<void> {
  const loggedIn = await api("POST", "/auth/login", {
    userId: "teacher-1",
    password: "teach",
  });
  assert.equal(loggedIn.status, 200);
  bearer = `Bearer ${(loggedIn.json as { token: string }).token}`;
}

test("versions expose saved versions with an empty event fallback and no unauthenticated leak", async () => {
  const store = createRecordStore();
  __setStoreForTests(store);
  try {
    await loginAsFaculty();
    const id = `ps-versions-${randomUUID()}`;
    assert.equal(
      (await api("POST", "/work-records", { id, title: "Versions" })).status,
      201,
    );
    const submitted = await api("POST", `/work-records/${id}/submit`, {
      name: "version-1",
    });
    assert.equal(submitted.status, 200);

    const versions = await api("GET", `/work-records/${id}/versions`);
    assert.equal(versions.status, 200);
    assert.deepEqual(versions.json, {
      versions: (submitted.json as { versions: unknown[] }).versions,
      events: [],
    });

    let eventLookups = 0;
    Object.defineProperty(store, "listEvents", {
      value: () => {
        eventLookups += 1;
        return [];
      },
    });
    const missing = await api("GET", `/work-records/${id}-missing/versions`);
    assert.equal(missing.status, 404);
    assert.equal(eventLookups, 0);
    assert.doesNotMatch(JSON.stringify(missing.json), /"(?:versions|events)"/);

    bearer = "";
    const unauthorized = await api("GET", `/work-records/${id}/versions`);
    assert.equal(unauthorized.status, 401);
    assert.equal(eventLookups, 0);
    assert.doesNotMatch(JSON.stringify(unauthorized.json), new RegExp(id));
  } finally {
    bearer = "";
    __setStoreForTests(createRecordStore());
  }
});

test("lifecycle: create→tracks→preferred→comment→export consent gate→submit immutability", async () => {
  await loginAsFaculty();
  const id = `ps-life-${randomUUID()}`;

  // create
  const created = await api("POST", "/work-records", { id, title: "Lifecycle" });
  assert.equal(created.status, 201);
  const record0 = created.json as { id: string; schemaVersion: string };
  assert.equal(record0.id, id);
  assert.equal(record0.schemaVersion, "0.4");

  // tracks (multi-domain)
  for (const track of [
    { id: "tr-v", type: "video", ref: "media/a.mp4" },
    { id: "tr-a", type: "audio", ref: "media/a.wav" },
    { id: "tr-m", type: "music_notation", ref: "record.musicxml" },
    { id: "tr-ann", type: "movement_annotation", label: "Movement annotation" },
  ]) {
    const r = await api("POST", `/work-records/${id}/tracks`, track);
    assert.equal(r.status, 200);
  }

  // takes + preferred
  let r = await api("POST", `/work-records/${id}/takes`, {
    id: "take-1",
    label: "Run 1",
  });
  assert.equal(r.status, 200);
  r = await api("PUT", `/work-records/${id}/preferred-take`, { takeId: "take-1" });
  assert.equal(r.status, 200);
  assert.equal((r.json as { preferredTakeId: string }).preferredTakeId, "take-1");

  // region + comment
  r = await api("POST", `/work-records/${id}/regions`, {
    id: "reg-1",
    startMs: 0,
    endMs: 5000,
    label: "phrase A",
  });
  assert.equal(r.status, 200);
  r = await api("POST", `/work-records/${id}/comments`, {
    regionId: "reg-1",
    authorId: "faculty-1",
    body: "Watch the breath",
  });
  assert.equal(r.status, 200);
  const comments = (r.json as { comments: { regionId: string }[] }).comments;
  assert.equal(comments[0]!.regionId, "reg-1");

  // export without an exportable use policy → 403
  r = await api("POST", `/work-records/${id}/export`);
  assert.equal(r.status, 403);
  assert.match(
    String((r.json as { detail?: string }).detail ?? ""),
    /use policy/i,
  );
  assert.equal(r.headers["content-type"], "application/problem+json");

  // share without an exportable use policy → 403
  r = await api("POST", `/work-records/${id}/share`);
  assert.equal(r.status, 403);

  // use-policy snapshot → export 200
  r = await api("POST", `/work-records/${id}/consent`, {
    subjectId: "student-1",
    purposes: ["course_assessment"],
    exportAllowed: true,
  });
  assert.equal(r.status, 200);

  r = await api("POST", `/work-records/${id}/export`);
  assert.equal(r.status, 200);
  const pkg = r.json as {
    validated: boolean;
    manifest: {
      profile: string;
      workRecordId: string;
      schemaVersion: string;
    };
    roCrateMetadata: {
      "@context": string;
      "@graph": { "@id"?: string; "workRecord:workRecordId"?: string }[];
    };
  };
  assert.equal(pkg.validated, true);
  assert.equal(pkg.manifest.workRecordId, id);
  assert.equal(
    pkg.manifest.profile,
    "urn:practice-relay:profile:work-record-package:0.4",
  );
  assert.equal(pkg.manifest.schemaVersion, "0.4");
  assert.equal(
    pkg.roCrateMetadata["@context"],
    "https://w3id.org/ro/crate/1.3/context",
  );
  const root = pkg.roCrateMetadata["@graph"].find((n) => n["@id"] === "./");
  assert.ok(root);
  assert.equal(root["workRecord:workRecordId"], id);

  // submit + resubmit immutability
  r = await api("POST", `/work-records/${id}/submit`, { name: "submit-week6" });
  assert.equal(r.status, 200);
  const tag1 = (
    r.json as { versions: { name: string; snapshotRef: string; createdAt: string }[] }
  ).versions.find((v) => v.name === "submit-week6")!;
  assert.ok(tag1);

  r = await api("POST", `/work-records/${id}/submit`, { name: "submit-week6" });
  assert.equal(r.status, 200);
  const versions = (
    r.json as { versions: { name: string; snapshotRef: string; createdAt: string }[] }
  ).versions.filter((v) => v.name === "submit-week6");
  assert.equal(versions.length, 1);
  assert.deepEqual(versions[0], tag1);

  // analysis cannot overwrite media
  r = await api("POST", `/work-records/${id}/analysis`, {
    id: "tr-v",
    type: "video",
    ref: "evil.mp4",
  });
  assert.equal(r.status, 400);

  r = await api("POST", `/work-records/${id}/analysis`, {
    id: "tr-v",
    type: "analysis",
    ref: "analysis.json",
  });
  assert.equal(r.status, 400);
  assert.match(
    String((r.json as { detail?: string }).detail ?? ""),
    /overwrite|media/i,
  );

  r = await api("POST", `/work-records/${id}/analysis`, {
    id: "tr-analysis",
    type: "analysis",
    ref: "analysis.json",
  });
  assert.equal(r.status, 200);
});

test("durable mutations return the persisted revision", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "practice-relay-api-revision-"));
  const durable = createDurableRecordStore({ rootDir: root });
  __setStoreForTests(durable);
  try {
    await loginAsFaculty();
    const id = `ps-revision-${randomUUID()}`;
    const created = await api("POST", "/work-records", { id, title: "Revision" });
    assert.equal(created.status, 201);
    assert.equal((created.json as { revision?: number }).revision, 0);

    const updated = await api("POST", `/work-records/${id}/tracks`, {
      id: "track-1",
      type: "video",
    });
    assert.equal(updated.status, 200);
    const responseRevision = (updated.json as { revision?: number }).revision;
    const storedRevision = durable.get(id)?.revision;
    assert.equal(responseRevision, 1);
    assert.equal(responseRevision, storedRevision);
  } finally {
    __setStoreForTests(createRecordStore());
    rmSync(root, { recursive: true, force: true });
  }
});

test("concurrent stale mutations return 409 instead of overwriting a newer revision", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "practice-relay-api-conflict-"));
  const durable = createDurableRecordStore({ rootDir: root });
  __setStoreForTests(durable);
  try {
    await loginAsFaculty();
    const id = `ps-conflict-${randomUUID()}`;
    assert.equal(
      (await api("POST", "/work-records", { id, title: "Conflict" })).status,
      201,
    );

    const delayed = new Readable({ read() {} }) as IncomingMessage;
    delayed.url = `/work-records/${id}/tracks`;
    delayed.method = "POST";
    delayed.headers = { authorization: bearer };
    const delayedResponse = mockRes();
    const pending = handleRequest(
      delayed,
      delayedResponse as unknown as ServerResponse,
    );

    const winner = await api("POST", `/work-records/${id}/tracks`, {
      id: "winner",
      type: "video",
    });
    assert.equal(winner.status, 200);

    delayed.push(JSON.stringify({ id: "stale", type: "audio" }));
    delayed.push(null);
    await pending;
    assert.equal(delayedResponse.statusCode, 409);
    assert.deepEqual(
      durable.get(id)?.tracks.map((track) => track.id),
      ["winner"],
    );
  } finally {
    __setStoreForTests(createRecordStore());
    rmSync(root, { recursive: true, force: true });
  }
});
