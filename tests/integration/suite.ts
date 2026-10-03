/** Required real PostgreSQL 18 and S3 lane with two independent API processes. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "@practice-relay/database";
import { createScryptPasswordHash } from "@practice-relay/auth";
import { createPostgresRecordStore, migrateRecordStore } from "@practice-relay/record-store";
import { createPostgresRuntimeState, migrateRuntimeState } from "@practice-relay/runtime-state";
import { migrateMediaStore } from "@practice-relay/media-store";
import { createTestBucket, recoveryDrill, startApi, stopApi, waitFor } from "./support.js";
import { verifyOfflineMigration } from "./migration.js";
import { benchmarkPostgres } from "./benchmarks.js";
import { verifySharedMedia } from "./media.js";

const databaseUrl = process.env.RELAY_TEST_DATABASE_URL;
const endpoint = process.env.RELAY_TEST_S3_ENDPOINT;
assert.ok(databaseUrl && endpoint, "use pnpm check:integration to provision disposable services");
const database = createDatabase({ connectionString: databaseUrl });
const root = await mkdtemp(path.join(await realpath(os.tmpdir()), "relay-integration-"));
const children: Awaited<ReturnType<typeof startApi>>[] = [];
const password = randomBytes(24).toString("hex");
const users = ["faculty", "student"].map((role) => ({ userId: `${role}-integration`, displayName: role, defaultRole: role, passwordHash: createScryptPasswordHash(password) }));
const environment = {
  PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, SECRET_BACKEND: "env", PRACTICE_RELAY_STORE: "postgres", PRACTICE_RELAY_TOPOLOGY: "multi-process",
  PRACTICE_RELAY_DATABASE_URL: databaseUrl, PRACTICE_RELAY_TENANT_ID: "integration",
  PRACTICE_RELAY_OBJECT_STORE: "s3", PRACTICE_RELAY_S3_ENDPOINT: endpoint,
  PRACTICE_RELAY_S3_BUCKET: "relay-integration", PRACTICE_RELAY_S3_ACCESS_KEY: process.env.RELAY_TEST_S3_USER,
  PRACTICE_RELAY_S3_SECRET_KEY: process.env.RELAY_TEST_S3_PASSWORD,
  PRACTICE_RELAY_AUTH_SECRET: randomBytes(48).toString("hex"), PRACTICE_RELAY_LTI_SECRET: randomBytes(48).toString("hex"),
  PRACTICE_RELAY_AUTH_USERS_JSON: JSON.stringify(users), PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS: "1",
  PRACTICE_RELAY_REQUIRE_SECRETS: "1", PRACTICE_RELAY_HOST: "127.0.0.1",
};

async function request(processIndex: number, route: string, options: RequestInit = {}) {
  return fetch(`${children[processIndex]!.url}${route}`, { ...options, signal: AbortSignal.timeout(10_000) });
}

async function jsonRequest(processIndex: number, route: string, body: unknown, token?: string) {
  return request(processIndex, route, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
}

try {
  await waitFor(() => database.checkHealth(), "PostgreSQL");
  await waitFor(async () => assert.equal((await fetch(`${endpoint}/minio/health/live`, { signal: AbortSignal.timeout(2_000) })).status, 200), "S3");
  await createTestBucket(endpoint, process.env.RELAY_TEST_S3_USER!, process.env.RELAY_TEST_S3_PASSWORD!);
  await assert.rejects(createPostgresRecordStore({ database }).checkHealth(), /migration/);
  await migrateRecordStore(database);
  await migrateRuntimeState(database);
  await migrateMediaStore(database);
  for (const index of [0, 1]) children.push(await startApi({ ...environment, PRACTICE_RELAY_MEDIA: path.join(root, String(index)) }));
  const login = await jsonRequest(0, "/auth/login", { userId: users[0]!.userId, password });
  assert.equal(login.status, 200);
  const { token } = await login.json() as { token: string };
  const authorization = { authorization: `Bearer ${token}` };
  assert.equal((await request(1, "/me", { headers: authorization })).status, 200, "shared bearer identity");
  const creations = await Promise.all([0, 1].map((index) => jsonRequest(index, "/work-records", { id: "parallel", title: "Parallel study" }, token)));
  assert.deepEqual(creations.map((response) => response.status).sort(), [201, 409]);
  const commands = await Promise.all(Array.from({ length: 12 }, (_, index) => jsonRequest(index % 2, "/work-records/parallel/tracks", { id: `track-${index}`, type: "video" }, token)));
  for (const response of commands) assert.equal(response.status, 200, await response.text());
  const records = createPostgresRecordStore({ database, tenantId: "integration" });
  const record = await records.get("parallel");
  assert.equal(record?.revision, 12);
  assert.equal(record?.tracks.length, 12);
  const stale = await request(1, "/work-records/parallel", { method: "PATCH", headers: { ...authorization, "content-type": "application/json", "if-match": '"0"' }, body: JSON.stringify({ title: "stale" }) });
  assert.equal(stale.status, 409);
  const page = await request(1, "/work-records?title=allel&limit=1", { headers: authorization });
  assert.equal(page.status, 200);
  assert.deepEqual((await page.json() as { items: unknown[] }).items, [{ id: "parallel", title: "Parallel study", revision: 12 }]);
  await records.mutate("parallel", (latest) => ({ ...latest, members: [] }));
  assert.equal((await request(0, "/work-records/parallel", { method: "PATCH", headers: { ...authorization, "content-type": "application/json" }, body: JSON.stringify({ title: "revoked" }) })).status, 403);
  const throttled = await Promise.all(Array.from({ length: 20 }, (_, index) => jsonRequest(index % 2, "/auth/login", { userId: "unknown-integration", password: "incorrect" })));
  assert.equal(throttled.filter((response) => response.status === 401).length, 5);
  assert.equal(throttled.filter((response) => response.status === 429).length, 15);
  const coordination = createPostgresRuntimeState({ database, tenantId: "integration" });
  await coordination.registerLtiLaunch("cross-process-state", { nonce: "nonce", issuer: "https://issuer.example", audience: "tool", deploymentId: "deployment" });
  const launches = await Promise.all([0, 1].map((index) => jsonRequest(index, "/lti/launch", { state: "cross-process-state", id_token: "invalid" })));
  const launchProblems = await Promise.all(launches.map((response) => response.json())) as { detail: string }[];
  assert.equal(launchProblems.filter((problem) => problem.detail === "invalid id_token").length, 1);
  assert.equal(launchProblems.filter((problem) => problem.detail === "invalid or expired OIDC state").length, 1);
  await verifySharedMedia({ database, endpoint, root });
  await benchmarkPostgres(database);
  await verifyOfflineMigration(database);
  for (const process of children) await stopApi(process.child);
  await recoveryDrill(database);
  const recoveredUrl = new URL(databaseUrl); recoveredUrl.pathname = "/relay_recovered";
  const recovered = createDatabase({ connectionString: recoveredUrl.href });
  try {
    const original = await database.query("SELECT tenant_id, record_id, document FROM practice_relay_work_records ORDER BY tenant_id, record_id");
    assert.deepEqual((await recovered.query("SELECT tenant_id, record_id, document FROM practice_relay_work_records ORDER BY tenant_id, record_id")).rows, original.rows);
    const audit = await database.query("SELECT * FROM practice_relay_record_events ORDER BY event_id");
    assert.deepEqual((await recovered.query("SELECT * FROM practice_relay_record_events ORDER BY event_id")).rows, audit.rows);
    const media = await database.query("SELECT * FROM practice_relay_media_objects ORDER BY tenant_id, storage_key");
    assert.deepEqual((await recovered.query("SELECT * FROM practice_relay_media_objects ORDER BY tenant_id, storage_key")).rows, media.rows);
    const restarted = await startApi({ ...environment, PRACTICE_RELAY_DATABASE_URL: recoveredUrl.href, PRACTICE_RELAY_MEDIA: path.join(root, "recovered") });
    children.push(restarted);
    assert.equal((await fetch(`${restarted.url}/me`, { headers: authorization, signal: AbortSignal.timeout(10_000) })).status, 200);
    await stopApi(restarted.child);
  } finally { await recovered.close(); }
  console.log("Two-process records, admission, LTI, media failure recovery, and PostgreSQL restore passed.");
} finally {
  await Promise.all(children.map((process) => stopApi(process.child)));
  await database.close();
  await rm(root, { recursive: true, force: true });
}
