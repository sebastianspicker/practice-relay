/**
 * LTI protocol-orchestration request routes for the mock platform.
 * Why: JWKS, OIDC, launch, and AGS flows share tool-registration lookup without owning dispatch.
 */
import {
  MOCK_PLATFORM_BANNER,
  buildMockOidcLoginInitiation,
  demoScoreForMockLaunch,
  issueMockAgsClientCredentials,
  issueMockPlatformLaunch,
} from "./platform.mjs";
import { resolveLtiSecret } from "../../lti/src/index.mjs";
import { apiFetch, matches, readJson, sendJson } from "./request-http.mjs";

function toolRegistration(context) {
  return /** @type {Record<string, string>} */ (context.registry.get().tool ?? {});
}

function platformRegistration(context) {
  return /** @type {Record<string, string>} */ (
    context.registry.get().platform ?? {}
  );
}

function localPath(apiBase, configuredUrl, fallback) {
  const path = (configuredUrl ?? fallback).replace(apiBase, "");
  return path.startsWith("http") ? new URL(configuredUrl).pathname : path;
}

async function handleJwks(context) {
  if (!matches(context, "/api/jwks", "GET")) return false;
  const tool = toolRegistration(context);
  const jwksUrl = tool.jwksUrl ?? `${context.apiBase}/lti/jwks`;
  const result = await apiFetch(
    context,
    localPath(context.apiBase, jwksUrl, `${context.apiBase}/lti/jwks`),
  );
  sendJson(context.res, 200, {
    banner: MOCK_PLATFORM_BANNER,
    fetchedFrom: result.url,
    status: result.status,
    jwks: result.json,
  });
  return true;
}

async function handleOidcInit(context) {
  if (!matches(context, "/api/oidc-init", "POST")) return false;
  const body = await readJson(context);
  const init = buildMockOidcLoginInitiation({
    loginHint: body.loginHint ?? body.userId,
    ltiMessageHint: body.ltiMessageHint,
  });
  const tool = toolRegistration(context);
  const loginPath = localPath(
    context.apiBase,
    tool.oidcLoginInitiationUrl,
    `${context.apiBase}/lti/login`,
  );
  const qs = new URLSearchParams(
    /** @type {Record<string, string>} */ (init.params),
  ).toString();
  const result = await apiFetch(context, `${loginPath}?${qs}`);
  sendJson(context.res, 200, {
    banner: MOCK_PLATFORM_BANNER,
    initiation: init,
    toolResponse: { status: result.status, body: result.json, url: result.url },
  });
  return true;
}

async function handleLaunch(context) {
  if (!matches(context, "/api/launch", "POST")) return false;
  const body = await readJson(context);
  const tool = toolRegistration(context);
  const platform = platformRegistration(context);
  const score = body.score ?? demoScoreForMockLaunch();
  const secret = resolveLtiSecret(body.secret ?? process.env.PRACTICE_RELAY_LTI_SECRET);
  const initiation = buildMockOidcLoginInitiation({
    loginHint: body.userId ?? "faculty-ada",
    targetLinkUri: tool.targetLinkUri,
    clientId: tool.clientId,
    deploymentId: tool.deploymentId,
    iss: platform.issuer,
  });
  const loginPath = localPath(
    context.apiBase,
    tool.oidcLoginInitiationUrl,
    `${context.apiBase}/lti/login`,
  );
  const login = await apiFetch(
    context,
    `${loginPath}?${new URLSearchParams(initiation.params).toString()}`,
  );
  const oidcParams = login.json?.authorizationRedirect?.params;
  if (login.status !== 200 || !oidcParams?.state || !oidcParams?.nonce) {
    sendJson(context.res, 400, {
      ok: false,
      banner: MOCK_PLATFORM_BANNER,
      error: "tool rejected OIDC login initiation",
      toolLogin: login,
    });
    return true;
  }
  const issued = issueMockPlatformLaunch(score, {
    userId: body.userId ?? "faculty-ada",
    secret,
    deploymentId: tool.deploymentId,
    platformIss: platform.issuer,
    nonce: oidcParams.nonce,
  });
  if (!issued.validation.ok) {
    sendJson(context.res, 400, {
      ok: false,
      banner: MOCK_PLATFORM_BANNER,
      error: "assignment validation failed",
      validation: issued.validation,
    });
    return true;
  }
  const accepted = await apiFetch(
    context,
    localPath(context.apiBase, tool.targetLinkUri, `${context.apiBase}/lti/launch`),
    {
      method: "POST",
      body: { id_token: issued.idToken, state: oidcParams.state },
    },
  );
  const acceptedOk = accepted.status === 200 && accepted.json?.ok === true;
  sendJson(context.res, acceptedOk ? 200 : 502, {
    ok: acceptedOk,
    banner: MOCK_PLATFORM_BANNER,
    issued: {
      alg: issued.alg,
      assignment: issued.assignment,
      singleVideoUrl: issued.assignment?.singleVideoUrl ?? null,
      validation: issued.validation,
    },
    toolAccept: { status: accepted.status, body: accepted.json, url: accepted.url },
  });
  return true;
}

async function handleAgsScore(context) {
  if (!matches(context, "/api/ags-score", "POST")) return false;
  const body = await readJson(context);
  const secret = resolveLtiSecret(body.secret ?? process.env.PRACTICE_RELAY_LTI_SECRET);
  const issued = issueMockAgsClientCredentials({ secret });
  const tool = toolRegistration(context);
  const tokenRes = await apiFetch(
    context,
    localPath(context.apiBase, tool.agsTokenUrl, `${context.apiBase}/lti/oauth/token`),
    {
      method: "POST",
      body: {
        grant_type: "client_credentials",
        client_id: tool.clientId ?? "practice-relay-tool",
        client_secret: process.env.PRACTICE_RELAY_LTI_CLIENT_SECRET ?? secret,
        scope: issued.token?.scope,
      },
    },
  );
  const access = tokenRes.status === 200 ? tokenRes.json?.access_token : undefined;
  if (typeof access !== "string" || !access) {
    sendJson(context.res, 502, {
      ok: false,
      banner: MOCK_PLATFORM_BANNER,
      error: "tool token endpoint rejected client credentials",
      tokenRes,
    });
    return true;
  }
  const scoreRes = await apiFetch(
    context,
    localPath(context.apiBase, tool.agsScoreUrl, `${context.apiBase}/lti/ags/scores`),
    {
      method: "POST",
      headers: { authorization: `Bearer ${access}` },
      body: {
        recordId: body.recordId ?? "ps-mock-platform-demo",
        userId: body.userId ?? "student-lee",
        scoreGiven: body.scoreGiven ?? 1,
        scoreMaximum: body.scoreMaximum ?? 1,
      },
    },
  );
  const scoreOk = scoreRes.status === 200 && scoreRes.json?.ok === true;
  sendJson(context.res, scoreOk ? 200 : 502, {
    ok: scoreOk,
    banner: MOCK_PLATFORM_BANNER,
    token: { status: tokenRes.status, token_type: tokenRes.json?.token_type },
    score: { status: scoreRes.status, body: scoreRes.json },
  });
  return true;
}

export const ltiRoutes = [handleJwks, handleOidcInit, handleLaunch, handleAgsScore];
