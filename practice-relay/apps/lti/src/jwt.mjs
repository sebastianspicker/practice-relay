/**
 * LTI JWT, key, and resource-link launch primitives for the local-mock boundary.
 *
 * Why: keeps signing and claim validation distinct from assignment projection.
 */
import {
  createHmac,
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  LTI_DEFAULT_LAUNCH_URL,
  LTI_LAB_KID,
  LTI_STATUS,
  buildMultiAssetAssignmentPayload,
  validateMultiAssetAssignmentPayload,
} from "./assignment.mjs";

/** Dev default only - production labs must set PRACTICE_RELAY_LTI_SECRET. */
export const LTI_DEFAULT_SECRET = "practice-relay-lti-lab-secret";

/**
 * Resolve LTI HMAC secret: explicit arg → PRACTICE_RELAY_LTI_SECRET → lab default.
 * @param {string | undefined | null} [explicit]
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveLtiSecret(explicit, env = process.env) {
  const fromArg = typeof explicit === "string" ? explicit.trim() : "";
  if (fromArg) return fromArg;
  const fromEnv = env.PRACTICE_RELAY_LTI_SECRET?.trim();
  if (fromEnv) return fromEnv;
  return LTI_DEFAULT_SECRET;
}

/**
 * Optional RSA keypair for demos that need asymmetric shape.
 * @returns {{ publicKey: string, privateKey: string }}
 */
export function generateLabPlatformKeys() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

/**
 * Convert SPKI public PEM to a JWK (RSA) with kid/use/alg for JWKS.
 * @param {string} publicKeyPem
 * @param {string} [kid]
 */
export function publicKeyToJwk(publicKeyPem, kid = LTI_LAB_KID) {
  const key = createPublicKey(publicKeyPem);
  const jwk = key.export({ format: "jwk" });
  return {
    ...jwk,
    kid,
    use: "sig",
    alg: "RS256",
  };
}

/**
 * Build platform JWKS JSON document from public PEM.
 * @param {string} publicKeyPem
 * @param {string} [kid]
 */
export function exportPlatformJwks(publicKeyPem, kid = LTI_LAB_KID) {
  return { keys: [publicKeyToJwk(publicKeyPem, kid)] };
}

/**
 * Resolve lab RSA keys from env or on-disk key directory.
 *
 * Env:
 * - PRACTICE_RELAY_LTI_RSA_PRIVATE + PRACTICE_RELAY_LTI_RSA_PUBLIC (PEM strings)
 * - PRACTICE_RELAY_LTI_KEYS_DIR with private.pem + public.pem
 * - PRACTICE_RELAY_LTI_GENERATE_RSA=1 with KEYS_DIR → generate & store once
 * - PRACTICE_RELAY_LTI_KID optional kid override
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ privateKeyPem: string, publicKeyPem: string, kid: string } | null}
 */
export function resolveLabRsaKeys(env = process.env) {
  const kid = env.PRACTICE_RELAY_LTI_KID?.trim() || LTI_LAB_KID;
  const priv = env.PRACTICE_RELAY_LTI_RSA_PRIVATE?.trim();
  const pub = env.PRACTICE_RELAY_LTI_RSA_PUBLIC?.trim();
  if (priv && pub) {
    return { privateKeyPem: priv, publicKeyPem: pub, kid };
  }

  const keysDir = env.PRACTICE_RELAY_LTI_KEYS_DIR?.trim();
  if (!keysDir) return null;

  const privatePath = path.join(keysDir, "private.pem");
  const publicPath = path.join(keysDir, "public.pem");
  if (existsSync(privatePath) && existsSync(publicPath)) {
    return {
      privateKeyPem: readFileSync(privatePath, "utf8"),
      publicKeyPem: readFileSync(publicPath, "utf8"),
      kid,
    };
  }

  if (env.PRACTICE_RELAY_LTI_GENERATE_RSA === "1") {
    const pair = generateLabPlatformKeys();
    mkdirSync(keysDir, { recursive: true, mode: 0o700 });
    writeFileSync(privatePath, pair.privateKey, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    writeFileSync(publicPath, pair.publicKey, {
      encoding: "utf8",
      mode: 0o644,
      flag: "wx",
    });
    return {
      privateKeyPem: pair.privateKey,
      publicKeyPem: pair.publicKey,
      kid,
    };
  }

  return null;
}

/**
 * Sign a compact JWT with HMAC-SHA256 (lab keys only).
 * @param {Record<string, unknown>} payload
 * @param {string} [secret]
 */
export function signHs256Jwt(payload, secret) {
  const key = resolveLtiSecret(secret);
  const header = { alg: "HS256", typ: "JWT" };
  const h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", key)
    .update(`${h}.${p}`)
    .digest("base64url");
  return `${h}.${p}.${sig}`;
}

/**
 * @param {string} token
 * @param {string} [secret]
 */
export function verifyHs256Jwt(token, secret) {
  const key = resolveLtiSecret(secret);
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = createHmac("sha256", key)
    .update(`${h}.${p}`)
    .digest("base64url");
  const actualBytes = Buffer.from(s, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} privateKeyPem
 * @param {string} [kid]
 */
export function signRs256Jwt(payload, privateKeyPem, kid = LTI_LAB_KID) {
  const header = { alg: "RS256", typ: "JWT", kid };
  const h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${h}.${p}`);
  signer.end();
  const sig = signer.sign(privateKeyPem, "base64url");
  return `${h}.${p}.${sig}`;
}

/**
 * @param {string} token
 * @param {string} publicKeyPem
 */
export function verifyRs256Jwt(token, publicKeyPem) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${h}.${p}`);
    verifier.end();
    if (!verifier.verify(publicKeyPem, s, "base64url")) return null;
    return JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Verify a Resource Link id_token with an explicit algorithm and claim contract.
 * @param {string} token
 * @param {{
 *   secret?: string,
 *   publicKeyPem?: string,
 *   algorithm?: "HS256"|"RS256",
 *   issuer?: string,
 *   audience?: string,
 *   deploymentId?: string,
 *   nonce?: string,
 *   nowSeconds?: number,
 *   clockToleranceSeconds?: number,
 * }} [opts]
 */
function parsedJwtHeader(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader] = parts;
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    return header && typeof header === "object" && !Array.isArray(header)
      ? header
      : null;
  } catch {
    return null;
  }
}

function verifiedLtiClaims(token, opts, algorithm) {
  if (algorithm === "RS256") {
    return opts.publicKeyPem ? verifyRs256Jwt(token, opts.publicKeyPem) : null;
  }
  return verifyHs256Jwt(token, opts.secret);
}

function ltiVerificationOptions(opts) {
  const issuer = opts.issuer ?? "https://practice-relay.local/mock-platform";
  const audience = opts.audience ?? "practice-relay-tool";
  const deploymentId = opts.deploymentId ?? "practice-relay-lab-deploy-1";
  return { issuer, audience, deploymentId };
}

function hasExpectedLtiIssuerAndAudience(claims, opts) {
  const { issuer, audience } = ltiVerificationOptions(opts);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return claims.iss === issuer && aud.includes(audience);
}

function hasValidLtiTimes(claims, opts) {
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.clockToleranceSeconds ?? 30;
  return (
    typeof claims.exp === "number" &&
    now - tolerance < claims.exp &&
    typeof claims.iat === "number" &&
    claims.iat <= now + tolerance &&
    (typeof claims.nbf !== "number" || claims.nbf <= now + tolerance)
  );
}

function hasValidLtiNonce(claims, opts) {
  return (
    typeof claims.nonce === "string" &&
    Boolean(claims.nonce) &&
    (!opts.nonce || claims.nonce === opts.nonce)
  );
}

function hasResourceLinkClaims(claims, opts) {
  const { deploymentId } = ltiVerificationOptions(opts);
  return (
    claims.token_use == null &&
    claims["https://purl.imsglobal.org/spec/lti/claim/message_type"] ===
      "LtiResourceLinkRequest" &&
    claims["https://purl.imsglobal.org/spec/lti/claim/version"] === "1.3.0" &&
    claims["https://purl.imsglobal.org/spec/lti/claim/deployment_id"] === deploymentId
  );
}

function hasValidLtiClaims(claims, opts) {
  return Boolean(
    claims &&
    typeof claims === "object" &&
    hasExpectedLtiIssuerAndAudience(claims, opts) &&
    hasValidLtiTimes(claims, opts) &&
    hasValidLtiNonce(claims, opts) &&
    hasResourceLinkClaims(claims, opts),
  );
}

/** Verify a Resource Link JWT against the local-mock LTI claim contract. */
export function verifyLtiJwt(token, opts = {}) {
  if (!token || typeof token !== "string") return null;
  const header = parsedJwtHeader(token);
  if (!header) return null;
  const algorithm = opts.algorithm ?? (opts.publicKeyPem ? "RS256" : "HS256");
  if (header.alg !== algorithm || header.typ !== "JWT") return null;
  const claims = verifiedLtiClaims(token, opts, algorithm);
  return hasValidLtiClaims(claims, opts) ? claims : null;
}

/**
 * Build LTI 1.3 Resource Link launch id_token claims embedding multi-asset payload.
 * Prefers RS256 when privateKeyPem is provided; otherwise HS256 with secret.
 * @param {WorkRecordLike} score
 * @param {{
 *   userId?: string,
 *   roles?: string[],
 *   platformIss?: string,
 *   deploymentId?: string,
 *   targetLinkUri?: string,
 *   secret?: string,
 *   privateKeyPem?: string,
 *   kid?: string,
 *   nonce?: string,
 * }} [opts]
 */
export function buildLtiResourceLinkLaunch(score, opts = {}) {
  const assignment = buildMultiAssetAssignmentPayload(score);
  const assignmentValidation = validateMultiAssetAssignmentPayload(assignment);
  if (!assignmentValidation.ok) {
    throw new TypeError(
      `refusing to sign invalid multi-asset assignment: ${assignmentValidation.errors}`,
    );
  }
  const targetLinkUri = opts.targetLinkUri ?? LTI_DEFAULT_LAUNCH_URL;
  if (typeof targetLinkUri !== "string" || !targetLinkUri.trim()) {
    throw new TypeError("targetLinkUri must be a non-empty registered URL");
  }
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: opts.platformIss ?? "https://practice-relay.local/mock-platform",
    sub: opts.userId ?? "teacher-1",
    aud: "practice-relay-tool",
    exp: now + 3600,
    iat: now,
    nonce: opts.nonce ?? randomUUID(),
    "https://purl.imsglobal.org/spec/lti/claim/message_type":
      "LtiResourceLinkRequest",
    "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
    "https://purl.imsglobal.org/spec/lti/claim/deployment_id":
      opts.deploymentId ?? "practice-relay-lab-deploy-1",
    "https://purl.imsglobal.org/spec/lti/claim/target_link_uri":
      targetLinkUri,
    "https://purl.imsglobal.org/spec/lti/claim/roles": opts.roles ?? [
      "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor",
    ],
    "https://purl.imsglobal.org/spec/lti/claim/resource_link": {
      id: `rl-${score.id}`,
      title: score.title ?? score.id,
    },
    "https://purl.imsglobal.org/spec/lti/claim/custom": {
      practice_relay_assignment: JSON.stringify(assignment),
      asset_mode: "multi-asset",
    },
  };

  if (opts.privateKeyPem) {
    const idToken = signRs256Jwt(
      claims,
      opts.privateKeyPem,
      opts.kid ?? LTI_LAB_KID,
    );
    return {
      idToken,
      claims,
      assignment,
      status: LTI_STATUS,
      alg: "RS256",
    };
  }

  const secret = resolveLtiSecret(opts.secret);
  const idToken = signHs256Jwt(claims, secret);
  return {
    idToken,
    claims,
    assignment,
    status: LTI_STATUS,
    alg: "HS256",
  };
}
