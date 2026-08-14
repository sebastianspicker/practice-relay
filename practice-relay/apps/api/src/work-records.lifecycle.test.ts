/**
 * WorkRecord lifecycle evidence for the Practice Relay v0.4 primary product seam.
 * Why: policy denial and portable export are decisive behavior, while this
 * clean-break release deliberately provides no legacy import or migration API.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServerResponse } from "node:http";
import { PROFILE_IDS } from "@practice-relay/work-record-core";
import { handleRequestWithRuntime } from "./router.ts";
import { createApiRuntime, type ApiRuntime } from "./runtime.ts";
import { mockReq, mockRes, type MockRes } from "./test-support/http-mocks.ts";

async function api(
  runtime: ApiRuntime,
  method: string,
  url: string,
  request: { body?: unknown; bearer?: string } = {},
): Promise<{ status: number; json: unknown; headers: MockRes["headers"] }> {
  const res = mockRes();
  await handleRequestWithRuntime(
    runtime,
    mockReq(url, method, request.body, request.bearer ? { authorization: request.bearer } : undefined),
    res as unknown as ServerResponse,
  );
  return {
    status: res.statusCode,
    json: res.body ? JSON.parse(res.body) : null,
    headers: res.headers,
  };
}

async function login(runtime: ApiRuntime): Promise<string> {
  const response = await api(runtime, "POST", "/auth/login", { body: {
    userId: "teacher-1", password: "teach",
  } });
  assert.equal(response.status, 200);
  return `Bearer ${(response.json as { token: string }).token}`;
}

test("WorkRecord lifecycle fails closed then exports RO-Crate 1.3", async () => {
  const runtime = createApiRuntime();
  const bearer = await login(runtime);

  const profiles = await api(runtime, "GET", "/profiles");
  assert.equal(profiles.status, 200);
  assert.ok((profiles.json as Array<{ id: string }>).some(({ id }) => id === PROFILE_IDS.fieldStudy));

  let response = await api(runtime, "POST", "/work-records", { body: {
    id: "field-study-1",
    title: "Wetland observation",
    profile: PROFILE_IDS.fieldStudy,
  }, bearer });
  assert.equal(response.status, 201);

  response = await api(runtime, "POST", "/work-records/field-study-1/subjects", { body: {
    id: "participant-1",
    label: "Participant 1",
    type: "Person",
  }, bearer });
  assert.equal(response.status, 201);

  response = await api(runtime, "POST", "/work-records/field-study-1/artifacts", { body: {
    id: "interview-audio",
    name: "Interview audio",
    mediaType: "audio/wav",
    contentUrl: "https://repository.example/items/interview-audio.wav",
    sha256: "a".repeat(64),
    representedSubjectIds: ["participant-1"],
    preservationRequired: true,
  }, bearer });
  assert.equal(response.status, 201);

  response = await api(runtime, "POST", "/work-records/field-study-1/exports", { body: {
    purpose: "course_assessment",
    destination: "institutional-repository",
  }, bearer });
  assert.equal(response.status, 422);
  assert.equal((response.json as { decision: { allowed: boolean } }).decision.allowed, false);

  response = await api(runtime, "POST", "/work-records/field-study-1/policies", { body: {
    representedSubjectId: "participant-1",
    purpose: "course_assessment",
    destination: "institutional-repository",
    state: "granted",
    evidenceRef: "consent-record-7",
  }, bearer });
  assert.equal(response.status, 201);

  response = await api(runtime, "POST", "/work-records/field-study-1/snapshots", { body: {
    id: "assessment-submission-1",
    reason: "course assessment handoff",
  }, bearer });
  assert.equal(response.status, 201);
  assert.deepEqual((response.json as { artifactIds: string[] }).artifactIds, ["interview-audio"]);

  response = await api(runtime, "POST", "/work-records/field-study-1/exports", { body: {
    purpose: "course_assessment",
    destination: "institutional-repository",
  }, bearer });
  assert.equal(response.status, 200);
  const exported = response.json as {
    decision: { allowed: boolean; includedArtifactIds: string[] };
    roCrate: { files: Record<string, string> };
  };
  assert.equal(exported.decision.allowed, true);
  assert.deepEqual(exported.decision.includedArtifactIds, ["interview-audio"]);
  assert.match(exported.roCrate.files["ro-crate-metadata.json"]!, /ro\/crate\/1\.3/);

});

test("WorkRecord collections require authentication and expose only memberships", async () => {
  const runtime = createApiRuntime();
  let response = await api(runtime, "GET", "/work-records");
  assert.equal(response.status, 401);

  const bearer = await login(runtime);
  response = await api(runtime, "POST", "/work-records", { body: {
    id: "design-studio-1",
    title: "Prototype review",
    profile: PROFILE_IDS.designStudio,
  }, bearer });
  assert.equal(response.status, 201);

  response = await api(runtime, "GET", "/work-records", { bearer });
  assert.equal(response.status, 200);
  assert.deepEqual((response.json as Array<{ id: string }>).map(({ id }) => id), ["design-studio-1"]);
});

test("record collaboration authorizes before room access and mirrors saved mutations", async () => {
  const previousCollab = process.env.COLLAB;
  const runtime = createApiRuntime();
  const id = "collab-lifecycle-1";
  try {
    delete process.env.COLLAB;
    const unauthorized = await api(runtime, "GET", `/work-records/${id}/collab`);
    assert.equal(unauthorized.status, 401);
    assert.doesNotMatch(JSON.stringify(unauthorized.json), /"(?:enabled|overlay)"/);
    assert.equal(runtime.collabRooms.size, 0);

    const bearer = await login(runtime);
    const missing = await api(runtime, "GET", `/work-records/${id}-missing/collab`, { bearer });
    assert.equal(missing.status, 404);
    assert.doesNotMatch(JSON.stringify(missing.json), /"(?:enabled|overlay)"/);
    assert.equal(runtime.collabRooms.size, 0);

    assert.equal(
      (await api(runtime, "POST", "/work-records", {
        body: { id, title: "Collaboration" }, bearer,
      })).status,
      201,
    );
    const updated = await api(runtime, "POST", `/work-records/${id}/tracks`, {
      body: { id: "collab-track", type: "video", ref: "media/collab.mp4" }, bearer,
    });
    assert.equal(updated.status, 200);

    const disabled = await api(runtime, "GET", `/work-records/${id}/collab`, { bearer });
    assert.equal(disabled.status, 200);
    assert.deepEqual(disabled.json, { enabled: false, status: "off" });
    assert.equal(runtime.collabRooms.size, 0);

    process.env.COLLAB = "1";
    const enabled = await api(runtime, "GET", `/work-records/${id}/collab`, { bearer });
    assert.equal(enabled.status, 200);
    assert.deepEqual(enabled.json, {
      enabled: true,
      status: "document-yjs",
      overlay: {
        tracks: (updated.json as { tracks: unknown[] }).tracks,
        regions: [],
        comments: [],
      },
    });
    assert.equal(runtime.collabRooms.size, 1);
  } finally {
    if (previousCollab === undefined) delete process.env.COLLAB;
    else process.env.COLLAB = previousCollab;
    for (const room of runtime.collabRooms.values()) room.destroy();
    runtime.collabRooms.clear();
  }
});
