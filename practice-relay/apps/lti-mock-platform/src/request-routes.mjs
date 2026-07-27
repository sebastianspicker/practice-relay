/**
 * LTI mock-platform request routes.
 * Why: each local-lab route owns its protocol flow while the server retains one registry and listener.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MOCK_PLATFORM_BANNER,
  MOCK_PLATFORM_STATUS,
  buildMockOidcLoginInitiation,
  demoScoreForMockLaunch,
  issueMockAgsClientCredentials,
  issueMockPlatformLaunch,
  loadDeploymentRegistration,
} from "./platform.mjs";
import { resolveLtiSecret } from "../../lti/src/index.mjs";
import { renderUi } from "./ui.mjs";

const MAX_JSON_BODY_BYTES = 1024 * 1024;
const API_FETCH_TIMEOUT_MS = 15_000;

class MockRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "MockRequestError";
    this.status = status;
  }
}

function sendJson(res, code, body) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-mock-platform": MOCK_PLATFORM_BANNER,
  });
  res.end(data);
}

function sendHtml(res, code, html) {
  res.writeHead(code, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-mock-platform": MOCK_PLATFORM_BANNER,
  });
  res.end(html);
}

function rejectOversizedDeclaredJsonBody(req) {
  const declared = Number(req.headers?.["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_JSON_BODY_BYTES) {
    req.resume();
    throw new MockRequestError(413, "request body too large");
  }
}

async function collectJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    total += bytes.byteLength;
    if (total > MAX_JSON_BODY_BYTES) {
      req.resume();
      throw new MockRequestError(413, "request body too large");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJsonObject(raw) {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new MockRequestError(400, "JSON body must be an object");
    }
    return parsed;
  } catch (err) {
    if (err instanceof MockRequestError) throw err;
    throw new MockRequestError(400, "invalid JSON");
  }
}

async function readJson({ req }) {
  rejectOversizedDeclaredJsonBody(req);
  return parseJsonObject(await collectJsonBody(req));
}

async function apiFetch({ apiBase, fetchImpl }, path, opts = {}) {
  const url = `${apiBase}${path}`;
  const requestFetch = fetchImpl ?? globalThis.fetch;
  const res = await requestFetch(url, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(opts.headers ?? {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(API_FETCH_TIMEOUT_MS),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, url };
}

function matches(context, path, method) {
  return context.path === path && context.method === method;
}

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

async function handleHome(context) {
  if (!matches(context, "/", "GET")) return false;
  sendHtml(
    context.res,
    200,
    renderUi({
      registry: context.registry,
      apiBase: context.apiBase,
      banner: MOCK_PLATFORM_BANNER,
      status: MOCK_PLATFORM_STATUS,
    }),
  );
  return true;
}

async function handleHealth(context) {
  if (!matches(context, "/health", "GET")) return false;
  sendJson(context.res, 200, {
    ok: true,
    service: "lti-mock-platform",
    banner: MOCK_PLATFORM_BANNER,
    status: MOCK_PLATFORM_STATUS,
    practiceRelayApiBase: context.apiBase,
    notCanvas: true,
    notImsCertified: true,
  });
  return true;
}

async function handleRegistration(context) {
  if (!matches(context, "/api/registration", "GET")) return false;
  sendJson(context.res, 200, {
    banner: MOCK_PLATFORM_BANNER,
    registration: context.registry.get(),
    fixture: loadDeploymentRegistration(),
  });
  return true;
}

async function handleFixture(context) {
  const fixtureMatch = context.path.match(
    /^\/fixtures\/(deployment-registration|canvas-tool-config|moodle-tool-config)\.json$/,
  );
  if (!fixtureMatch || context.method !== "GET") return false;
  const name = fixtureMatch[1];
  const file = join(context.dirname, "..", "fixtures", `${name}.json`);
  const raw = readFileSync(file, "utf8");
  context.res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-disposition": `attachment; filename="${name}.json"`,
    "cache-control": "no-store",
    "x-mock-platform": MOCK_PLATFORM_BANNER,
  });
  context.res.end(raw);
  return true;
}

async function handleRegister(context) {
  if (!matches(context, "/api/register", "POST")) return false;
  const body = await readJson(context);
  const saved = context.registry.register({
    tool: body.tool ?? body,
    platform: body.platform,
  });
  sendJson(context.res, 200, {
    ok: true,
    banner: MOCK_PLATFORM_BANNER,
    registration: saved,
  });
  return true;
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
  const access =
    tokenRes.status === 200 ? tokenRes.json?.access_token : undefined;
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

async function handlePlatformAuth(context) {
  if (!matches(context, "/platform/auth", "GET")) return false;
  sendJson(context.res, 200, {
    banner: MOCK_PLATFORM_BANNER,
    note: "Mock platform OIDC auth endpoint - lab only. Use POST /api/launch for id_token form_post simulation.",
    query: Object.fromEntries(context.url.searchParams.entries()),
  });
  return true;
}

const routes = [
  handleHome,
  handleHealth,
  handleRegistration,
  handleFixture,
  handleRegister,
  handleJwks,
  handleOidcInit,
  handleLaunch,
  handleAgsScore,
  handlePlatformAuth,
];

function sendNotFound(context) {
  sendJson(context.res, 404, {
    ok: false,
    banner: MOCK_PLATFORM_BANNER,
    error: "not found",
    path: context.path,
  });
}

const GET_PATHS = new Set(["/", "/health", "/api/registration", "/api/jwks", "/platform/auth"]);
const POST_PATHS = new Set(["/api/register", "/api/oidc-init", "/api/launch", "/api/ags-score"]);
const FIXTURE_PATH = /^\/fixtures\/(deployment-registration|canvas-tool-config|moodle-tool-config)\.json$/;

function allowedMethods(path) {
  if (GET_PATHS.has(path) || FIXTURE_PATH.test(path)) {
    return ["GET"];
  }
  if (POST_PATHS.has(path)) {
    return ["POST"];
  }
  return null;
}

function sendMethodNotAllowed(context, methods) {
  const data = JSON.stringify(
    {
      ok: false,
      banner: MOCK_PLATFORM_BANNER,
      error: "method not allowed",
      path: context.path,
    },
    null,
    2,
  );
  context.res.writeHead(405, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-mock-platform": MOCK_PLATFORM_BANNER,
    Allow: methods.join(", "),
  });
  context.res.end(data);
}

function sendRequestError(context, err) {
  const status = err instanceof MockRequestError ? err.status : 500;
  sendJson(context.res, status, {
    ok: false,
    banner: MOCK_PLATFORM_BANNER,
    error: err instanceof Error ? err.message : String(err),
    ...(status === 500
      ? { hint: "Is the Practice Relay API running at " + context.apiBase + "?" }
      : {}),
  });
}

/** Create the request dispatcher while keeping configuration and the registry server-owned. */
export function createMockRequestHandler(options) {
  return async function handleMockPlatformRequest(req, res) {
    try {
      let url;
      try {
        url = new URL(req.url ?? "/", `http://127.0.0.1:${options.port}`);
      } catch {
        throw new MockRequestError(400, "invalid request target");
      }
      const context = {
        ...options,
        req,
        res,
        url,
        path: url.pathname,
        method: (req.method ?? "GET").toUpperCase(),
      };
      const methods = allowedMethods(context.path);
      if (methods && !methods.includes(context.method)) {
        sendMethodNotAllowed(context, methods);
        return;
      }
      for (const route of routes) {
        if (await route(context)) return;
      }
      sendNotFound(context);
    } catch (err) {
      sendRequestError({ ...options, res }, err);
    } finally {
      if (!req.destroyed && !req.readableEnded) req.resume();
    }
  };
}
