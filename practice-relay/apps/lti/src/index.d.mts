/**
 * Type surface for the Practice Relay LTI local-mock JavaScript module.
 *
 * Why: the API is TypeScript while the executable mock remains plain ESM;
 * this keeps their shared launch and AGS boundary checked without duplicating it.
 */
import type { WorkRecord } from "@practice-relay/work-record-core";

/** Local-mock implementation status exposed by API health. */
export const LTI_STATUS: "local-mock";

/** Ready marker carried by valid multi-asset assignment claims. */
export const LTI_ASSIGNMENT_PAYLOAD_STATUS: "ready";

/** Default key identifier for locally generated RSA signing keys. */
export const LTI_LAB_KID: "practice-relay-lab-1";

/** AGS score-write scope used by the local client-credentials flow. */
export const AGS_SCORE_SCOPE: string;

/** Registered local-mock tool launch URL; never derived from OIDC input. */
export const LTI_DEFAULT_LAUNCH_URL: "http://localhost:8787/lti/launch";

/** Insecure fallback retained only for explicitly labelled local-mock tests. */
export const LTI_DEFAULT_SECRET: string;

/** Track projection embedded in a multi-asset assignment. */
export interface MultiAssetAssignmentTrack {
  id: string;
  type: string;
  label?: string;
  ref?: string;
}

/** Take projection embedded in a multi-asset assignment. */
export interface MultiAssetAssignmentTake {
  id: string;
  label?: string;
  mediaPath?: string;
}

/** Stable local-mock assignment shape that explicitly excludes video-only payloads. */
export interface MultiAssetAssignmentPayload {
  schemaVersion: "0.2.0";
  kind: "practice-relay-multi-asset-assignment";
  packageId: string;
  workId: string;
  title: string;
  trackTypes: string[];
  tracks: MultiAssetAssignmentTrack[];
  preferredTakeId: string | null;
  takes: MultiAssetAssignmentTake[];
  consentRequired: boolean;
  mveiRef: string | null;
  motifRef: string | null;
  musicxmlRef: string | null;
  assetMode: "multi-asset";
  singleVideoUrl: null;
  ltiHandshakeStatus: "local-mock";
  assignmentPayloadStatus: "ready";
}

/** Describe the explicitly local-mock LTI status for user-facing diagnostics. */
export function ltiStatusMessage(): string;

/** Build the multi-asset assignment claim for an LTI resource link. */
export function buildMultiAssetAssignmentPayload(
  score: WorkRecord,
): MultiAssetAssignmentPayload;

/** Validate the multi-asset assignment invariant before launch. */
export function validateMultiAssetAssignmentPayload(
  payload: unknown,
): { ok: boolean; errors?: string };

/** Build and sign a local-mock LTI resource-link launch. */
export function buildLtiResourceLinkLaunch(
  score: WorkRecord | Record<string, unknown>,
  opts?: {
    userId?: string;
    roles?: string[];
    platformIss?: string;
    deploymentId?: string;
    targetLinkUri?: string;
    secret?: string;
    privateKeyPem?: string;
    kid?: string;
    nonce?: string;
  },
): {
  idToken: string;
  claims: Record<string, unknown>;
  assignment: MultiAssetAssignmentPayload;
  status: "local-mock";
  alg: "HS256" | "RS256";
};

/** Resolve the explicit or environment-backed HMAC secret for local-mock flows. */
export function resolveLtiSecret(
  explicit?: string | null,
  env?: NodeJS.ProcessEnv,
): string;

/** Generate an ephemeral RSA signing pair for an isolated lab. */
export function generateLabPlatformKeys(): {
  publicKey: string;
  privateKey: string;
};

/** Convert an RSA public key to the JWK shape served by the mock platform. */
export function publicKeyToJwk(
  publicKeyPem: string,
  kid?: string,
): Record<string, unknown>;

/** Export an RSA public key as an LTI platform JWKS document. */
export function exportPlatformJwks(
  publicKeyPem: string,
  kid?: string,
): { keys: Record<string, unknown>[] };

/** Sign arbitrary local-mock JWT claims with HS256. */
export function signHs256Jwt(
  payload: Record<string, unknown>,
  secret?: string,
): string;

/** Sign arbitrary local-mock JWT claims with RS256. */
export function signRs256Jwt(
  payload: Record<string, unknown>,
  privateKeyPem: string,
  kid?: string,
): string;

/** Verify an RS256 token without applying LTI claim semantics. */
export function verifyRs256Jwt(
  token: string,
  publicKeyPem: string,
): Record<string, unknown> | null;

/** Issue a local AGS client-credentials token, or null for invalid credentials. */
export function issueAgsServiceToken(
  opts?: {
    clientId?: string;
    clientSecret?: string;
    expectedClientSecret?: string;
    secret?: string;
    scope?: string;
    expiresIn?: number;
  },
): {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  status: "local-mock";
} | null;

/** Verify a Bearer AGS service token and its required score scope. */
export function verifyAgsServiceToken(
  tokenOrHeader: string | undefined | null,
  secret?: string,
): Record<string, unknown> | null;

/** Authorize and process a local-mock AGS score submission. */
export function processAgsScoreWithServiceToken(
  grade: AgsGrade,
  authHeader: string | undefined | null,
  secret?: string,
): 
  | { ok: false; error: "invalid_service_token" }
  | { ok: false; error: "invalid_grade" }
  | { ok: true; result: Record<string, unknown>; tokenSub: unknown };

/** Parameter names accepted by LTI third-party login initiation. */
export const OIDC_LOGIN_INITIATION_PARAM_NAMES: {
  readonly required: readonly string[];
  readonly optional: readonly string[];
};

/** Parse and validate LTI third-party login initiation parameters. */
export function parseOidcLoginInitiation(
  input: Record<string, unknown> | URLSearchParams | string | null | undefined,
): {
  ok: boolean;
  errors?: string;
  params: Record<string, string>;
  status: "local-mock";
};

/** Build the platform authorization redirect for a validated initiation. */
export function buildOidcAuthorizationRedirect(
  initiation: {
    ok: boolean;
    params?: Record<string, string>;
    errors?: string;
  },
  opts?: {
    platformAuthUrl?: string;
    redirectUri?: string;
    state?: string;
    nonce?: string;
  },
): {
  ok: boolean;
  error?: string;
  status: "local-mock";
  url?: string;
  params?: Record<string, string>;
};

/** Validate OIDC initiation input and build the platform authorization redirect. */
export function processOidcLoginInitiation(
  input: Record<string, unknown> | URLSearchParams | string | null | undefined,
  opts?: {
    platformAuthUrl?: string;
    expectedClientId?: string;
    expectedIssuer?: string;
    /** Registered tool redirect URI used in the authorization request. */
    redirectUri?: string;
    /** Registered target-link URI required from the platform initiation. */
    expectedTargetLinkUri?: string;
  },
): { ok: boolean; error?: string; [key: string]: unknown };

/** Resolve configured lab RSA keys, returning null for the HS256-only path. */
export function resolveLabRsaKeys(
  env?: NodeJS.ProcessEnv,
): { privateKeyPem: string; publicKeyPem: string; kid: string } | null;

/** Produce the bounded local-mock AGS passback result used by demo routes. */
export function simulateAgsScorePassback(
  grade: AgsGrade,
): Record<string, unknown>;

/** Grade fields accepted by the local AGS simulator. */
export interface AgsGrade {
  recordId: string;
  userId: string;
  activityProgress?: string;
  gradingProgress?: string;
  scoreGiven?: number;
  scoreMaximum?: number;
}

/** Verify an HS256 or RS256 LTI JWT and return its claims. */
export function verifyLtiJwt(
  token: string,
  opts?: {
    secret?: string;
    publicKeyPem?: string;
    algorithm?: "HS256" | "RS256";
    issuer?: string;
    audience?: string;
    deploymentId?: string;
    nonce?: string;
    nowSeconds?: number;
    clockToleranceSeconds?: number;
  },
): Record<string, unknown> | null;

/** Verify a local-mock HS256 JWT without applying LTI claim semantics. */
export function verifyHs256Jwt(
  token: string,
  secret?: string,
): Record<string, unknown> | null;
