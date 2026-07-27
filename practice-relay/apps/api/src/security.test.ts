/**
 * API authorization regressions for bearer identity, record membership, media,
 * and durable operations. These tests preserve the public request contract.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { createRecordStore } from "@practice-relay/work-record-core";
import { createDurableRecordStore } from "@practice-relay/record-store";
import { createMemoryMediaStore, type MediaStoreAdapter } from "@practice-relay/media-store";
import {
  __setMediaStoreForTests,
  __setStoreForTests,
  handleRequest,
} from "./index.ts";
import {
  mockReq,
  mockRes,
  type MockRes,
} from "./test-support/http-mocks.ts";

async function api(
  method: string,
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; json: unknown; headers: MockRes["headers"] }> {
  const res = mockRes();
  await handleRequest(
    mockReq(url, method, body, headers),
    res as unknown as ServerResponse,
  );
  return {
    status: res.statusCode,
    json: res.body ? JSON.parse(res.body) : null,
    headers: res.headers,
  };
}

async function bearer(userId: string, password: string): Promise<string> {
  const response = await api("POST", "/auth/login", { userId, password });
  assert.equal(response.status, 200);
  return `Bearer ${(response.json as { token: string }).token}`;
}

async function apiRaw(
  method: string,
  url: string,
  rawBody: string,
  headers?: Record<string, string>,
): Promise<{ status: number; json: unknown; drained: boolean }> {
  const req = Readable.from([rawBody]) as IncomingMessage;
  req.url = url;
  req.method = method;
  req.headers = { ...(headers ?? {}) };
  let resumeCalls = 0;
  const resume = req.resume.bind(req);
  req.resume = () => {
    resumeCalls += 1;
    return resume();
  };
  const res = mockRes();
  await handleRequest(req, res as unknown as ServerResponse);
  return {
    status: res.statusCode,
    json: res.body ? JSON.parse(res.body) : null,
    drained: resumeCalls > 0,
  };
}

test("record identity is bearer-only and creator membership is derived", async () => {
  const teacher = await bearer("teacher-1", "teach");
  const student = await bearer("student-1", "learn");
  const examiner = await bearer("examiner-1", "jury");
  const id = `ps-auth-${randomUUID()}`;

  assert.equal((await api("GET", "/auth/users")).status, 401);
  assert.equal(
    (await api("GET", "/auth/users", undefined, { authorization: student })).status,
    403,
  );
  assert.equal(
    (await api("GET", "/auth/users", undefined, { authorization: teacher })).status,
    200,
  );

  assert.equal(
    (await api("POST", "/work-records", { title: "Examiner escalation" }, {
      authorization: examiner,
    })).status,
    403,
  );

  const spoofed = await api("POST", "/work-records", { id, title: "Spoof" }, {
    "x-user-id": "teacher-1",
  });
  assert.equal(spoofed.status, 401);

  const memberInjection = await api(
    "POST",
    "/work-records",
    { id, title: "Spoof", members: [{ userId: "student-1", role: "faculty" }] },
    { authorization: teacher },
  );
  assert.equal(memberInjection.status, 400);

  const created = await api("POST", "/work-records", { id, title: "Secure record" }, {
    authorization: teacher,
  });
  assert.equal(created.status, 201);
  assert.deepEqual((created.json as { members: unknown[] }).members, [
    { userId: "teacher-1", role: "faculty" },
  ]);

  assert.equal((await api("GET", `/work-records/${id}`)).status, 401);
  assert.equal(
    (await api("GET", `/work-records/${id}`, undefined, { authorization: student })).status,
    403,
  );
  assert.equal(
    (await api("GET", "/work-records", undefined, { authorization: student })).status,
    200,
  );

  const added = await api(
    "POST",
    `/work-records/${id}/members`,
    { userId: "student-1", role: "student" },
    { authorization: teacher },
  );
  assert.equal(added.status, 200);
  assert.equal(
    (await api(
      "POST",
      `/work-records/${id}/members`,
      { userId: `missing-${randomUUID()}`, role: "student" },
      { authorization: teacher },
    )).status,
    400,
  );
  assert.equal(
    (await api(
      "PATCH",
      `/work-records/${id}`,
      {
        members: [
          { userId: "teacher-1", role: "faculty" },
          { userId: `missing-${randomUUID()}`, role: "student" },
        ],
      },
      { authorization: teacher },
    )).status,
    400,
  );
  assert.equal(
    (await api(
      "POST",
      `/work-records/${id}/members`,
      { userId: "student-1", role: "admin" },
      { authorization: teacher },
    )).status,
    403,
  );
  assert.equal(
    (await api("GET", `/work-records/${id}`, undefined, { authorization: student })).status,
    200,
  );

  const bodySpoof = await api(
    "POST",
    `/work-records/${id}/tracks`,
    { id: "body-spoof", type: "video", actorId: "teacher-1", userId: "teacher-1" },
    { authorization: student },
  );
  assert.equal(bodySpoof.status, 403);
});

test("record mutation authorization precedes body parsing and drains denials", async () => {
  const teacher = await bearer("teacher-1", "teach");
  const student = await bearer("student-1", "learn");
  const id = `ps-auth-body-order-${randomUUID()}`;
  assert.equal(
    (await api("POST", "/work-records", { id, title: "Body order" }, {
      authorization: teacher,
    })).status,
    201,
  );
  assert.equal(
    (await api("POST", `/work-records/${id}/members`, {
      userId: "student-1",
      role: "student",
    }, { authorization: teacher })).status,
    200,
  );

  const deniedMalformed = await apiRaw(
    "POST",
    `/work-records/${id}/tracks`,
    "{",
    { authorization: student, "content-type": "application/json" },
  );
  assert.equal(deniedMalformed.status, 403);
  assert.equal(deniedMalformed.drained, true);
  assert.match(
    String((deniedMalformed.json as { detail?: string }).detail),
    /role denied/i,
  );

  const deniedOversized = await apiRaw(
    "POST",
    `/work-records/${id}/tracks`,
    "{}",
    {
      authorization: student,
      "content-length": String(1024 * 1024 + 1),
      "content-type": "application/json",
    },
  );
  assert.equal(deniedOversized.status, 403);
  assert.equal(deniedOversized.drained, true);

  const authorizedMalformed = await apiRaw(
    "POST",
    `/work-records/${id}/tracks`,
    "{",
    { authorization: teacher, "content-type": "application/json" },
  );
  assert.equal(authorizedMalformed.status, 400);
  assert.match(
    String((authorizedMalformed.json as { detail?: string }).detail),
    /JSON|Unexpected/i,
  );
});

test("repeated failed logins are rate limited without revealing user existence", async () => {
  const userId = `missing-${randomUUID()}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await api("POST", "/auth/login", {
      userId,
      password: "incorrect-password",
    });
    assert.equal(response.status, 401);
  }
  const limited = await api("POST", "/auth/login", {
    userId,
    password: "incorrect-password",
  });
  assert.equal(limited.status, 429);
});

test("media is not discoverable without a bearer session or record membership", async () => {
  const teacher = await bearer("teacher-1", "teach");
  const student = await bearer("student-1", "learn");
  const id = `ps-media-${randomUUID()}`;
  const created = await api("POST", "/work-records", { id, title: "Private media" }, {
    authorization: teacher,
  });
  assert.equal(created.status, 201);

  assert.equal((await api("GET", "/media/unknown-key")).status, 401);
  assert.equal(
    (await api("GET", "/media/unknown-key", undefined, { authorization: student })).status,
    404,
  );
  assert.equal(
    (await api("GET", `/work-records/${id}/takes/take-1/media`)).status,
    404,
  );
});

test("media download authorizes the key record before retrieving the blob", async () => {
  const media = createMemoryMediaStore();
  let getCalls = 0;
  const trackedMedia: MediaStoreAdapter = {
    ...media,
    get(key) {
      getCalls += 1;
      return media.get(key);
    },
  };
  __setMediaStoreForTests(trackedMedia);
  try {
    const teacher = await bearer("teacher-1", "teach");
    const student = await bearer("student-1", "learn");
    const id = `ps-media-auth-order-${randomUUID()}`;
    assert.equal(
      (await api("POST", "/work-records", { id, title: "Private media" }, {
        authorization: teacher,
      })).status,
      201,
    );
    const upload = await api(
      "POST",
      `/work-records/${id}/takes/take-1/media`,
      { bytes: "private" },
      { authorization: teacher, "content-type": "application/octet-stream" },
    );
    assert.equal(upload.status, 200);
    const key = (upload.json as { media: { storageKey: string } }).media.storageKey;

    getCalls = 0;
    const denied = await api("GET", `/media/${key}`, undefined, {
      authorization: student,
    });
    assert.equal(denied.status, 403);
    assert.equal(getCalls, 0);
  } finally {
    __setMediaStoreForTests(createMemoryMediaStore());
  }
});

test("take creation rejects caller-supplied media URLs", async () => {
  const teacher = await bearer("teacher-1", "teach");
  const id = `ps-take-media-${randomUUID()}`;
  assert.equal(
    (await api("POST", "/work-records", { id, title: "Server media refs" }, {
      authorization: teacher,
    })).status,
    201,
  );
  const response = await api(
    "POST",
    `/work-records/${id}/takes`,
    { id: "take-1", mediaPath: "http://127.0.0.1/internal" },
    { authorization: teacher },
  );
  assert.equal(response.status, 400);
  assert.match(String((response.json as { detail?: string }).detail), /media metadata/i);
  for (const forged of [
    { id: "take-2", storageKey: "other-record/private.bin" },
    { id: "take-3", byteSize: Number.MAX_SAFE_INTEGER },
  ]) {
    const rejected = await api(
      "POST",
      `/work-records/${id}/takes`,
      forged,
      { authorization: teacher },
    );
    assert.equal(rejected.status, 400);
  }
});

test("LTI launch rejects an invalid assignment and signs the configured target", async () => {
  const teacher = await bearer("teacher-1", "teach");
  const id = `ps-lti-boundary-${randomUUID()}`;
  assert.equal(
    (await api("POST", "/work-records", { id, title: "LTI boundary" }, {
      authorization: teacher,
    })).status,
    201,
  );

  const invalid = await api("POST", `/work-records/${id}/lti`, {}, {
    authorization: teacher,
  });
  assert.equal(invalid.status, 400);
  assert.match(
    String((invalid.json as { detail?: string }).detail),
    /trackTypes must be a non-empty array/,
  );

  assert.equal(
    (await api("POST", `/work-records/${id}/tracks`, {
      id: "track-video",
      type: "video",
    }, { authorization: teacher })).status,
    200,
  );
  const previousLaunchUrl = process.env.PRACTICE_RELAY_LTI_LAUNCH_URL;
  const configuredLaunchUrl = "https://tool.example.edu/lti/launch";
  process.env.PRACTICE_RELAY_LTI_LAUNCH_URL = configuredLaunchUrl;
  try {
    const signed = await api("POST", `/work-records/${id}/lti`, {}, {
      authorization: teacher,
    });
    assert.equal(signed.status, 200);
    const signedBody = signed.json as {
      claims?: Record<string, unknown>;
    };
    assert.equal(
      signedBody.claims?.[
        "https://purl.imsglobal.org/spec/lti/claim/target_link_uri"
      ],
      configuredLaunchUrl,
    );
  } finally {
    if (previousLaunchUrl === undefined) {
      delete process.env.PRACTICE_RELAY_LTI_LAUNCH_URL;
    } else {
      process.env.PRACTICE_RELAY_LTI_LAUNCH_URL = previousLaunchUrl;
    }
  }
});

test("durable backup exposes an identifier and rejects traversal restore IDs", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "practice-relay-api-backup-"));
  const previousLabOps = process.env.PRACTICE_RELAY_LAB_OPS;
  process.env.PRACTICE_RELAY_LAB_OPS = "1";
  __setStoreForTests(createDurableRecordStore({ rootDir: root }));
  try {
    const teacher = await bearer("teacher-1", "teach");
    const admin = await bearer("ops-1", "ops");
    assert.equal(
      (await api("POST", "/ops/backup", undefined, {
        authorization: teacher,
      })).status,
      403,
    );
    const backup = await api("POST", "/ops/backup", undefined, {
      authorization: admin,
    });
    assert.equal(backup.status, 200);
    const manifest = (backup.json as { manifest: { backupId: string } }).manifest;
    assert.match(manifest.backupId, /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
    assert.equal(manifest.backupId.includes(path.sep), false);

    const traversal = await api(
      "POST",
      "/ops/restore",
      { backupId: "../outside" },
      { authorization: admin },
    );
    assert.equal(traversal.status, 400);
    assert.match(String((traversal.json as { detail?: string }).detail), /backupId/i);
  } finally {
    __setStoreForTests(createRecordStore());
    if (previousLabOps === undefined) delete process.env.PRACTICE_RELAY_LAB_OPS;
    else process.env.PRACTICE_RELAY_LAB_OPS = previousLabOps;
    rmSync(root, { recursive: true, force: true });
  }
});
