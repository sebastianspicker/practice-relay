/** Operational secret file boundary regressions. */
import assert from "node:assert/strict";
import { chmodSync, linkSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveOpsSecrets } from "./ops-secrets.ts";

test("secret files require private, unlinked regular files while preserving file precedence", () => {
  const root = mkdtempSync(path.join(tmpdir(), "practice-relay-secret-file-"));
  const auth = path.join(root, "auth");
  const lti = path.join(root, "lti");
  try {
    writeFileSync(auth, "file-auth", { mode: 0o600 });
    writeFileSync(lti, "file-lti", { mode: 0o600 });
    const loaded = resolveOpsSecrets({
      SECRET_BACKEND: "file",
      PRACTICE_RELAY_AUTH_SECRET_FILE: auth,
      PRACTICE_RELAY_LTI_SECRET_FILE: lti,
      PRACTICE_RELAY_AUTH_SECRET: "env-auth",
      PRACTICE_RELAY_LTI_SECRET: "env-lti",
    } as NodeJS.ProcessEnv);
    assert.equal(loaded.authSecret, "file-auth");
    assert.equal(loaded.ltiSecret, "file-lti");

    chmodSync(auth, 0o644);
    assert.throws(() => resolveOpsSecrets({ SECRET_BACKEND: "file", PRACTICE_RELAY_AUTH_SECRET_FILE: auth } as NodeJS.ProcessEnv), /private regular file/i);
    chmodSync(auth, 0o600);
    const linked = path.join(root, "auth-link");
    symlinkSync(auth, linked);
    assert.throws(() => resolveOpsSecrets({ SECRET_BACKEND: "file", PRACTICE_RELAY_AUTH_SECRET_FILE: linked } as NodeJS.ProcessEnv), /regular file/i);
    const hardlinked = path.join(root, "auth-hardlink");
    linkSync(auth, hardlinked);
    assert.throws(() => resolveOpsSecrets({ SECRET_BACKEND: "file", PRACTICE_RELAY_AUTH_SECRET_FILE: hardlinked } as NodeJS.ProcessEnv), /singly linked/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
