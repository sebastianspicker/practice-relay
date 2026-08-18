#!/usr/bin/env node
/**
 * On-call / SLO probe for Practice Relay.
 *
 * - `--unit`: handler checks with no listener, network, or MinIO
 * - `--live`: explicit HTTP checks against PRACTICE_RELAY_API_URL
 *
 * Run: pnpm test:ops-slo
 *      PRACTICE_RELAY_API_URL=http://localhost:8787 pnpm test:ops-slo:live
 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { mockRes } from "../practice-relay/apps/api/src/test-support/http-mocks.ts";

const REQUIRED_METRIC_NAMES = [
  "practice_relay_request_count",
  "practice_relay_request_latency_ms_bucket",
  "practice_relay_record_count",
  "practice_relay_media_bytes",
  "practice_relay_audit_events",
];

const UNIT_ADMIN = Object.freeze({
  userId: "ops-probe",
  displayName: "Operations Probe",
  defaultRole: "admin",
  password: "ops-slo-unit-password",
});

const UNIT_ENVIRONMENT = Object.freeze({
  PRACTICE_RELAY_AUTH_USERS_JSON: JSON.stringify([UNIT_ADMIN]),
  PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS: "1",
  PRACTICE_RELAY_REQUIRE_SECRETS: "1",
  PRACTICE_RELAY_AUTH_SECRET: "ops-slo-unit-auth-secret-0000000001",
  PRACTICE_RELAY_LTI_SECRET: "ops-slo-unit-lti-secret-00000000002",
  PRACTICE_RELAY_OBJECT_STORE: "memory",
});

function isApplicationEnvironmentKey(name) {
  return (
    name.startsWith("PRACTICE_RELAY_") ||
    name.startsWith("MVEI_") ||
    name.startsWith("AWS_") ||
    name.startsWith("MINIO_") ||
    name.startsWith("SECRET_") ||
    name === "KMS_STUB_KEY"
  );
}

/** Build an isolated unit environment without storage, key-file, or network configuration. */
export function createOpsSloUnitEnvironment(source) {
  const environment = { ...source };
  for (const name of Object.keys(environment)) {
    if (isApplicationEnvironmentKey(name)) delete environment[name];
  }
  return { ...environment, ...UNIT_ENVIRONMENT };
}

function installOpsSloUnitEnvironment() {
  const environment = createOpsSloUnitEnvironment(process.env);
  for (const name of Object.keys(process.env)) {
    if (isApplicationEnvironmentKey(name)) delete process.env[name];
  }
  Object.assign(process.env, environment);
}

function mockReq(url, method = "GET", headers = {}, body) {
  let sent = false;
  const stream = new Readable({
    read() {
      if (!sent && body !== undefined) {
        sent = true;
        this.push(body);
      }
      this.push(null);
    },
  });
  stream.url = url;
  stream.method = method;
  stream.headers = headers;
  return stream;
}

function assertMetricsBody(body) {
  assert.equal(typeof body, "string");
  for (const name of REQUIRED_METRIC_NAMES) {
    assert.match(
      body,
      new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `metrics must include ${name}`,
    );
  }
  // Metrics must never expose credential configuration or values.
  assert.equal(body.includes("PRACTICE_RELAY_AUTH_SECRET"), false);
  assert.equal(body.includes("PRACTICE_RELAY_LTI_SECRET"), false);
}

/** Parse the required probe mode so ambient variables cannot select live I/O. */
export function parseOpsSloMode(args) {
  if (args.length !== 1 || !["--unit", "--live"].includes(args[0])) {
    throw new Error("choose exactly one operations probe mode: --unit or --live");
  }
  return args[0] === "--live" ? "live" : "unit";
}

/** Validate a live probe origin before an administrator session can be sent. */
export function normalizeLiveBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PRACTICE_RELAY_API_URL must be an absolute HTTP(S) origin");
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("PRACTICE_RELAY_API_URL must use HTTP or HTTPS");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PRACTICE_RELAY_API_URL must contain only an origin");
  }
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (url.protocol !== "https:" && !loopback.has(url.hostname)) {
    throw new Error("non-loopback live probes require HTTPS");
  }
  return url.origin;
}

async function checkLive(baseUrl) {
  const base = normalizeLiveBaseUrl(baseUrl);
  const adminSession = process.env.PRACTICE_RELAY_ADMIN_SESSION?.trim();
  assert.ok(
    adminSession,
    "PRACTICE_RELAY_ADMIN_SESSION is required to probe authenticated /metrics",
  );
  const authorization = /^Bearer\s+/i.test(adminSession)
    ? adminSession
    : `Bearer ${adminSession}`;
  console.log(JSON.stringify({ msg: "ops-slo-check live", base }));

  const healthRes = await fetch(`${base}/health`, { redirect: "error" });
  assert.equal(healthRes.ok, true, `/health HTTP ${healthRes.status}`);
  const health = await healthRes.json();
  assert.equal(health.ok, true);
  assert.equal(health.service, "practice-relay-api");

  const readyRes = await fetch(`${base}/readyz`, { redirect: "error" });
  const ready = await readyRes.json();
  assert.ok("checks" in ready, "readyz must include checks");
  assert.ok("store" in ready.checks, "readyz.checks.store required");
  // Live stack may be 503 if secrets/media misconfigured - report clearly
  if (!readyRes.ok) {
    console.error(
      JSON.stringify({
        msg: "ops-slo-check readyz not ready",
        status: readyRes.status,
        checks: ready.checks,
      }),
    );
    process.exitCode = 1;
    return;
  }
  assert.equal(ready.ok, true);

  const metricsRes = await fetch(`${base}/metrics`, {
    headers: { authorization },
    redirect: "error",
  });
  assert.equal(metricsRes.ok, true, `/metrics HTTP ${metricsRes.status}`);
  const metricsText = await metricsRes.text();
  assertMetricsBody(metricsText);

  console.log(
    JSON.stringify({
      msg: "ops-slo-check pass",
      mode: "live",
      storeBackend: health.storeBackend ?? ready.checks?.storeBackend,
      objectStore: health.objectStore ?? ready.checks?.objectStore,
      secretBackend: health.secretBackend ?? ready.checks?.secretBackend,
    }),
  );
}

async function checkUnit() {
  console.log(JSON.stringify({ msg: "ops-slo-check unit", note: "network disabled" }));

  installOpsSloUnitEnvironment();

  // Dynamic import so CI does not need a listening port
  const { handleRequest, __resetMetricsForTests, renderPrometheusMetrics } =
    await import("../practice-relay/apps/api/src/index.ts");

  if (typeof __resetMetricsForTests === "function") {
    __resetMetricsForTests();
  }

  // /health
  {
    const res = mockRes();
    await handleRequest(mockReq("/health"), res);
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.ok, true);
    assert.equal(json.service, "practice-relay-api");
    assert.equal("secretSource" in json, false);
    assert.equal("secretBackend" in json, false);
  }

  // /readyz
  {
    const res = mockRes();
    await handleRequest(mockReq("/readyz"), res);
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.ok, true);
    assert.equal(json.checks.store, true);
    assert.equal("metrics" in json, false);
  }

  // Generate at least one recorded request then /metrics
  {
    const loginRes = mockRes();
    await handleRequest(
      mockReq(
        "/auth/login",
        "POST",
        { "content-type": "application/json" },
        JSON.stringify({
          userId: UNIT_ADMIN.userId,
          password: UNIT_ADMIN.password,
        }),
      ),
      loginRes,
    );
    assert.equal(loginRes.statusCode, 200);
    const token = JSON.parse(loginRes.body).token;
    assert.equal(typeof token, "string");
    await handleRequest(mockReq("/health"), mockRes());
    const res = mockRes();
    await handleRequest(
      mockReq("/metrics", "GET", { authorization: `Bearer ${token}` }),
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers["content-type"] ?? ""), /text\/plain/);
    assertMetricsBody(res.body);
  }

  // Direct metrics renderer (format contract)
  if (typeof renderPrometheusMetrics === "function") {
    const text = renderPrometheusMetrics({
      scoreCount: 0,
      mediaBytes: 0,
      auditEvents: 0,
    });
    assertMetricsBody(text);
    assert.match(text, /practice_relay_record_count 0/);
  }

  console.log(JSON.stringify({ msg: "ops-slo-check pass", mode: "unit" }));
}

async function main() {
  const mode = parseOpsSloMode(process.argv.slice(2));
  if (mode === "unit") return checkUnit();
  const url = process.env.PRACTICE_RELAY_API_URL?.trim();
  assert.ok(url, "PRACTICE_RELAY_API_URL is required for --live");
  return checkLive(url);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(
      JSON.stringify({
        msg: "ops-slo-check fail",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    process.exit(1);
  });
}
