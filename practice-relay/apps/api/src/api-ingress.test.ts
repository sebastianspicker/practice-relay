/**
 * API browser-ingress regression tests.
 * Why: hostile browser origins and rebound Host values must fail before authentication.
 */
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { test } from "node:test";
import { createMemoryMediaStore } from "@practice-relay/media-store";
import { createMemoryRecordStore } from "@practice-relay/record-store";
import { resolveApiIngressPolicy } from "./api-ingress.ts";
import { handleRequestWithRuntime } from "./router.ts";
import { createApiRuntime } from "./runtime.ts";
import { mockReq, mockRes } from "./test-support/http-mocks.ts";

type ApiInput = {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
};

function ingressRuntime() {
  return createApiRuntime({
    recordStore: createMemoryRecordStore(),
    mediaStore: createMemoryMediaStore(),
    failedLoginAttempts: new Map(),
    failedLoginSources: new Map(),
    ingress: resolveApiIngressPolicy({
      PRACTICE_RELAY_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
    }),
  });
}

async function api(input: ApiInput) {
  const runtime = ingressRuntime();
  const res = mockRes();
  await handleRequestWithRuntime(
    runtime,
    mockReq(input.url, input.method, input.body, input.headers),
    res as unknown as ServerResponse,
  );
  return {
    runtime,
    status: res.statusCode,
    body: res.body ? (JSON.parse(res.body) as unknown) : null,
    headers: res.headers,
  };
}

test("trusted browser origin receives exact CORS headers", async () => {
  const response = await api({
    method: "OPTIONS",
    url: "/me",
    headers: {
      host: "127.0.0.1:8787",
      origin: "http://127.0.0.1:5173",
    },
  });
  assert.equal(response.status, 204);
  assert.equal(
    response.headers["access-control-allow-origin"],
    "http://127.0.0.1:5173",
  );
  assert.equal(response.headers.vary, "Origin");
});

test("untrusted browser origin cannot read login output", async () => {
  const response = await api({
    method: "POST",
    url: "/auth/login",
    body: { userId: "teacher-1", password: "teach" },
    headers: {
      host: "127.0.0.1:8787",
      origin: "https://attacker.invalid",
    },
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
  assert.doesNotMatch(JSON.stringify(response.body), /token/);
});

test("untrusted Host cannot reach login", async () => {
  const response = await api({
    method: "POST",
    url: "/auth/login",
    body: { userId: "teacher-1", password: "teach" },
    headers: { host: "attacker.invalid" },
  });
  assert.equal(response.status, 421);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
  assert.doesNotMatch(JSON.stringify(response.body), /token/);
});

test("trusted origin can use its bearer while hostile metadata cannot", async () => {
  const runtime = ingressRuntime();
  const request = async (input: ApiInput) => {
    const res = mockRes();
    await handleRequestWithRuntime(
      runtime,
      mockReq(input.url, input.method, input.body, input.headers),
      res as unknown as ServerResponse,
    );
    return {
      status: res.statusCode,
      body: res.body ? (JSON.parse(res.body) as unknown) : null,
      headers: res.headers,
    };
  };
  const trustedHeaders = {
    host: "127.0.0.1:8787",
    origin: "http://127.0.0.1:5173",
  };
  const login = await request({
    method: "POST",
    url: "/auth/login",
    body: { userId: "teacher-1", password: "teach" },
    headers: trustedHeaders,
  });
  assert.equal(login.status, 200);
  const authorization = `Bearer ${(login.body as { token: string }).token}`;

  const trusted = await request({
    method: "GET",
    url: "/me",
    headers: { ...trustedHeaders, authorization },
  });
  assert.equal(trusted.status, 200);
  assert.equal(
    trusted.headers["access-control-allow-origin"],
    trustedHeaders.origin,
  );

  for (const headers of [
    { ...trustedHeaders, origin: "https://attacker.invalid", authorization },
    { host: "attacker.invalid", authorization },
  ]) {
    const rejected = await request({ method: "GET", url: "/me", headers });
    assert.ok(rejected.status === 403 || rejected.status === 421);
    assert.doesNotMatch(JSON.stringify(rejected.body), /teacher-1/);
  }
});
