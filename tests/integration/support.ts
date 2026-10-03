/** Process and disposable-service helpers for the PostgreSQL/S3 acceptance lane. */
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { createServer } from "node:net";
import type { Database } from "@practice-relay/database";

/** Retry service startup only, with a fixed deadline and bounded individual probes. */
export async function waitFor(check: () => Promise<unknown>, label: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try { await check(); return; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  throw new Error(`${label} did not become ready within 60 seconds`);
}

/** Reserve an ephemeral loopback port for a directly started API child. */
export async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

/** Start the actual bundled API entrypoint in an independent process. */
export async function startApi(environment: NodeJS.ProcessEnv): Promise<{ child: ChildProcess; url: string }> {
  const port = await availablePort();
  const child = spawn(process.execPath, ["apps/relay-api/dist/index.mjs"], {
    env: { ...environment, PORT: String(port) }, stdio: ["ignore", "ignore", "pipe"],
  });
  let diagnostics = "";
  child.stderr?.on("data", (chunk: Buffer) => { diagnostics = (diagnostics + chunk.toString()).slice(-8_000); });
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitFor(async () => {
      if (child.exitCode !== null) throw new Error("API exited");
      const response = await fetch(`${url}/readyz`, { signal: AbortSignal.timeout(2_000) });
      assert.equal(response.status, 200);
    }, "API process");
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`API startup failed: ${diagnostics}`, { cause: error });
  }
  return { child, url };
}

/** Stop only an API child created by this suite. */
export async function stopApi(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
  try { await exited; } finally { clearTimeout(timer); }
}

/** Create the test bucket using a scoped SigV4 request; credentials never enter logs. */
export async function createTestBucket(endpoint: string, access: string, secret: string): Promise<void> {
  const url = new URL("/relay-integration", endpoint);
  const stamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = stamp.slice(0, 8);
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  const mac = (key: string | Buffer, value: string) => createHmac("sha256", key).update(value).digest();
  const payload = digest("");
  const signed = "host;x-amz-content-sha256;x-amz-date";
  const headers = `host:${url.host}\nx-amz-content-sha256:${payload}\nx-amz-date:${stamp}\n`;
  const scope = `${day}/us-east-1/s3/aws4_request`;
  const canonical = ["PUT", url.pathname, "", headers, signed, payload].join("\n");
  const key = mac(mac(mac(mac(`AWS4${secret}`, day), "us-east-1"), "s3"), "aws4_request");
  const signature = mac(key, ["AWS4-HMAC-SHA256", stamp, scope, digest(canonical)].join("\n")).toString("hex");
  const response = await fetch(url, { method: "PUT", signal: AbortSignal.timeout(5_000), headers: {
    "x-amz-date": stamp, "x-amz-content-sha256": payload,
    authorization: `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
  } });
  assert.ok(response.ok, `bucket creation failed: ${response.status}`);
}

/** Restore a pg_dump into a second disposable database without touching its source. */
export async function recoveryDrill(database: Database): Promise<void> {
  const project = process.env.RELAY_TEST_COMPOSE_PROJECT;
  assert.match(project ?? "", /^relay-check-[a-f0-9]{12}$/);
  const prefix = ["compose", "-p", project!, "-f", "deploy/compose.integration.yml", "exec", "-T", "postgres"];
  await database.query("CREATE DATABASE relay_recovered");
  const dump = spawnSync("docker", [...prefix, "pg_dump", "-U", "postgres", "-Fc", "relay_integration"], { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
  assert.equal(dump.status, 0, "disposable pg_dump failed");
  const restore = spawnSync("docker", [...prefix, "pg_restore", "-U", "postgres", "--exit-on-error", "-d", "relay_recovered"], { input: dump.stdout, timeout: 60_000 });
  assert.equal(restore.status, 0, "disposable pg_restore failed");
}
