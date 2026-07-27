/** LTI focused protocol tests. Why: keep protocol regressions independently runnable. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LTI_DEFAULT_LAUNCH_URL, parseOidcLoginInitiation, buildOidcAuthorizationRedirect, processOidcLoginInitiation, OIDC_LOGIN_INITIATION_PARAM_NAMES } from "./index.mjs";

test("OIDC login initiation params parse + authorization redirect", () => {
  assert.ok(OIDC_LOGIN_INITIATION_PARAM_NAMES.required.includes("iss"));
  assert.ok(OIDC_LOGIN_INITIATION_PARAM_NAMES.required.includes("login_hint"));
  assert.ok(
    OIDC_LOGIN_INITIATION_PARAM_NAMES.required.includes("target_link_uri"),
  );
  assert.ok(OIDC_LOGIN_INITIATION_PARAM_NAMES.required.includes("client_id"));
  assert.ok(
    OIDC_LOGIN_INITIATION_PARAM_NAMES.required.includes("lti_deployment_id"),
  );

  const missing = parseOidcLoginInitiation({ iss: "https://x" });
  assert.equal(missing.ok, false);

  const ok = parseOidcLoginInitiation({
    iss: "https://practice-relay.local/mock-platform",
    login_hint: "faculty-ada",
    target_link_uri: "http://localhost:8787/lti/launch",
    client_id: "practice-relay-tool",
    lti_deployment_id: "practice-relay-lab-deploy-1",
    lti_message_hint: "rl-1",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.status, "local-mock");

  const redirect = buildOidcAuthorizationRedirect(ok, {
    platformAuthUrl: "http://localhost:8790/platform/auth",
  });
  assert.equal(redirect.ok, true);
  assert.equal(redirect.params?.response_type, "id_token");
  assert.equal(redirect.params?.scope, "openid");
  assert.equal(redirect.params?.response_mode, "form_post");
  assert.match(String(redirect.url), /platform\/auth/);
  assert.equal(redirect.params?.redirect_uri, LTI_DEFAULT_LAUNCH_URL);

  const processed = processOidcLoginInitiation(ok.params, {
    expectedClientId: "practice-relay-tool",
  });
  assert.equal(processed.ok, true);
  assert.equal(processed.step, "redirect_to_platform_auth");

  const wrongClient = processOidcLoginInitiation(ok.params, {
    expectedClientId: "other-tool",
  });
  assert.equal(wrongClient.ok, false);
});

test("OIDC redirect uses registered URL and rejects attacker target-link override", () => {
  const malicious = parseOidcLoginInitiation({
    iss: "https://practice-relay.local/mock-platform",
    login_hint: "faculty-ada",
    target_link_uri: "https://attacker.example/collect",
    client_id: "practice-relay-tool",
    lti_deployment_id: "practice-relay-lab-deploy-1",
  });
  assert.equal(malicious.ok, true);

  const redirect = buildOidcAuthorizationRedirect(malicious, {
    platformAuthUrl: "http://localhost:8790/platform/auth",
  });
  assert.equal(redirect.ok, true);
  assert.equal(redirect.params?.redirect_uri, LTI_DEFAULT_LAUNCH_URL);

  const rejected = processOidcLoginInitiation(malicious.params, {
    expectedClientId: "practice-relay-tool",
  });
  assert.equal(rejected.ok, false);
  assert.match(String(rejected.error), /target_link_uri does not match tool registration/);

  const configured = processOidcLoginInitiation(
    { ...malicious.params, target_link_uri: "https://tool.example.edu/lti/launch" },
    {
      redirectUri: "https://tool.example.edu/lti/launch",
      expectedTargetLinkUri: "https://tool.example.edu/lti/launch",
    },
  );
  assert.equal(configured.ok, true);
  assert.equal(
    configured.authorizationRedirect.params.redirect_uri,
    "https://tool.example.edu/lti/launch",
  );
});
