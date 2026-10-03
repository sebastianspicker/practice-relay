/** Operational secret-backend contracts kept separate from record persistence tests. */
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { resolveOpsSecrets } from "./index.ts";
import { kmsStubEncrypt } from "./ops-secrets.ts";

describe("resolveOpsSecrets backends", () => {
  const kmsStubTestKey = ["lab", "kms", "stub", "key"].join("-");

  it("supports development and strict environment secrets", () => {
    const lab = resolveOpsSecrets({});
    assert.equal(lab.usingDevDefaults, true);
    assert.equal(lab.secretBackend, "env");
    assert.throws(() =>
      resolveOpsSecrets({ PRACTICE_RELAY_REQUIRE_SECRETS: "1" } as NodeJS.ProcessEnv),
    );
    for (const [authSecret, ltiSecret] of [
      ["short", "also-short"],
      ["replace-me-practice-relay-auth-lab-secret", "x".repeat(40)],
      ["x".repeat(40), "x".repeat(40)],
    ]) {
      assert.throws(
        () => resolveOpsSecrets({
          PRACTICE_RELAY_REQUIRE_SECRETS: "1",
          PRACTICE_RELAY_AUTH_SECRET: authSecret,
          PRACTICE_RELAY_LTI_SECRET: ltiSecret,
        } as NodeJS.ProcessEnv),
        /distinct, non-placeholder/i,
      );
    }
    const strict = resolveOpsSecrets({
      PRACTICE_RELAY_REQUIRE_SECRETS: "1",
      PRACTICE_RELAY_AUTH_SECRET: "a".repeat(40),
      PRACTICE_RELAY_LTI_SECRET: "b".repeat(40),
    } as NodeJS.ProcessEnv);
    assert.equal(strict.usingDevDefaults, false);
    const configured = resolveOpsSecrets({
      PRACTICE_RELAY_AUTH_SECRET: "a",
      PRACTICE_RELAY_LTI_SECRET: "b",
    } as NodeJS.ProcessEnv);
    assert.equal(configured.usingDevDefaults, false);
    assert.equal(configured.authSecret, "a");
    assert.equal(configured.secretBackend, "env");
  });

  it("reads file-backend secrets from a directory", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hub-secrets-"));
    try {
      writeFileSync(path.join(dir, "auth"), "file-auth-secret\n", "utf8");
      writeFileSync(path.join(dir, "lti"), "file-lti-secret\n", "utf8");
      chmodSync(path.join(dir, "auth"), 0o600);
      chmodSync(path.join(dir, "lti"), 0o600);
      const secrets = resolveOpsSecrets({
        SECRET_BACKEND: "file",
        SECRET_FILE_DIR: dir,
      } as NodeJS.ProcessEnv);
      assert.equal(secrets.secretBackend, "file");
      assert.equal(secrets.authSecret, "file-auth-secret");
      assert.equal(secrets.ltiSecret, "file-lti-secret");
      assert.equal(secrets.usingDevDefaults, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("decrypts authenticated kms-stub ciphertext", () => {
    const key = kmsStubTestKey;
    const secrets = resolveOpsSecrets({
      SECRET_BACKEND: "kms-stub",
      KMS_STUB_KEY: key,
      PRACTICE_RELAY_AUTH_SECRET_CIPHER: kmsStubEncrypt("auth-from-kms", key),
      PRACTICE_RELAY_LTI_SECRET_CIPHER: kmsStubEncrypt("lti-from-kms", key),
    } as NodeJS.ProcessEnv);
    assert.equal(secrets.secretBackend, "kms-stub");
    assert.equal(secrets.authSecret, "auth-from-kms");
    assert.equal(secrets.ltiSecret, "lti-from-kms");
    assert.equal(secrets.usingDevDefaults, false);
  });

  it("rejects tampered or malformed kms-stub inputs without disclosure", () => {
    const plaintext = "auth-from-kms";
    const tampered = Buffer.from(kmsStubEncrypt(plaintext, kmsStubTestKey), "base64");
    tampered[12] ^= 0x01;
    assert.throws(
      () => resolveOpsSecrets({
        SECRET_BACKEND: "kms-stub",
        KMS_STUB_KEY: kmsStubTestKey,
        PRACTICE_RELAY_AUTH_SECRET_CIPHER: tampered.toString("base64"),
      } as NodeJS.ProcessEnv),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes(plaintext), false);
        assert.equal(error.message.includes(kmsStubTestKey), false);
        return true;
      },
    );
    assert.throws(
      () => resolveOpsSecrets({
        SECRET_BACKEND: "kms-stub",
        KMS_STUB_KEY: kmsStubTestKey,
        PRACTICE_RELAY_AUTH_SECRET_CIPHER: Buffer.alloc(28).toString("base64"),
      } as NodeJS.ProcessEnv),
      /kms-stub ciphertext too short/,
    );
    assert.throws(() => resolveOpsSecrets({
      SECRET_BACKEND: "kms-stub",
      PRACTICE_RELAY_AUTH_SECRET_CIPHER: "AAAA",
    } as NodeJS.ProcessEnv));
  });

  it("reads explicitly addressed file secrets", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hub-secrets-paths-"));
    try {
      const authPath = path.join(dir, "a.secret");
      const ltiPath = path.join(dir, "l.secret");
      writeFileSync(authPath, "path-auth", "utf8");
      writeFileSync(ltiPath, "path-lti", "utf8");
      chmodSync(authPath, 0o600);
      chmodSync(ltiPath, 0o600);
      const secrets = resolveOpsSecrets({
        SECRET_BACKEND: "file",
        PRACTICE_RELAY_AUTH_SECRET_FILE: authPath,
        PRACTICE_RELAY_LTI_SECRET_FILE: ltiPath,
      } as NodeJS.ProcessEnv);
      assert.equal(secrets.authSecret, "path-auth");
      assert.equal(secrets.ltiSecret, "path-lti");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
