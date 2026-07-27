/**
 * Local-mock HTTP boundary regression tests.
 * Why: the lab helper must stay bounded and loopback-safe outside containers.
 */
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import { mockRes } from "../../api/src/test-support/http-mocks.ts";
import {
  MOCK_PLATFORM_HOST,
  handleMockPlatformRequest,
  server,
} from "./server.mjs";
import { createMockRequestHandler } from "./request-routes.mjs";
import { createToolRegistry } from "./platform.mjs";

function rawRequest(raw, headers = {}) {
  const req = new Readable({
    read() {
      if (raw) this.push(raw);
      this.push(null);
    },
  });
  req.url = "/api/register";
  req.method = "POST";
  req.headers = headers;
  return req;
}

function rejectedRequest(url, method) {
  const req = new Readable({ read() {} });
  req.url = url;
  req.method = method;
  req.headers = {};
  let resumeCalls = 0;
  req.resume = () => {
    resumeCalls += 1;
    return req;
  };
  return { req, resumeCalls: () => resumeCalls };
}

async function invoke(raw, headers) {
  const req = rawRequest(raw, headers);
  const res = mockRes();
  await handleMockPlatformRequest(req, res);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isolatedHandler(fetchImpl) {
  return createMockRequestHandler({
    apiBase: "http://practice-relay.test",
    dirname: ".",
    port: 8790,
    registry: createToolRegistry(),
    fetchImpl,
  });
}

async function invokeOrchestration(handler, url, body) {
  const req = rawRequest(JSON.stringify(body));
  req.url = url;
  const res = mockRes();
  await handler(req, res);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

test("mock server rejects malformed and non-object JSON roots", async () => {
  for (const raw of ["null", "[]", "not-json"]) {
    const response = await invoke(raw);
    assert.equal(response.status, 400);
    assert.match(response.body.error, /JSON body must be an object|invalid JSON/);
  }
});

test("mock server rejects declared oversized JSON before buffering", async () => {
  const response = await invoke("{}", {
    "content-length": String(1024 * 1024 + 1),
  });
  assert.equal(response.status, 413);
  assert.equal(response.body.error, "request body too large");
});

test("mock server drains unmatched request bodies", async () => {
  const { req, resumeCalls } = rejectedRequest("/not-a-route", "POST");
  const res = mockRes();
  await handleMockPlatformRequest(req, res);
  assert.equal(res.statusCode, 404);
  assert.equal(resumeCalls(), 1);
});

test("mock server bounds malformed targets and drains their bodies", async () => {
  const { req, resumeCalls } = rejectedRequest("http://[", "POST");
  const res = mockRes();
  await handleMockPlatformRequest(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, "invalid request target");
  assert.equal(resumeCalls(), 1);
});

test("mock server rejects unsupported known methods with Allow and drains", async () => {
  const { req, resumeCalls } = rejectedRequest("/health", "POST");
  const res = mockRes();
  await handleMockPlatformRequest(req, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "GET");
  assert.equal(JSON.parse(res.body).error, "method not allowed");
  assert.equal(resumeCalls(), 1);
});

test("mock launch surfaces downstream tool rejection as 502", async () => {
  const handler = isolatedHandler(async (url) => {
    if (String(url).includes("/lti/login?")) {
      return jsonResponse(200, {
        authorizationRedirect: {
          params: { state: "state-1", nonce: "nonce-1" },
        },
      });
    }
    if (String(url).endsWith("/lti/launch")) {
      return jsonResponse(400, { ok: false, error: "launch rejected" });
    }
    throw new Error(`unexpected URL: ${url}`);
  });
  const response = await invokeOrchestration(handler, "/api/launch", {});
  assert.equal(response.status, 502);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.toolAccept.status, 400);
});

test("mock AGS orchestration surfaces downstream score rejection as 502", async () => {
  const handler = isolatedHandler(async (url) => {
    if (String(url).endsWith("/lti/oauth/token")) {
      return jsonResponse(200, {
        access_token: "mock-access-token",
        token_type: "Bearer",
      });
    }
    if (String(url).endsWith("/lti/ags/scores")) {
      return jsonResponse(403, { ok: false, error: "score rejected" });
    }
    throw new Error(`unexpected URL: ${url}`);
  });
  const response = await invokeOrchestration(
    handler,
    "/api/ags-score",
    {},
  );
  assert.equal(response.status, 502);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.score.status, 403);
});

test("mock AGS orchestration stops after downstream token rejection", async () => {
  let fetchCalls = 0;
  const handler = isolatedHandler(async (url) => {
    fetchCalls += 1;
    assert.equal(String(url).endsWith("/lti/oauth/token"), true);
    return jsonResponse(401, { error: "invalid client credentials" });
  });
  const response = await invokeOrchestration(
    handler,
    "/api/ags-score",
    {},
  );
  assert.equal(response.status, 502);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.tokenRes.status, 401);
  assert.equal(fetchCalls, 1);
});

test("mock listener defaults to loopback with explicit timeouts", () => {
  assert.ok(MOCK_PLATFORM_HOST.trim());
  if (!process.env.MOCK_PLATFORM_HOST) {
    assert.equal(MOCK_PLATFORM_HOST, "127.0.0.1");
  }
  assert.equal(server.headersTimeout, 15_000);
  assert.equal(server.requestTimeout, 120_000);
  assert.equal(server.keepAliveTimeout, 5_000);
});
