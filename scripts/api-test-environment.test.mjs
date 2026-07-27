/**
 * Subprocess regression for the API unit-test environment boundary.
 * Why: test imports must not touch ambient files, stores, or network endpoints.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("API test bootstrap rejects ambient storage, file, and network inputs", (context) => {
  const scratch = mkdtempSync(join(tmpdir(), "practice-relay-api-environment-"));
  context.after(() => rmSync(scratch, { recursive: true, force: true }));
  const dataDirectory = join(scratch, "durable");
  const mediaDirectory = join(scratch, "media");
  const keyDirectory = join(scratch, "keys");
  const missing = join(scratch, "must-not-be-read");
  const code = `
globalThis.fetch = async () => { throw new Error("network attempted"); };
for (const name of [
  "PRACTICE_RELAY_DATA",
  "PRACTICE_RELAY_MEDIA",
  "PRACTICE_RELAY_S3_ENDPOINT",
  "PRACTICE_RELAY_AUTH_USERS_FILE",
  "PRACTICE_RELAY_LTI_KEYS_DIR",
  "SECRET_BACKEND",
  "HTTP_PROXY",
]) {
  if (name in process.env) throw new Error("ambient variable retained: " + name);
}
if (process.env.PRACTICE_RELAY_OBJECT_STORE !== "memory") {
  throw new Error("unit object store is not memory-only");
}
const { handleRequest } = await import("./practice-relay/apps/api/src/index.ts");
const { mockReq, mockRes } = await import("./practice-relay/apps/api/src/test-support/http-mocks.ts");
const response = mockRes();
await handleRequest(mockReq("/readyz"), response);
if (response.statusCode !== 200) throw new Error("unit readiness failed");
`;
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      join(root, "practice-relay/apps/api/src/test-support/test-environment.mjs"),
      "--import",
      join(root, "practice-relay/apps/api/src/test-support/workspace-resolver.mjs"),
      "--input-type=module",
      "-e",
      code,
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        PRACTICE_RELAY_DATA: dataDirectory,
        PRACTICE_RELAY_MEDIA: mediaDirectory,
        PRACTICE_RELAY_OBJECT_STORE: "s3",
        PRACTICE_RELAY_S3_ENDPOINT: "https://storage.invalid",
        PRACTICE_RELAY_S3_BUCKET: "blocked",
        PRACTICE_RELAY_S3_ACCESS_KEY: "x",
        PRACTICE_RELAY_S3_SECRET_KEY: "x",
        PRACTICE_RELAY_AUTH_USERS_FILE: missing,
        PRACTICE_RELAY_LTI_KEYS_DIR: keyDirectory,
        PRACTICE_RELAY_LTI_GENERATE_RSA: "1",
        SECRET_BACKEND: "file",
        SECRET_FILE_DIR: missing,
        HTTP_PROXY: "http://proxy.invalid",
      },
    },
  );

  assert.equal(child.status, 0, `${child.stdout}${child.stderr}`);
  assert.equal(existsSync(dataDirectory), false);
  assert.equal(existsSync(mediaDirectory), false);
  assert.equal(existsSync(keyDirectory), false);
});
