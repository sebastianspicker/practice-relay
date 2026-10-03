/**
 * Proves the deployed API package starts from its emitted Node entrypoint.
 * Why: Docker uses the same filtered production package, but this check does
 * not require a Docker daemon to catch an accidental source/tsx dependency.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDirectory = resolve(packageDirectory, "../..");
const packageName = "@practice-relay/relay-api";
const healthTimeoutMs = 10_000;
const sourceDirectories = [
  "packages/auth/src",
  "packages/handoff/src",
  "packages/media-store/src",
  "packages/record-store/src",
  "packages/work-record/src",
];

function sourceBuildArtifacts(directory) {
  const artifacts = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) artifacts.push(...sourceBuildArtifacts(path));
    if (
      entry.isFile() &&
      (entry.name.endsWith(".js") ||
        entry.name.endsWith(".js.map") ||
        entry.name.endsWith(".d.ts") ||
        entry.name.endsWith(".d.ts.map"))
    ) {
      artifacts.push(path);
    }
  }
  return artifacts;
}

function assertNoSourceBuildArtifacts() {
  const artifacts = sourceDirectories.flatMap((directory) =>
    sourceBuildArtifacts(join(workspaceDirectory, directory)),
  );
  assert.deepEqual(
    artifacts,
    [],
    `TypeScript build artifacts must stay out of source directories: ${artifacts.join(", ")}`,
  );
}

function command(program, args, options = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(program, args, {
      cwd: workspaceDirectory,
      stdio: "inherit",
      ...options,
    });
    child.once("error", rejectCommand);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolveCommand();
      rejectCommand(
        new Error(`${program} ${args.join(" ")} failed with ${signal ?? `exit ${code}`}`),
      );
    });
  });
}

async function unusedLoopbackPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object", "expected an IPv4 loopback port");
  const { port } = address;
  server.close();
  await once(server, "close");
  return port;
}

function startRuntime(runtimeDirectory, port) {
  const child = spawn(process.execPath, ["dist/index.mjs"], {
    cwd: runtimeDirectory,
    env: {
      ...process.env,
      PORT: String(port),
      PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH: "1",
      PRACTICE_RELAY_HOST: "127.0.0.1",
      PRACTICE_RELAY_MEDIA: join(runtimeDirectory, "media"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  return { child, output: () => output };
}

async function waitForHealth(port, output) {
  const url = `http://127.0.0.1:${port}/health`;
  const deadline = Date.now() + healthTimeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      const body = await response.json();
      assert.equal(response.status, 200, `health returned ${response.status}`);
      assert.equal(body.ok, true);
      assert.equal(body.service, "practice-relay-api");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    }
  }
  throw new Error(`emitted API did not become healthy: ${lastError}\n${output()}`);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const body = await response.json();
  assert.ok(response.ok, `${options.method ?? "GET"} ${url} failed: ${JSON.stringify(body)}`);
  return body;
}

async function verifyCanonicalSchemaRuntime(port) {
  const origin = `http://127.0.0.1:${port}`;
  const login = await requestJson(`${origin}/auth/login`, {
    method: "POST",
    body: JSON.stringify({ userId: "teacher-1", password: "teach" }),
  });
  assert.equal(typeof login.token, "string");
  const headers = { authorization: `Bearer ${login.token}` };
  const record = await requestJson(`${origin}/work-records`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: "runtime-schema-record", title: "Runtime schema record" }),
  });
  assert.equal(record.id, "runtime-schema-record");
  await requestJson(`${origin}/work-records/${record.id}/tracks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: "runtime-schema-track",
      type: "video",
      ref: "media/runtime-schema-track.mp4",
    }),
  });
  await requestJson(`${origin}/work-records/${record.id}/consent`, {
    method: "POST",
    headers,
    body: JSON.stringify({ purposes: ["course_assessment"], exportAllowed: true }),
  });
  const exported = await requestJson(`${origin}/work-records/${record.id}/export`, {
    method: "POST",
    headers,
    body: "{}",
  });
  assert.equal(exported.validated, true);
  assert.equal(exported.manifest?.workRecordId, record.id);
}

async function stopRuntime(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

async function main() {
  const emittedEntry = join(packageDirectory, "dist", "index.mjs");
  assert(existsSync(emittedEntry), "API build must create dist/index.mjs before runtime packaging");
  assertNoSourceBuildArtifacts();

  const runtimeDirectory = realpathSync(
    mkdtempSync(join(tmpdir(), "practice-relay-api-runtime-")),
  );
  let runtime;
  try {
    await command("pnpm", ["--filter", packageName, "deploy", "--prod", runtimeDirectory]);

    const runtimeEntry = join(runtimeDirectory, "dist", "index.mjs");
    assert(existsSync(runtimeEntry), "filtered production package is missing dist/index.mjs");
    assert(
      existsSync(join(runtimeDirectory, "dist", "schemas/work-record/work-record.schema.json")),
      "filtered runtime is missing the canonical WorkRecord schema",
    );
    assert(
      existsSync(join(runtimeDirectory, "dist", "schemas/handoff/work-record-package.schema.json")),
      "filtered runtime is missing the canonical handoff manifest schema",
    );
    assert(!existsSync(join(runtimeDirectory, "node_modules", "tsx")), "filtered runtime must not contain tsx");
    const metadata = JSON.parse(readFileSync(join(runtimeDirectory, "package.json"), "utf8"));
    assert.equal(metadata.scripts?.start, "node dist/index.mjs");

    const port = await unusedLoopbackPort();
    runtime = startRuntime(runtimeDirectory, port);
    await waitForHealth(port, runtime.output);
    await verifyCanonicalSchemaRuntime(port);
  } finally {
    if (runtime) await stopRuntime(runtime.child);
    rmSync(runtimeDirectory, { recursive: true, force: true });
  }
}

await main();
