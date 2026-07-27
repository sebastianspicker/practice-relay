/**
 * LTI 1.3 local-mock routes for the Practice Relay lab API.
 * Why: OIDC state, signing material, and AGS authorization stay on one injected runtime boundary.
 */
import { randomUUID } from "node:crypto";
import {
  buildLtiResourceLinkLaunch,
  exportPlatformJwks,
  issueAgsServiceToken,
  processAgsScoreWithServiceToken,
  processOidcLoginInitiation,
  simulateAgsScorePassback,
  verifyAgsServiceToken,
  verifyLtiJwt,
  AGS_SCORE_SCOPE,
  LTI_DEFAULT_LAUNCH_URL,
  LTI_STATUS,
} from "../../lti/src/index.mjs";
import { requireMutationAccess } from "./access.ts";
import { queryOf, readJson, sendJson, sendProblem } from "./api-http.ts";
import {
  consumePendingLtiLaunch,
  registerPendingLtiLaunch,
} from "./lti-state.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { attemptRequestValue } from "./request-errors.ts";
import type { RecordRouteParams } from "./record-route-types.ts";
import type { PendingLtiLaunch } from "./runtime.ts";

function configuredLtiLaunchUrl(): string {
  return (
    process.env.PRACTICE_RELAY_LTI_LAUNCH_URL?.trim() || LTI_DEFAULT_LAUNCH_URL
  );
}

async function handleOidcLogin(ctx: RequestContext): Promise<void> {
  const fromQuery: Record<string, string> = {};
  for (const [key, value] of queryOf(ctx.req).entries()) {
    fromQuery[key] = value;
  }
  let body: Record<string, unknown> = {};
  if (ctx.method === "POST") {
    body = await readJson<Record<string, unknown>>(ctx.req);
  }
  const merged = { ...fromQuery, ...body };
  const platformAuthUrl =
    process.env.PRACTICE_RELAY_LTI_PLATFORM_AUTH_URL?.trim() ||
    "http://localhost:8790/platform/auth";
  const launchUrl = configuredLtiLaunchUrl();
  const result = processOidcLoginInitiation(merged, {
    platformAuthUrl,
    redirectUri: launchUrl,
    expectedTargetLinkUri: launchUrl,
    expectedClientId:
      process.env.PRACTICE_RELAY_LTI_CLIENT_ID?.trim() || "practice-relay-tool",
    expectedIssuer:
      process.env.PRACTICE_RELAY_LTI_PLATFORM_ISS?.trim() ||
      "https://practice-relay.local/mock-platform",
  });
  if (!result.ok) {
    sendProblem(
      ctx.res,
      400,
      "Bad Request",
      result.error ?? "invalid OIDC login initiation",
    );
    return;
  }
  const oidc = result as unknown as {
    received: Record<string, string>;
    authorizationRedirect: { params?: Record<string, string> };
  };
  const state = oidc.authorizationRedirect.params?.state;
  const nonce = oidc.authorizationRedirect.params?.nonce;
  if (!state || !nonce) {
    sendProblem(
      ctx.res,
      500,
      "Internal Server Error",
      "OIDC authorization redirect omitted state or nonce",
    );
    return;
  }
  registerPendingLtiLaunch(ctx.runtime, state, {
    nonce,
    issuer: oidc.received.iss,
    audience: oidc.received.client_id,
    deploymentId: oidc.received.lti_deployment_id,
  });
  sendJson(ctx.res, 200, result);
}

function handleJwks(ctx: RequestContext): void {
  const keys = ctx.runtime.labRsaKeys;
  if (!keys) {
    sendJson(ctx.res, 200, {
      keys: [],
      note: "No RSA keys; HS256 PRACTICE_RELAY_LTI_SECRET path active. Set PRACTICE_RELAY_LTI_KEYS_DIR or PRACTICE_RELAY_LTI_RSA_* for RS256.",
    });
    return;
  }
  sendJson(
    ctx.res,
    200,
    exportPlatformJwks(keys.publicKeyPem, keys.kid),
  );
}

async function handleServiceToken(ctx: RequestContext): Promise<void> {
  const body = await readJson<{
    grant_type?: string;
    client_id?: string;
    client_secret?: string;
    scope?: string;
  }>(ctx.req);
  if (body.grant_type !== "client_credentials") {
    sendProblem(
      ctx.res,
      400,
      "Bad Request",
      "only client_credentials grant supported (local-mock)",
    );
    return;
  }
  const opsSecrets = ctx.runtime.opsSecrets;
  const expectedClientId =
    process.env.PRACTICE_RELAY_LTI_CLIENT_ID?.trim() || "practice-relay-tool";
  if (body.client_id !== expectedClientId) {
    sendProblem(ctx.res, 401, "Unauthorized", "invalid client credentials");
    return;
  }
  let requestedScope: string | undefined;
  if (body.scope !== undefined) {
    const requestedScopes =
      typeof body.scope === "string"
        ? body.scope.trim().split(/\s+/).filter(Boolean)
        : [];
    if (
      requestedScopes.length !== 1 ||
      requestedScopes[0] !== AGS_SCORE_SCOPE
    ) {
      sendProblem(ctx.res, 400, "Bad Request", "unsupported AGS scope");
      return;
    }
    requestedScope = requestedScopes[0];
  }
  const token = issueAgsServiceToken({
    clientId: body.client_id,
    clientSecret: body.client_secret,
    expectedClientSecret:
      process.env.PRACTICE_RELAY_LTI_CLIENT_SECRET ?? opsSecrets.ltiSecret,
    secret: opsSecrets.ltiSecret,
    scope: requestedScope,
  });
  if (!token) {
    sendProblem(ctx.res, 401, "Unauthorized", "invalid client credentials");
    return;
  }
  sendJson(ctx.res, 200, token);
}

async function handleAgsScore(ctx: RequestContext): Promise<void> {
  const authz =
    typeof ctx.req.headers?.authorization === "string"
      ? ctx.req.headers.authorization
      : undefined;
  if (!verifyAgsServiceToken(authz, ctx.runtime.opsSecrets.ltiSecret)) {
    sendProblem(ctx.res, 401, "Unauthorized", "invalid AGS service token");
    return;
  }
  const body = await readJson<{
    recordId?: string;
    userId?: string;
    scoreGiven?: number;
    scoreMaximum?: number;
    activityProgress?: string;
    gradingProgress?: string;
  }>(ctx.req);
  if (!body.recordId || !body.userId) {
    sendProblem(ctx.res, 400, "Bad Request", "recordId and userId required");
    return;
  }
  const processed = processAgsScoreWithServiceToken(
    {
      recordId: body.recordId,
      userId: body.userId,
      scoreGiven: body.scoreGiven,
      scoreMaximum: body.scoreMaximum,
      activityProgress: body.activityProgress,
      gradingProgress: body.gradingProgress,
    },
    authz,
    ctx.runtime.opsSecrets.ltiSecret,
  );
  if (!processed.ok) {
    if (processed.error === "invalid_grade") {
      sendProblem(ctx.res, 400, "Bad Request", "invalid AGS grade payload");
    } else {
      sendProblem(ctx.res, 401, "Unauthorized", "invalid AGS service token");
    }
    return;
  }
  sendJson(ctx.res, 200, processed);
}

function verifyLaunchClaims(
  ctx: RequestContext,
  token: string | undefined,
  pending: PendingLtiLaunch,
): Record<string, unknown> | null {
  if (!token) return null;
  const keys = ctx.runtime.labRsaKeys;
  const opsSecrets = ctx.runtime.opsSecrets;
  return verifyLtiJwt(token, {
    secret: opsSecrets.ltiSecret,
    publicKeyPem: keys?.publicKeyPem,
    algorithm: keys ? "RS256" : "HS256",
    issuer: pending.issuer,
    audience: pending.audience,
    deploymentId: pending.deploymentId,
    nonce: pending.nonce,
  });
}

function launchAssignment(claims: Record<string, unknown>): unknown {
  const custom = claims[
    "https://purl.imsglobal.org/spec/lti/claim/custom"
  ] as Record<string, string> | undefined;
  const encoded = custom?.practice_relay_assignment;
  if (!encoded) return null;
  try {
    return JSON.parse(encoded);
  } catch {
    return null;
  }
}

async function handleLaunch(ctx: RequestContext): Promise<void> {
  const body = await readJson<{
    id_token?: string;
    idToken?: string;
    state?: string;
  }>(ctx.req);
  const pending = body.state
    ? consumePendingLtiLaunch(ctx.runtime, body.state)
    : undefined;
  if (!pending) {
    sendProblem(ctx.res, 400, "Bad Request", "invalid or expired OIDC state");
    return;
  }
  const claims = verifyLaunchClaims(ctx, body.id_token ?? body.idToken, pending);
  if (!claims) {
    sendProblem(ctx.res, 400, "Bad Request", "invalid id_token");
    return;
  }
  sendJson(ctx.res, 200, {
    ok: true,
    ltiStatus: LTI_STATUS,
    sub: claims.sub,
    assignment: launchAssignment(claims),
  });
}

type LtiRouteHandler = (ctx: RequestContext) => void | Promise<void>;

const ltiRouteHandlers: Readonly<Record<string, LtiRouteHandler>> = {
  "GET /lti/login": handleOidcLogin,
  "POST /lti/login": handleOidcLogin,
  "GET /lti/jwks": handleJwks,
  "POST /lti/oauth/token": handleServiceToken,
  "POST /lti/ags/scores": handleAgsScore,
  "POST /lti/launch": handleLaunch,
};

/** Handle top-level LTI OIDC, JWKS, token, AGS, and launch endpoints. */
export async function handleLtiRoutes(
  ctx: RequestContext,
): Promise<RouteResult> {
  const handler = ltiRouteHandlers[`${ctx.method} ${ctx.pathname}`];
  if (!handler) return "unmatched";
  await handler(ctx);
  return "handled";
}

/** Handle the LTI action for an already parsed generic record route. */
export async function handleRecordLtiRoute(
  ctx: RequestContext,
  params: RecordRouteParams,
): Promise<RouteResult> {
  if (params.action !== "lti" || ctx.method !== "POST") {
    return "unmatched";
  }
  const access = requireMutationAccess(ctx, params.recordId, "lti");
  if (!access) return "handled";
  const { actorUserId: actor, record } = access;
  const body = await readJson<{ mode?: string }>(ctx.req);
  if (body.mode === "ags") {
    sendJson(
      ctx.res,
      200,
      simulateAgsScorePassback({ recordId: record.id, userId: actor }),
    );
    return "handled";
  }
  const keys = ctx.runtime.labRsaKeys;
  const opsSecrets = ctx.runtime.opsSecrets;
  const launchResult = attemptRequestValue(ctx.res, () =>
    buildLtiResourceLinkLaunch(record, {
      userId: actor,
      targetLinkUri: configuredLtiLaunchUrl(),
      secret: opsSecrets.ltiSecret,
      privateKeyPem: keys?.privateKeyPem,
      kid: keys?.kid,
      nonce: randomUUID(),
    }),
  );
  if (!launchResult.ok) return "handled";
  const launch = launchResult.value;
  const state = randomUUID();
  const claims = launch.claims as Record<string, unknown>;
  registerPendingLtiLaunch(ctx.runtime, state, {
    nonce: String(claims.nonce),
    issuer: String(claims.iss),
    audience: Array.isArray(claims.aud)
      ? String(claims.aud[0])
      : String(claims.aud),
    deploymentId: String(
      claims["https://purl.imsglobal.org/spec/lti/claim/deployment_id"],
    ),
  });
  sendJson(ctx.res, 200, {
    ...launch,
    state,
    assignment: launch.assignment,
  });
  return "handled";
}
