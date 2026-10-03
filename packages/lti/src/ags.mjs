/**
 * Bounded AGS service-token and score-passback support for the local-mock LTI flow.
 *
 * Why: makes grade authorization independent from resource-link launch tokens.
 */
import { AGS_SCORE_SCOPE, LTI_STATUS } from "./assignment.mjs";
import { resolveLtiSecret, signHs256Jwt, verifyHs256Jwt } from "./jwt.mjs";

/** Validate and normalize the bounded score range used by the lab AGS surface. */
function normalizedAgsIdentity(grade) {
  if (!grade || typeof grade !== "object" || Array.isArray(grade)) {
    throw new TypeError("AGS grade must be an object");
  }
  const recordId = typeof grade.recordId === "string" ? grade.recordId.trim() : "";
  const userId = typeof grade.userId === "string" ? grade.userId.trim() : "";
  if (!recordId || recordId.length > 128 || !userId || userId.length > 256) {
    throw new TypeError("AGS recordId and userId must be bounded non-empty strings");
  }
  return { recordId, userId };
}

function normalizedAgsScore(grade) {
  const scoreMaximum = grade.scoreMaximum ?? 1;
  const scoreGiven = grade.scoreGiven ?? 1;
  if (
    !Number.isFinite(scoreMaximum) ||
    scoreMaximum <= 0 ||
    !Number.isFinite(scoreGiven) ||
    scoreGiven < 0 ||
    scoreGiven > scoreMaximum
  ) {
    throw new RangeError("AGS score must be finite and between zero and scoreMaximum");
  }
  return { scoreGiven, scoreMaximum };
}

function normalizedAgsGrade(grade) {
  const { recordId, userId } = normalizedAgsIdentity(grade);
  const { scoreGiven, scoreMaximum } = normalizedAgsScore(grade);
  return { ...grade, recordId, userId, scoreGiven, scoreMaximum };
}

function rawAgsToken(tokenOrHeader) {
  if (!tokenOrHeader || typeof tokenOrHeader !== "string") return null;
  const raw = tokenOrHeader.startsWith("Bearer ")
    ? tokenOrHeader.slice(7).trim()
    : tokenOrHeader.trim();
  return raw.split(".").length === 3 ? raw : null;
}

function isHs256JwtHeader(token) {
  try {
    const [encodedHeader] = token.split(".");
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    return Boolean(
      header &&
      typeof header === "object" &&
      !Array.isArray(header) &&
      header.alg === "HS256" &&
      header.typ === "JWT",
    );
  } catch {
    return false;
  }
}

function hasAgsIdentityClaims(claims) {
  return (
    claims.token_use === "ags_service" &&
    claims.iss === "https://practice-relay.local/mock-platform" &&
    claims.aud === "practice-relay-ags"
  );
}

function hasValidAgsTimes(claims, now) {
  return (
    typeof claims.exp === "number" &&
    now < claims.exp &&
    typeof claims.iat === "number" &&
    claims.iat <= now + 30
  );
}

function hasAgsScoreScope(claims) {
  const scopes = String(claims.scope ?? "").split(/\s+/).filter(Boolean);
  return scopes.includes(AGS_SCORE_SCOPE);
}

function hasValidAgsClaims(claims, now) {
  if (!claims || typeof claims !== "object") return false;
  return hasAgsIdentityClaims(claims) && hasValidAgsTimes(claims, now) && hasAgsScoreScope(claims);
}

/**
 * Simulate AGS grade line-item passback after submit tag.
 * @param {{ recordId: string, userId: string, activityProgress?: string, gradingProgress?: string, scoreGiven?: number, scoreMaximum?: number }} grade
 */
export function simulateAgsScorePassback(grade) {
  const normalized = normalizedAgsGrade(grade);
  return {
    status: LTI_STATUS,
    kind: "ags-score-result",
    lineItem: `https://practice-relay.local/mock-platform/lineitems/${encodeURIComponent(normalized.recordId)}`,
    userId: normalized.userId,
    scoreGiven: normalized.scoreGiven,
    scoreMaximum: normalized.scoreMaximum,
    activityProgress: normalized.activityProgress ?? "Completed",
    gradingProgress: normalized.gradingProgress ?? "FullyGraded",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Client-credentials mock: issue AGS service access token (Bearer JWT).
 * Lab-only - not a live LMS token endpoint.
 *
 * @param {{
 *   clientId?: string,
 *   clientSecret?: string,
 *   expectedClientSecret?: string,
 *   secret?: string,
 *   scope?: string,
 *   expiresIn?: number,
 * }} [opts]
 * @returns {{ access_token: string, token_type: "Bearer", expires_in: number, scope: string, status: string } | null}
 */
export function issueAgsServiceToken(opts = {}) {
  if (
    opts.expectedClientSecret != null &&
    opts.clientSecret !== opts.expectedClientSecret
  ) {
    return null;
  }
  const secret = resolveLtiSecret(opts.secret);
  const clientId = opts.clientId ?? "practice-relay-tool";
  const expiresIn = opts.expiresIn ?? 3600;
  const scope = opts.scope ?? AGS_SCORE_SCOPE;
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: "https://practice-relay.local/mock-platform",
    sub: clientId,
    aud: "practice-relay-ags",
    iat: now,
    exp: now + expiresIn,
    token_use: "ags_service",
    scope,
  };
  return {
    access_token: signHs256Jwt(claims, secret),
    token_type: "Bearer",
    expires_in: expiresIn,
    scope,
    status: LTI_STATUS,
  };
}

/**
 * Verify Bearer AGS service token (client-credentials shape).
 * @param {string | undefined | null} tokenOrHeader
 * @param {string} [secret]
 */
export function verifyAgsServiceToken(tokenOrHeader, secret) {
  const raw = rawAgsToken(tokenOrHeader);
  if (!raw || !isHs256JwtHeader(raw)) return null;
  const claims = verifyHs256Jwt(raw, secret);
  const now = Math.floor(Date.now() / 1000);
  return hasValidAgsClaims(claims, now) ? claims : null;
}

/**
 * Accept AGS score POST with service-token auth (local-mock).
 * @param {{ recordId: string, userId: string, scoreGiven?: number, scoreMaximum?: number, activityProgress?: string, gradingProgress?: string }} grade
 * @param {string | undefined | null} authHeader
 * @param {string} [secret]
 */
export function processAgsScoreWithServiceToken(grade, authHeader, secret) {
  const claims = verifyAgsServiceToken(authHeader, secret);
  if (!claims) {
    return { ok: false, error: "invalid_service_token" };
  }
  let result;
  try {
    result = simulateAgsScorePassback(grade);
  } catch {
    return { ok: false, error: "invalid_grade" };
  }
  return {
    ok: true,
    result,
    tokenSub: claims.sub,
  };
}
