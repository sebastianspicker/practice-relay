/**
 * Regression: API opsSecrets.ltiSecret must drive LTI launch + verify.
 * PRACTICE_RELAY_LTI_SECRET must not be a false-green health signal.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LTI_DEFAULT_SECRET,
  buildLtiResourceLinkLaunch,
  verifyHs256Jwt,
  verifyLtiJwt,
} from "../../lti/src/index.mjs";
import { resolveOpsSecrets } from "@practice-relay/record-store";

const apiSourceDir = dirname(fileURLToPath(import.meta.url));
const apiSrc = readdirSync(apiSourceDir)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .sort()
  .map((name) => readFileSync(join(apiSourceDir, name), "utf8"))
  .join("\n");

test("API source modules wire opsSecrets.ltiSecret into LTI launch and verify", () => {
  // Structural: shipped API must pass the resolved secret (not omit it).
  assert.match(
    apiSrc,
    /verifyLtiJwt\(\s*token,\s*\{[\s\S]*?secret:\s*opsSecrets\.ltiSecret/,
  );
  assert.match(
    apiSrc,
    /buildLtiResourceLinkLaunch\(\s*record,\s*\{[\s\S]*?secret:\s*opsSecrets\.ltiSecret/,
  );
  assert.match(apiSrc, /createAuthService\(opsSecrets\.authSecret\)/);
  assert.match(apiSrc, /issueAgsServiceToken\([\s\S]*?secret:\s*opsSecrets\.ltiSecret/);
  assert.match(apiSrc, /"GET \/lti\/jwks":\s*handleJwks/);
});

test("opsSecrets.ltiSecret from PRACTICE_RELAY_LTI_SECRET signs launch and rejects default secret", () => {
  const custom = "api-wired-lti-secret-xyz";
  const secrets = resolveOpsSecrets({
    PRACTICE_RELAY_AUTH_SECRET: "auth-x",
    PRACTICE_RELAY_LTI_SECRET: custom,
  } as NodeJS.ProcessEnv);
  assert.equal(secrets.ltiSecret, custom);
  assert.equal(secrets.usingDevDefaults, false);
  assert.notEqual(secrets.ltiSecret, LTI_DEFAULT_SECRET);
  assert.equal(secrets.secretSource, "env");

  const score = {
    id: "ps-secret-wire",
    title: "Secret wire",
    tracks: [
      { id: "v", type: "video" },
      { id: "m", type: "music_notation", ref: "a.musicxml" },
    ],
    takes: [{ id: "t1" }],
    preferredTakeId: "t1",
    usePolicySnapshots: [{ purposes: ["course_assessment"], exportAllowed: true }],
  };

  // Same call shape as practice-relay/apps/api POST /work-records/:id/lti (HS256 when no RSA)
  const launch = buildLtiResourceLinkLaunch(score, {
    userId: "teacher-1",
    secret: secrets.ltiSecret,
  });
  // Same call shape as practice-relay/apps/api POST /lti/launch
  const claims = verifyLtiJwt(launch.idToken, { secret: secrets.ltiSecret });
  assert.ok(claims);
  assert.equal(
    claims["https://purl.imsglobal.org/spec/lti/claim/message_type"],
    "LtiResourceLinkRequest",
  );
  // LTI must actually use ltiSecret (not lab default).
  assert.equal(verifyHs256Jwt(launch.idToken, LTI_DEFAULT_SECRET), null);
});

test("health secretsDevDefaults is true only when either secret missing", () => {
  assert.equal(resolveOpsSecrets({} as NodeJS.ProcessEnv).usingDevDefaults, true);
  assert.equal(
    resolveOpsSecrets({
      PRACTICE_RELAY_AUTH_SECRET: "only-auth",
    } as NodeJS.ProcessEnv).usingDevDefaults,
    true,
  );
  assert.equal(
    resolveOpsSecrets({
      PRACTICE_RELAY_LTI_SECRET: "only-lti",
    } as NodeJS.ProcessEnv).usingDevDefaults,
    true,
  );
  assert.equal(
    resolveOpsSecrets({
      PRACTICE_RELAY_AUTH_SECRET: "a",
      PRACTICE_RELAY_LTI_SECRET: "b",
      SECRET_SOURCE: "kms-inject",
    } as NodeJS.ProcessEnv).usingDevDefaults,
    false,
  );
  assert.equal(
    resolveOpsSecrets({
      PRACTICE_RELAY_AUTH_SECRET: "a",
      PRACTICE_RELAY_LTI_SECRET: "b",
      SECRET_SOURCE: "kms-inject",
    } as NodeJS.ProcessEnv).secretSource,
    "kms-inject",
  );
});
