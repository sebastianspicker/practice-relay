/**
 * Static and registration request routes for the LTI mock platform.
 * Why: local files and registration mutation stay apart from LTI tool orchestration.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MOCK_PLATFORM_BANNER,
  MOCK_PLATFORM_STATUS,
  loadDeploymentRegistration,
} from "./platform.mjs";
import { matches, readJson, sendHtml, sendJson } from "./request-http.mjs";
import { renderUi } from "./ui.mjs";

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

/** Return the mock platform's documented local-lab authorization endpoint. */
export async function handlePlatformAuth(context) {
  if (!matches(context, "/platform/auth", "GET")) return false;
  sendJson(context.res, 200, {
    banner: MOCK_PLATFORM_BANNER,
    note: "Mock platform OIDC auth endpoint - lab only. Use POST /api/launch for id_token form_post simulation.",
    query: Object.fromEntries(context.url.searchParams.entries()),
  });
  return true;
}

export const staticRoutes = [
  handleHome,
  handleHealth,
  handleRegistration,
  handleFixture,
  handleRegister,
];
