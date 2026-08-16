/** Unit tests for Practice Relay API health/demo routes via handleRequest. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import packageMetadata from "../../../../package.json" with { type: "json" };
import {
  AGS_SCORE_SCOPE,
  LTI_DEFAULT_LAUNCH_URL,
  resolveLtiSecret,
} from "../../lti/src/index.mjs";
import { createMemoryRecordStore } from "@practice-relay/record-store";
import { createMemoryMediaStore, type MediaStoreAdapter } from "@practice-relay/media-store";
import { __setMediaStoreForTests, __setStoreForTests, handleRequest } from "./index.ts";
import {
  mockReq,
  mockRes,
} from "./test-support/http-mocks.ts";

// API unit tests must never create media blobs under the repository data path.
__setMediaStoreForTests(createMemoryMediaStore());

async function facultyBearer(): Promise<string> {
  const login = mockRes();
  await handleRequest(
    mockReq("/auth/login", "POST", {
      userId: "teacher-1",
      password: "teach",
    }),
    login as unknown as ServerResponse,
  );
  assert.equal(login.statusCode, 200);
  return `Bearer ${(JSON.parse(login.body) as { token: string }).token}`;
}

async function adminBearer(): Promise<string> {
  const login = mockRes();
  await handleRequest(
    mockReq("/auth/login", "POST", { userId: "ops-1", password: "ops" }),
    login as unknown as ServerResponse,
  );
  assert.equal(login.statusCode, 200);
  return `Bearer ${(JSON.parse(login.body) as { token: string }).token}`;
}

test("GET /health returns practice-relay-api service", async () => {
  const res = mockRes();
  await handleRequest(mockReq("/health"), res as unknown as ServerResponse);
  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body) as {
    ok: boolean;
    service: string;
    version: string;
    secretsDevDefaults?: boolean;
  };
  assert.equal(json.ok, true);
  assert.equal(json.service, "practice-relay-api");
  assert.equal(json.version, packageMetadata.version);
  assert.equal(json.secretsDevDefaults, undefined);
  assert.ok(res.headers["x-request-id"]);
});

test("GET /demo/export?format=zip returns a complete ZIP download response", async () => {
  const res = mockRes();
  await handleRequest(
    mockReq("/demo/export?format=zip"),
    res as unknown as ServerResponse,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "application/zip");
  assert.equal(res.headers["content-disposition"], 'attachment; filename="ps-demo.work-record.zip"');
  assert.ok(Number(res.headers["content-length"]) > 0);
  assert.equal(res.body.slice(0, 2), "PK");
});

test("media upload rejects a declared body above the browser upload limit", async () => {
  const id = `ps-upload-limit-${Date.now()}`;
  const authorization = await facultyBearer();
  const createRes = mockRes();
  await handleRequest(
    mockReq("/work-records", "POST", { id, title: "Upload limit" }, { authorization }),
    createRes as unknown as ServerResponse,
  );
  assert.equal(createRes.statusCode, 201);

  const uploadRes = mockRes();
  await handleRequest(
    mockReq(`/work-records/${id}/takes/take-1/media`, "POST", undefined, {
      "content-length": String(200 * 1024 * 1024 + 1),
      "content-type": "application/octet-stream",
      authorization,
    }),
    uploadRes as unknown as ServerResponse,
  );
  assert.equal(uploadRes.statusCode, 413);
  assert.match(uploadRes.body, /Payload Too Large/);
});

test("failed media record commit hard-deletes the newly written object", async () => {
  const media = createMemoryMediaStore();
  let hardDeletes = 0;
  const trackedMedia: MediaStoreAdapter = {
    ...media,
    hardDelete(key) {
      hardDeletes += 1;
      return media.hardDelete(key);
    },
  };
  const backing = createMemoryRecordStore();
  const failingStore = {
    ...backing,
    update() { throw new Error("simulated record persistence failure"); },
  };
  __setStoreForTests(failingStore);
  __setMediaStoreForTests(trackedMedia);
  try {
    const id = `ps-upload-failure-${Date.now()}`;
    const authorization = await facultyBearer();
    const createRes = mockRes();
    await handleRequest(
      mockReq("/work-records", "POST", { id, title: "Upload rollback" }, { authorization }),
      createRes as unknown as ServerResponse,
    );
    assert.equal(createRes.statusCode, 201);

    const uploadRes = mockRes();
    await handleRequest(
      mockReq(`/work-records/${id}/takes/take-1/media`, "POST", { bytes: "new" }, {
        authorization,
        "content-type": "application/octet-stream",
      }),
      uploadRes as unknown as ServerResponse,
    );
    assert.equal(uploadRes.statusCode, 500);
    assert.equal(hardDeletes, 1);
    assert.equal(await media.totalBytesForRecord(id), 0);
  } finally {
    __setStoreForTests(createMemoryRecordStore());
    __setMediaStoreForTests(createMemoryMediaStore());
  }
});

test("GET /readyz returns readiness checks", async () => {
  const res = mockRes();
  await handleRequest(mockReq("/readyz"), res as unknown as ServerResponse);
  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body) as {
    ok: boolean;
    checks: Record<string, unknown>;
    metrics?: unknown;
  };
  assert.equal(json.ok, true);
  assert.equal(json.checks.store, true);
  assert.ok("mediaRoot" in json.checks);
  assert.ok("objectStore" in json.checks || "mediaBackend" in json.checks);
  assert.equal(json.metrics, undefined);
});

test("GET /metrics returns Prometheus text exposition", async () => {
  const { __resetMetricsForTests } = await import("./index.ts");
  __resetMetricsForTests();
  // generate at least one request so counters appear
  await handleRequest(
    mockReq("/health"),
    mockRes() as unknown as ServerResponse,
  );
  await handleRequest(
    mockReq("/attacker-controlled-cardinality-a"),
    mockRes() as unknown as ServerResponse,
  );
  await handleRequest(
    mockReq("/work-records/random-id/attacker-controlled-cardinality-b"),
    mockRes() as unknown as ServerResponse,
  );
  const denied = mockRes();
  await handleRequest(mockReq("/metrics"), denied as unknown as ServerResponse);
  assert.equal(denied.statusCode, 401);
  const res = mockRes();
  const authorization = await adminBearer();
  await handleRequest(
    mockReq("/metrics", "GET", undefined, { authorization }),
    res as unknown as ServerResponse,
  );
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers["content-type"] ?? ""), /text\/plain/);
  const body = res.body;
  assert.match(body, /practice_relay_request_count/);
  assert.match(body, /practice_relay_request_latency_ms_bucket/);
  assert.match(body, /practice_relay_record_count/);
  assert.match(body, /practice_relay_media_bytes/);
  assert.match(body, /practice_relay_audit_events/);
  assert.match(body, /path="\/other"/);
  assert.match(body, /path="\/work-records\/:id\/\*"/);
  assert.doesNotMatch(body, /attacker-controlled-cardinality/);
  // No configured secret names or values may enter metrics output.
  assert.equal(body.includes("PRACTICE_RELAY_AUTH_SECRET"), false);
  assert.equal(body.includes(resolveLtiSecret()), false);
});

test("GET /lti/jwks returns keys document", async () => {
  const res = mockRes();
  await handleRequest(mockReq("/lti/jwks"), res as unknown as ServerResponse);
  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body) as { keys: unknown[] };
  assert.ok(Array.isArray(json.keys));
});

test("GET /lti/login OIDC initiation returns platform auth redirect (local-mock)", async () => {
  const qs =
    "iss=https%3A%2F%2Fpractice-relay.local%2Fmock-platform" +
    "&login_hint=faculty-ada" +
    "&target_link_uri=http%3A%2F%2Flocalhost%3A8787%2Flti%2Flaunch" +
    "&client_id=practice-relay-tool" +
    "&lti_deployment_id=practice-relay-lab-deploy-1";
  const res = mockRes();
  await handleRequest(
    mockReq(`/lti/login?${qs}`),
    res as unknown as ServerResponse,
  );
  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body) as {
    ok: boolean;
    status: string;
    step: string;
    authorizationRedirect?: { params?: { response_type?: string } };
  };
  assert.equal(json.ok, true);
  assert.equal(json.status, "local-mock");
  assert.equal(json.step, "redirect_to_platform_auth");
  assert.equal(json.authorizationRedirect?.params?.response_type, "id_token");

  const untrustedOverride = mockRes();
  await handleRequest(
    mockReq(
      `/lti/login?${qs}&platform_auth_url=https%3A%2F%2Fattacker.example%2Fcollect`,
    ),
    untrustedOverride as unknown as ServerResponse,
  );
  assert.equal(untrustedOverride.statusCode, 200);
  const overrideJson = JSON.parse(untrustedOverride.body) as {
    authorizationRedirect: { url: string; params: { redirect_uri: string } };
  };
  assert.doesNotMatch(overrideJson.authorizationRedirect.url, /attacker\.example/);
  assert.equal(
    overrideJson.authorizationRedirect.params.redirect_uri,
    process.env.PRACTICE_RELAY_LTI_LAUNCH_URL?.trim() || LTI_DEFAULT_LAUNCH_URL,
  );

  const maliciousTarget = mockRes();
  await handleRequest(
    mockReq(
      `/lti/login?${qs.replace(
        "http%3A%2F%2Flocalhost%3A8787%2Flti%2Flaunch",
        "https%3A%2F%2Fattacker.example%2Fcollect",
      )}`,
    ),
    maliciousTarget as unknown as ServerResponse,
  );
  assert.equal(maliciousTarget.statusCode, 400);
  assert.match(maliciousTarget.body, /target_link_uri does not match tool registration/);

  const bad = mockRes();
  await handleRequest(
    mockReq("/lti/login?iss=only"),
    bad as unknown as ServerResponse,
  );
  assert.equal(bad.statusCode, 400);
});

test("AGS token endpoint validates grant, client, secret, and scope", async () => {
  const clientId =
    process.env.PRACTICE_RELAY_LTI_CLIENT_ID?.trim() || "practice-relay-tool";
  const clientSecret =
    process.env.PRACTICE_RELAY_LTI_CLIENT_SECRET ??
    process.env.PRACTICE_RELAY_LTI_SECRET ??
    resolveLtiSecret();
  const requestToken = async (body: Record<string, unknown>) => {
    const res = mockRes();
    await handleRequest(
      mockReq("/lti/oauth/token", "POST", body),
      res as unknown as ServerResponse,
    );
    return res;
  };
  const valid = {
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: AGS_SCORE_SCOPE,
  };
  assert.equal((await requestToken(valid)).statusCode, 200);

  for (const [name, body, expectedStatus] of [
    ["missing grant", { ...valid, grant_type: undefined }, 400],
    ["wrong grant", { ...valid, grant_type: "authorization_code" }, 400],
    ["missing client", { ...valid, client_id: undefined }, 401],
    ["wrong client", { ...valid, client_id: "unregistered-client" }, 401],
    ["wrong secret", { ...valid, client_secret: "incorrect" }, 401],
    ["unsupported scope", { ...valid, scope: "unsupported" }, 400],
    ["non-string scope", { ...valid, scope: 42 }, 400],
  ] as const) {
    const response = await requestToken(
      Object.fromEntries(
        Object.entries(body).filter(([, value]) => value !== undefined),
      ),
    );
    assert.equal(response.statusCode, expectedStatus, name);
  }
});

test("AGS oauth token + record POST with Bearer service token", async () => {
  const tokenRes = mockRes();
  await handleRequest(
    mockReq("/lti/oauth/token", "POST", {
      grant_type: "client_credentials",
      client_id: "practice-relay-tool",
      client_secret:
        process.env.PRACTICE_RELAY_LTI_CLIENT_SECRET ??
        process.env.PRACTICE_RELAY_LTI_SECRET ??
        resolveLtiSecret(),
    }),
    tokenRes as unknown as ServerResponse,
  );
  assert.equal(tokenRes.statusCode, 200);
  const tokenBody = JSON.parse(tokenRes.body) as {
    access_token: string;
    token_type: string;
  };
  assert.equal(tokenBody.token_type, "Bearer");
  assert.ok(tokenBody.access_token);

  const recordRes = mockRes();
  const req = mockReq(
    "/lti/ags/scores",
    "POST",
    {
      recordId: "ps-demo",
      userId: "student-1",
      scoreGiven: 1,
    },
    { authorization: `Bearer ${tokenBody.access_token}` },
  );
  await handleRequest(req, recordRes as unknown as ServerResponse);
  assert.equal(recordRes.statusCode, 200);
  const recordd = JSON.parse(recordRes.body) as {
    ok: boolean;
    result: { kind: string };
  };
  assert.equal(recordd.ok, true);
  assert.equal(recordd.result.kind, "ags-score-result");

  const invalidGrade = mockRes();
  await handleRequest(
    mockReq(
      "/lti/ags/scores",
      "POST",
      {
        recordId: "ps-demo",
        userId: "student-1",
        scoreGiven: -1,
        scoreMaximum: 1,
      },
      { authorization: `Bearer ${tokenBody.access_token}` },
    ),
    invalidGrade as unknown as ServerResponse,
  );
  assert.equal(invalidGrade.statusCode, 400);
  assert.match(invalidGrade.body, /invalid AGS grade payload/);

  const denied = mockRes();
  await handleRequest(
    mockReq("/lti/ags/scores", "POST", {
      recordId: "ps-demo",
      userId: "student-1",
    }),
    denied as unknown as ServerResponse,
  );
  assert.equal(denied.statusCode, 401);
});

test("GET /demo/export returns work-record package manifest + RO-Crate package", async () => {
  const res = mockRes();
  await handleRequest(
    mockReq("/demo/export"),
    res as unknown as ServerResponse,
  );
  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body) as {
    validated: boolean;
    manifest: {
      workRecordId: string;
      profile: string;
      schemaVersion: string;
      title: string;
    };
    roCrateMetadata: {
      "@context": string;
      "@graph": { "@id"?: string; "workRecord:workRecordId"?: string }[];
    };
  };
  assert.equal(json.validated, true);
  assert.equal(json.manifest.workRecordId, "ps-demo");
  assert.equal(
    json.manifest.profile,
    "urn:practice-relay:profile:work-record-package:0.4",
  );
  assert.equal(json.manifest.schemaVersion, "0.4");
  assert.equal(json.manifest.title, "Demo record");
  assert.equal(
    json.roCrateMetadata["@context"],
    "https://w3id.org/ro/crate/1.3/context",
  );
  const root = json.roCrateMetadata["@graph"].find((n) => n["@id"] === "./");
  assert.ok(root);
  assert.equal(root["workRecord:workRecordId"], "ps-demo");
});

test("unknown route returns 404", async () => {
  const res = mockRes();
  await handleRequest(mockReq("/nope"), res as unknown as ServerResponse);
  assert.equal(res.statusCode, 404);
});
