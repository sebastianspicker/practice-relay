/** Process-boundary tests for the Practice Relay API container entrypoint. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const entrypoint = fileURLToPath(
  new URL("../deploy/docker-entrypoint-practice-relay-api.sh", import.meta.url),
);

/** Run the entrypoint through Bash because the tracked source need not be executable. */
const runEntrypoint = (args, env = {}) => {
  return spawnSync("bash", [entrypoint, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
};

test("maps mounted S3 credentials and execs the requested command", (context) => {
  const secretDirectory = mkdtempSync(join(tmpdir(), "practice-relay-entrypoint-"));
  context.after(() => rmSync(secretDirectory, { recursive: true, force: true }));
  const accessFile = join(secretDirectory, "access");
  const secretFile = join(secretDirectory, "secret");
  writeFileSync(accessFile, "fixture-access\r\n", "utf8");
  writeFileSync(secretFile, "fixture-secret\n", "utf8");

  const result = runEntrypoint(
    [
      process.execPath,
      "-e",
      "process.exit(process.env.PRACTICE_RELAY_S3_ACCESS_KEY === 'fixture-access' && process.env.PRACTICE_RELAY_S3_SECRET_KEY === 'fixture-secret' ? 0 : 1)",
    ],
    {
      PRACTICE_RELAY_S3_ACCESS_KEY: "stale-access",
      PRACTICE_RELAY_S3_SECRET_KEY: "stale-secret",
      PRACTICE_RELAY_S3_ACCESS_KEY_FILE: accessFile,
      PRACTICE_RELAY_S3_SECRET_KEY_FILE: secretFile,
    },
  );

  assert.equal(result.status, 0, result.stderr);
});

test("fails closed when a configured secret file is unreadable", () => {
  const result = runEntrypoint([process.execPath, "-e", "process.exit(0)"], {
    PRACTICE_RELAY_S3_ACCESS_KEY_FILE: "/path/that/does/not/exist",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /PRACTICE_RELAY_S3_ACCESS_KEY_FILE is not readable/);
});

test("fails closed when a configured secret file is empty", (context) => {
  const secretDirectory = mkdtempSync(join(tmpdir(), "practice-relay-entrypoint-"));
  context.after(() => rmSync(secretDirectory, { recursive: true, force: true }));
  const accessFile = join(secretDirectory, "access");
  writeFileSync(accessFile, "\n", "utf8");

  const result = runEntrypoint([process.execPath, "-e", "process.exit(0)"], {
    PRACTICE_RELAY_S3_ACCESS_KEY_FILE: accessFile,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /PRACTICE_RELAY_S3_ACCESS_KEY_FILE is empty/);
});

test("fails closed when no container command is provided", () => {
  const result = runEntrypoint([]);

  assert.equal(result.status, 64);
  assert.match(result.stderr, /requires a command/);
});
