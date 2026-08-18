/**
 * Operational secret resolution and test-only KMS-stub cryptography.
 *
 * Why: keeps secret loading strict and prevents values from crossing into store diagnostics.
 */
import { existsSync, readFileSync } from "node:fs";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import path from "node:path";

/** Supported operational secret-loading backends. */
export type SecretBackend = "env" | "file" | "kms-stub";

/** Resolved authentication and LTI secrets plus non-sensitive provenance labels. */
export interface OpsSecrets {
  authSecret: string;
  ltiSecret: string;
  usingDevDefaults: boolean;
  /** @deprecated prefer secretBackend; kept for health/readiness labels */
  secretSource: string;
  secretBackend: SecretBackend;
}

const readSecretFile = (filePath: string): string => {
  const abs = path.resolve(filePath);
  if (!existsSync(abs)) {
    throw new Error(`secret file not found: ${abs}`);
  }
  return readFileSync(abs, "utf8").trim();
}

/** Reject weak or example HMAC material when strict lab secrets are required. */
const insecureConfiguredSecret = (secret: string): boolean => {
  return (
    secret.length < 32 ||
    /(?:replace|change[-_ ]?me|placeholder|example|dev[-_ ]?only)/i.test(secret)
  );
}

const ephemeralAuthSecret = randomBytes(32).toString("base64url");
const ephemeralLtiSecret = randomBytes(32).toString("base64url");

const kmsStubDecrypt = (ciphertextB64: string, localKey: string): string => {
  const raw = Buffer.from(ciphertextB64, "base64");
  if (raw.length < 12 + 16 + 1) {
    throw new Error("kms-stub ciphertext too short");
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const key = createHash("sha256").update(localKey).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

const configuredBackend = (env: NodeJS.ProcessEnv): SecretBackend => {
  const backendRaw =
    env.SECRET_BACKEND?.trim().toLowerCase() ||
    (env.SECRET_SOURCE?.trim().toLowerCase() === "file"
      ? "file"
      : env.SECRET_SOURCE?.trim().toLowerCase() === "kms-stub"
        ? "kms-stub"
        : "env");
  return backendRaw === "file" || backendRaw === "kms-stub" ? backendRaw : "env";
}

const environmentSecrets = (env: NodeJS.ProcessEnv): [string, string] => {
  return [
    env.PRACTICE_RELAY_AUTH_SECRET?.trim() || "",
    env.PRACTICE_RELAY_LTI_SECRET?.trim() || "",
  ];
}

const fileSecrets = (env: NodeJS.ProcessEnv): [string, string] => {
  const authFile =
    env.PRACTICE_RELAY_AUTH_SECRET_FILE?.trim() ||
    (env.SECRET_FILE_DIR ? path.join(env.SECRET_FILE_DIR, "auth") : undefined);
  const ltiFile =
    env.PRACTICE_RELAY_LTI_SECRET_FILE?.trim() ||
    (env.SECRET_FILE_DIR ? path.join(env.SECRET_FILE_DIR, "lti") : undefined);
  const [envAuth, envLti] = environmentSecrets(env);
  const fileAuth = authFile ? readSecretFile(authFile) : "";
  const fileLti = ltiFile ? readSecretFile(ltiFile) : "";
  return [fileAuth || envAuth, fileLti || envLti];
}

const kmsStubSecrets = (env: NodeJS.ProcessEnv): [string, string] => {
  const localKey = env.KMS_STUB_KEY?.trim();
  if (!localKey) throw new Error("SECRET_BACKEND=kms-stub requires KMS_STUB_KEY");
  const [envAuth, envLti] = environmentSecrets(env);
  const authCipher = env.PRACTICE_RELAY_AUTH_SECRET_CIPHER?.trim();
  const ltiCipher = env.PRACTICE_RELAY_LTI_SECRET_CIPHER?.trim();
  return [
    authCipher ? kmsStubDecrypt(authCipher, localKey) : envAuth,
    ltiCipher ? kmsStubDecrypt(ltiCipher, localKey) : envLti,
  ];
}

const secretsForBackend = (env: NodeJS.ProcessEnv, backend: SecretBackend): [string, string] => {
  if (backend === "file") return fileSecrets(env);
  if (backend === "kms-stub") return kmsStubSecrets(env);
  return environmentSecrets(env);
}

const assertRequiredSecrets = (
  env: NodeJS.ProcessEnv,
  authSecret: string,
  ltiSecret: string,
  usingDevDefaults: boolean,
): void => {
  if (env.PRACTICE_RELAY_REQUIRE_SECRETS !== "1") return;
  if (
    usingDevDefaults ||
    insecureConfiguredSecret(authSecret) ||
    insecureConfiguredSecret(ltiSecret) ||
    authSecret === ltiSecret
  ) {
    throw new Error(
      "PRACTICE_RELAY_REQUIRE_SECRETS=1 requires distinct, non-placeholder auth and LTI secrets of at least 32 characters",
    );
  }
}

/**
 * kms-stub: decrypt base64 ciphertext produced as:
 *   aes-256-gcm(key=sha256(KMS_STUB_KEY), plaintext) → base64(iv|tag|ciphertext)
 * For tests only - never a cloud KMS SDK.
 */
export function kmsStubEncrypt(plaintext: string, localKey: string): string {
  const key = createHash("sha256").update(localKey).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/**
 * Resolve secrets for lab/ops: never log secret values.
 *
 * SECRET_BACKEND=env|file|kms-stub (preferred).
 * SECRET_SOURCE kept as alias / ops label for inject notes (env|kms-inject|file|kms-stub).
 *
 * - env: PRACTICE_RELAY_AUTH_SECRET / PRACTICE_RELAY_LTI_SECRET
 * - file: PRACTICE_RELAY_AUTH_SECRET_FILE / PRACTICE_RELAY_LTI_SECRET_FILE (or SECRET_FILE_DIR/{auth,lti})
 * - kms-stub: PRACTICE_RELAY_AUTH_SECRET_CIPHER / PRACTICE_RELAY_LTI_SECRET_CIPHER + KMS_STUB_KEY
 */
/** Resolve operational secrets without exposing their values to callers. */
export function resolveOpsSecrets(
  env: NodeJS.ProcessEnv = process.env,
): OpsSecrets {
  const secretBackend = configuredBackend(env);
  let [authSecret, ltiSecret] = secretsForBackend(env, secretBackend);

  const usingDevDefaults = !authSecret || !ltiSecret;
  if (!authSecret) authSecret = ephemeralAuthSecret;
  if (!ltiSecret) ltiSecret = ephemeralLtiSecret;
  assertRequiredSecrets(env, authSecret, ltiSecret, usingDevDefaults);
  const secretSource = env.SECRET_SOURCE?.trim() || secretBackend;

  return {
    authSecret,
    ltiSecret,
    usingDevDefaults,
    secretSource,
    secretBackend,
  };
}
