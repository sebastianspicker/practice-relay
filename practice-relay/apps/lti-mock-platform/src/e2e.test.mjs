/**
 * End-to-end: MOCK PLATFORM - not Canvas
 * mock platform → get JWKS → issue/accept launch → AGS score with Bearer
 *
 * Uses the Practice Relay API handleRequest (no live ports) + @practice-relay/lti helpers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { handleRequest } from "../../api/src/index.ts";
import { mockRes } from "../../api/src/test-support/http-mocks.ts";
import {
  MOCK_PLATFORM_BANNER,
  createToolRegistry,
  demoScoreForMockLaunch,
  issueMockPlatformLaunch,
  buildMockOidcLoginInitiation,
  issueMockAgsClientCredentials,
  loadDeploymentRegistration,
  completeMockPlatformAuth,
} from "./platform.mjs";
import {
  parseOidcLoginInitiation,
  validateMultiAssetAssignmentPayload,
  resolveLtiSecret,
  LTI_STATUS,
} from "../../lti/src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const parseResponseBody = (body) => {
  if (!body) return null;
  return JSON["parse"](body);
};

function mockReq(url, method = "GET", body, headers) {
  const data = body !== undefined ? JSON.stringify(body) : "";
  const stream = new Readable({
    read() {
      if (data) this.push(data);
      this.push(null);
    },
  });
  const req = stream;
  req.url = url;
  req.method = method;
  req.headers = { ...(headers ?? {}) };
  return req;
}

async function api(path, method = "GET", body, headers) {
  const res = mockRes();
  await handleRequest(mockReq(path, method, body, headers), res);
  return {
    status: res.statusCode,
    json: parseResponseBody(res.body),
  };
}

function readPreflightFixture(name) {
  const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
  return JSON["parse"](readFileSync(join(fixturesDir, name), "utf8"));
}

function assertCanvasPreflightFixture(canvas) {
  assert.equal(canvas.status, "not-production");
  assert.equal(canvas.preflight, true);
  assert.equal(canvas.lms, "canvas");
  assert.ok(canvas.tool.target_link_uri.includes("/lti/launch"));
  assert.ok(canvas.tool.openid_connect_initiation_url.includes("/lti/login"));
  assert.ok(canvas.tool.public_jwk_url.includes("/lti/jwks"));
  assert.ok(Array.isArray(canvas.tool.redirect_uris));
  assert.ok(
    canvas.extensions.assignment_and_grade_services.scopes.some((scope) =>
      scope.includes("lti-ags/scope/score"),
    ),
  );
  assert.equal(canvas.assignmentContract.singleVideoUrl, null);
  assert.match(String(canvas.disclaimer), /not-production|PREFLIGHT|not Canvas/i);
}

function assertMoodlePreflightFixture(moodle) {
  assert.equal(moodle.status, "not-production");
  assert.equal(moodle.preflight, true);
  assert.equal(moodle.lms, "moodle");
  assert.ok(moodle.tool.tool_url.includes("/lti/launch"));
  assert.ok(moodle.tool.initiate_login_url.includes("/lti/login"));
  assert.ok(moodle.tool.public_keyset_url.includes("/lti/jwks"));
  assert.ok(Array.isArray(moodle.tool.redirection_uris));
  assert.ok(
    moodle.services.ims_lti_assignment_and_grade_services.scopes.some((scope) =>
      scope.includes("lti-ags/scope/lineitem"),
    ),
  );
  assert.equal(moodle.assignmentContract.singleVideoUrl, null);
  assert.match(String(moodle.disclaimer), /not-production|PREFLIGHT|not Canvas/i);
}

test("deployment registration fixture is multi-asset local-mock", () => {
  const reg = loadDeploymentRegistration();
  assert.equal(reg.status, "local-mock");
  assert.match(String(reg.disclaimer), /MOCK PLATFORM - not Canvas/i);
  assert.equal(reg.assignmentContract.singleVideoUrl, null);
  assert.equal(reg.assignmentContract.assetMode, "multi-asset");
  assert.ok(reg.tool.clientId);
  assert.ok(reg.tool.oidcLoginInitiationUrl.includes("/lti/login"));
  assert.ok(reg.oidcLoginInitiationParameters.required.iss);
  assert.ok(reg.oidcLoginInitiationParameters.required.login_hint);
  assert.ok(reg.oidcLoginInitiationParameters.required.target_link_uri);
  assert.ok(reg.oidcLoginInitiationParameters.required.client_id);
  assert.ok(reg.oidcLoginInitiationParameters.required.lti_deployment_id);
});

test("Canvas and Moodle tool config fixtures are preflight not-production", () => {
  assertCanvasPreflightFixture(readPreflightFixture("canvas-tool-config.json"));
  assertMoodlePreflightFixture(readPreflightFixture("moodle-tool-config.json"));
});

test("tool registry register/update keeps mock banner", () => {
  const reg = createToolRegistry();
  assert.match(reg.banner, /MOCK PLATFORM - not Canvas/);
  const saved = reg.register({
    tool: { clientId: "practice-relay-tool-custom" },
  });
  assert.equal(saved.tool.clientId, "practice-relay-tool-custom");
  assert.equal(saved.status, "local-mock");
});

test("E2E: JWKS → launch issue/accept → AGS Bearer score", async () => {
  // 1) Platform fetches tool JWKS
  const jwks = await api("/lti/jwks");
  assert.equal(jwks.status, 200);
  assert.ok(Array.isArray(jwks.json.keys));

  // 2) OIDC initiation binds the one-time launch state and nonce.
  const score = demoScoreForMockLaunch();
  const init = buildMockOidcLoginInitiation({ loginHint: "faculty-ada" });
  const login = await api(
    `/lti/login?${new URLSearchParams(init.params).toString()}`,
  );
  assert.equal(login.status, 200);
  const oidc = login.json.authorizationRedirect.params;

  // 3) Mock platform issues a multi-asset launch id_token for that nonce.
  const issued = issueMockPlatformLaunch(score, {
    userId: "faculty-ada",
    nonce: oidc.nonce,
  });
  assert.equal(issued.banner, MOCK_PLATFORM_BANNER);
  assert.equal(issued.status, LTI_STATUS);
  assert.equal(issued.assignment.singleVideoUrl, null);
  assert.equal(issued.assignment.assetMode, "multi-asset");
  assert.equal(issued.validation.ok, true);
  assert.ok(issued.assignment.trackTypes.length >= 2);

  // 4) Tool accepts the one-time state, then rejects replay.
  const accepted = await api("/lti/launch", "POST", {
    id_token: issued.idToken,
    state: oidc.state,
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.ok, true);
  assert.equal(accepted.json.ltiStatus, "local-mock");
  assert.equal(accepted.json.sub, "faculty-ada");
  assert.ok(accepted.json.assignment);
  assert.equal(accepted.json.assignment.singleVideoUrl, null);
  assert.equal(accepted.json.assignment.assetMode, "multi-asset");
  const v = validateMultiAssetAssignmentPayload(accepted.json.assignment);
  assert.equal(v.ok, true, v.errors);
  const replay = await api("/lti/launch", "POST", {
    id_token: issued.idToken,
    state: oidc.state,
  });
  assert.equal(replay.status, 400);

  // 5) AGS client credentials + Bearer score
  const tokenRes = await api("/lti/oauth/token", "POST", {
    grant_type: "client_credentials",
    client_id: "practice-relay-tool",
    client_secret: resolveLtiSecret(),
  });
  assert.equal(tokenRes.status, 200);
  assert.equal(tokenRes.json.token_type, "Bearer");
  assert.ok(tokenRes.json.access_token);

  const scoreRes = await api(
    "/lti/ags/scores",
    "POST",
    {
      recordId: score.id,
      userId: "student-lee",
      scoreGiven: 1,
    },
    { authorization: `Bearer ${tokenRes.json.access_token}` },
  );
  assert.equal(scoreRes.status, 200);
  assert.equal(scoreRes.json.ok, true);
  assert.equal(scoreRes.json.result.kind, "ags-score-result");
  assert.equal(scoreRes.json.result.status, "local-mock");

  // Deny without Bearer
  const denied = await api("/lti/ags/scores", "POST", {
    recordId: score.id,
    userId: "student-lee",
  });
  assert.equal(denied.status, 401);
});

test("OIDC login initiation params documented + tool endpoint accepts them", async () => {
  const init = buildMockOidcLoginInitiation({ loginHint: "faculty-ada" });
  assert.equal(init.parsed.ok, true, init.parsed.errors);
  assert.equal(init.banner, MOCK_PLATFORM_BANNER);

  const qs = new URLSearchParams(init.params).toString();
  const login = await api(`/lti/login?${qs}`);
  assert.equal(login.status, 200);
  assert.equal(login.json.ok, true);
  assert.equal(login.json.status, "local-mock");
  assert.equal(login.json.step, "redirect_to_platform_auth");
  assert.ok(login.json.authorizationRedirect?.url);
  assert.equal(login.json.authorizationRedirect.params.response_type, "id_token");
  assert.equal(login.json.authorizationRedirect.params.scope, "openid");
  assert.ok(login.json.authorizationRedirect.params.nonce);
  assert.ok(login.json.authorizationRedirect.params.state);

  // Missing required param fails
  const bad = parseOidcLoginInitiation({ iss: "https://x" });
  assert.equal(bad.ok, false);

  const score = demoScoreForMockLaunch();
  const completed = completeMockPlatformAuth(init.parsed, score);
  assert.equal(completed.ok, true);
  assert.equal(
    completed.authorizationRedirect.params.redirect_uri,
    init.params.target_link_uri,
  );
  assert.equal(completed.assignment.singleVideoUrl, null);
  assert.ok(completed.formPost.id_token);
});

test("issueMockAgsClientCredentials returns Bearer-shaped token", () => {
  const issued = issueMockAgsClientCredentials();
  assert.equal(issued.banner, MOCK_PLATFORM_BANNER);
  assert.ok(issued.token?.access_token);
  assert.equal(issued.token.token_type, "Bearer");
});

test("faculty template path still multi-asset with null singleVideoUrl", () => {
  const seed = JSON["parse"](
    readFileSync(
      join(root, "fixtures/faculty-multi-asset-template.json"),
      "utf8",
    ),
  );
  const score = {
    id: seed.id,
    title: seed.title,
    tracks: seed.tracks,
    takes: seed.takes,
    preferredTakeId: seed.preferredTakeId,
    consents: [{ purposes: seed.consentPurposes, exportAllowed: true }],
  };
  const issued = issueMockPlatformLaunch(score);
  assert.equal(issued.assignment.singleVideoUrl, null);
  assert.equal(issued.validation.ok, true);
  assert.ok(issued.assignment.trackTypes.length >= 2);
});
