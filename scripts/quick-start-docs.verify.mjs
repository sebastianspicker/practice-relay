/**
 * Verify that the tester-facing quick start matches the local runtime it describes.
 * Why: synthetic credentials, browser origins, and shared LTI secrets live in code;
 * the documented commands must keep working when either side changes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createAuthService, SEED_USERS } from "@practice-relay/auth";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function documentedCredentials(markdown) {
  const rows = new Map();
  for (const match of markdown.matchAll(/^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gmu)) {
    rows.set(match[1], match[2]);
  }
  return rows;
}

test("README documents a working password for every synthetic user", async () => {
  const credentials = documentedCredentials(read("README.md"));
  const auth = createAuthService("quick-start-docs-verify", SEED_USERS);
  for (const user of SEED_USERS) {
    const password = credentials.get(user.userId);
    assert.ok(password, `README.md does not document synthetic user ${user.userId}`);
    assert.ok(await auth.login(user.userId, password), `documented password for ${user.userId} does not sign in`);
  }
});

const WEB_ORIGIN_ASSIGNMENT = "PRACTICE_RELAY_ALLOWED_ORIGINS=http://127.0.0.1:5173";

test("documented API start commands trust the web workspace origin", () => {
  for (const path of ["README.md", "docs/relay/README.md"]) {
    const starts = read(path).split("\n").filter((line) => line.includes("relay-api start"));
    assert.ok(starts.length > 0, `${path} no longer documents an API start command`);
    for (const line of starts) {
      assert.ok(line.includes(WEB_ORIGIN_ASSIGNMENT), `${path} starts the API without ${WEB_ORIGIN_ASSIGNMENT}: ${line}`);
    }
  }
  assert.ok(read("apps/relay-web/README.md").includes(WEB_ORIGIN_ASSIGNMENT), "apps/relay-web/README.md does not name the API origin setting");
});

test("LTI simulator docs give the API and the simulator one shared secret", () => {
  const lines = read("apps/lti-simulator/README.md").split("\n");
  const exportLine = (line) => line.startsWith("export PRACTICE_RELAY_LTI_SECRET=");
  const apiStart = lines.findIndex((line) => line.includes("relay-api start"));
  const simulatorStart = lines.findIndex((line) => line.includes("lti-simulator start"));
  assert.ok(apiStart >= 0 && simulatorStart > apiStart, "simulator README must start the API, then the simulator");
  assert.ok(lines.slice(0, apiStart).some(exportLine), "simulator README must export the LTI secret before starting the API");
  assert.ok(lines.slice(apiStart, simulatorStart).some(exportLine), "simulator README must export the LTI secret before starting the simulator");
  assert.match(read("docs/relay/README.md"), /PRACTICE_RELAY_LTI_SECRET[\s\S]*\(\.\.\/\.\.\/apps\/lti-simulator\/README\.md#run\)/u);
});

test("web workspace README points testers at the synthetic users", () => {
  assert.match(read("apps/relay-web/README.md"), /\(\.\.\/\.\.\/README\.md#synthetic-users\)/u);
});
