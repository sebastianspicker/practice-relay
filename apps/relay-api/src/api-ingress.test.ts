/**
 * Ingress policy tests.
 * Why: Host and Origin parsing must remain strict without changing HTTP header semantics.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingMessage } from "node:http";
import {
  checkApiIngress,
  resolveApiIngressPolicy,
  type ApiIngressPolicy,
} from "./api-ingress.js";
import { mockReq } from "./test-support/http-mocks.js";

type TestHeaders = Record<string, string | string[] | undefined>;

function request(headers: TestHeaders): IncomingMessage {
  const req = mockReq("/");
  req.headers = headers as IncomingMessage["headers"];
  return req;
}

function policy(
  allowedOrigins = ["https://studio.example"],
  allowedHosts = ["api.example:8443"],
): ApiIngressPolicy {
  return {
    allowedOrigins: new Set(allowedOrigins),
    allowedHosts: new Set(allowedHosts),
  };
}

test("resolves trimmed CSV settings with exact origins and normalized Hosts", () => {
  const resolved = resolveApiIngressPolicy({
    PRACTICE_RELAY_ALLOWED_ORIGINS:
      " https://studio.example:8443, https://studio.example:8443, https://[::1]:9443 ",
    PRACTICE_RELAY_ALLOWED_HOSTS:
      " API.Example:8443, api.example:8443, [::1]:9443 ",
  });

  assert.deepEqual([...resolved.allowedOrigins], [
    "https://studio.example:8443",
    "https://[::1]:9443",
  ]);
  assert.deepEqual([...resolved.allowedHosts], [
    "api.example:8443",
    "[::1]:9443",
  ]);
  assert.throws(
    () =>
      resolveApiIngressPolicy({
        PRACTICE_RELAY_ALLOWED_ORIGINS: "https://studio.example/",
      }),
    /exact origins/,
  );
  assert.throws(
    () =>
      resolveApiIngressPolicy({
        PRACTICE_RELAY_ALLOWED_HOSTS: "api.example:8443/path",
      }),
    /exact Host values/,
  );
});

test("uses scalar trimming but raw first values for array Host and Origin headers", () => {
  const allowed = policy();

  assert.deepEqual(
    checkApiIngress(
      request({
        host: " API.EXAMPLE:8443 ",
        origin: " https://studio.example ",
      }),
      allowed,
    ),
    { allowed: true, allowedOrigin: "https://studio.example" },
  );
  assert.deepEqual(
    checkApiIngress(
      request({
        host: ["api.example:8443", "untrusted.example"],
        origin: ["https://studio.example", "https://untrusted.example"],
      }),
      allowed,
    ),
    { allowed: true, allowedOrigin: "https://studio.example" },
  );
  assert.deepEqual(
    checkApiIngress(
      request({ host: [" api.example:8443 "], origin: "https://studio.example" }),
      allowed,
    ),
    { allowed: false, status: 421, detail: "untrusted Host header" },
  );
  assert.deepEqual(
    checkApiIngress(
      request({ host: "api.example:8443", origin: [" https://studio.example "] }),
      allowed,
    ),
    { allowed: false, status: 403, detail: "untrusted Origin header" },
  );
});

test("allows absent, blank, and empty headers while preserving loopback ports", () => {
  const allowed = policy();

  for (const headers of [
    {},
    { host: "api.example:8443", origin: "   " },
    { host: [], origin: [] },
    { host: [""], origin: [""] },
    { host: "localhost:3000" },
    { host: "127.0.0.1:3000" },
    { host: "[::1]:3000" },
    { host: "localhost:80" },
    { host: "127.0.0.1:80" },
    { host: "[::1]:80" },
  ]) {
    assert.deepEqual(checkApiIngress(request(headers), allowed), { allowed: true });
  }
});

test("rejects loopback-like Hosts that are not exact authorities", () => {
  const allowed = policy();

  for (const host of [
    "user@localhost",
    "localhost/path",
    "localhost?query",
    "localhost#frag",
  ]) {
    assert.deepEqual(checkApiIngress(request({ host }), allowed), {
      allowed: false,
      status: 421,
      detail: "untrusted Host header",
    });
  }
});

test("rejects Host before Origin and only returns allowedOrigin after exact validation", () => {
  const allowed = policy();

  assert.deepEqual(
    checkApiIngress(
      request({ host: "untrusted.example", origin: "https://untrusted.example" }),
      allowed,
    ),
    { allowed: false, status: 421, detail: "untrusted Host header" },
  );
  assert.deepEqual(
    checkApiIngress(
      request({ host: "api.example:8443", origin: "https://untrusted.example" }),
      allowed,
    ),
    { allowed: false, status: 403, detail: "untrusted Origin header" },
  );
  assert.deepEqual(
    checkApiIngress(
      request({ host: "api.example:8443", origin: "https://studio.example" }),
      allowed,
    ),
    { allowed: true, allowedOrigin: "https://studio.example" },
  );
});
