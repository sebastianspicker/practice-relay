/**
 * LTI mock-platform request routes.
 * Why: each local-lab route owns its protocol flow while the server retains one registry and listener.
 */
import { MOCK_PLATFORM_BANNER } from "./platform.mjs";
import { MockRequestError, sendJson } from "./request-http.mjs";
import { ltiRoutes } from "./request-lti-routes.mjs";
import { handlePlatformAuth, staticRoutes } from "./request-static-routes.mjs";

const routes = [...staticRoutes, ...ltiRoutes, handlePlatformAuth];

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
