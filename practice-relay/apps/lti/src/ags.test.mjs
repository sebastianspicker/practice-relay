/** LTI focused protocol tests. Why: keep protocol regressions independently runnable. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { AGS_SCORE_SCOPE, simulateAgsScorePassback, issueAgsServiceToken, verifyAgsServiceToken, processAgsScoreWithServiceToken, resolveLtiSecret } from "./index.mjs";

test("AGS score passback simulation", () => {
  const result = simulateAgsScorePassback({
    recordId: "ps-demo",
    userId: "student-1",
    scoreGiven: 1,
  });
  assert.equal(result.kind, "ags-score-result");
  assert.equal(result.status, "local-mock");
  assert.equal(result.activityProgress, "Completed");
  assert.throws(
    () => simulateAgsScorePassback({
      recordId: "ps-demo",
      userId: "student-1",
      scoreGiven: -1,
    }),
    /between zero and scoreMaximum/,
  );
  assert.throws(
    () => simulateAgsScorePassback({
      recordId: "ps-demo",
      userId: "student-1",
      scoreGiven: 2,
      scoreMaximum: 1,
    }),
    /between zero and scoreMaximum/,
  );
});

test("AGS client-credentials service token issues and authorizes score POST", () => {
  const custom = randomBytes(32).toString("base64url");
  const issued = issueAgsServiceToken({
    clientId: "practice-relay-tool",
    secret: custom,
  });
  assert.ok(issued);
  assert.equal(issued.token_type, "Bearer");
  assert.equal(issued.scope, AGS_SCORE_SCOPE);
  assert.ok(issued.access_token);

  const claims = verifyAgsServiceToken(
    `Bearer ${issued.access_token}`,
    custom,
  );
  assert.ok(claims);
  assert.equal(claims.token_use, "ags_service");

  const ok = processAgsScoreWithServiceToken(
    { recordId: "ps-demo", userId: "student-1", scoreGiven: 1 },
    `Bearer ${issued.access_token}`,
    custom,
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.result.kind, "ags-score-result");

  const invalidGrade = processAgsScoreWithServiceToken(
    { recordId: "ps-demo", userId: "student-1", scoreMaximum: 0 },
    `Bearer ${issued.access_token}`,
    custom,
  );
  assert.deepEqual(invalidGrade, { ok: false, error: "invalid_grade" });

  const bad = processAgsScoreWithServiceToken(
    { recordId: "ps-demo", userId: "student-1" },
    "Bearer not-a-token",
    custom,
  );
  assert.equal(bad.ok, false);

  // Wrong secret rejects
  assert.equal(
    verifyAgsServiceToken(issued.access_token, resolveLtiSecret(undefined, {})),
    null,
  );
});
