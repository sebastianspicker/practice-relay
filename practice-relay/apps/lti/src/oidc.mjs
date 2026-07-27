/**
 * OIDC third-party login initiation validation for the local-mock LTI flow.
 *
 * Why: registered target-link and redirect constraints must be checked before launch.
 */
import { randomUUID } from "node:crypto";
import { LTI_DEFAULT_LAUNCH_URL, LTI_STATUS } from "./assignment.mjs";

/**
 * Documented OIDC login initiation parameter names (platform → tool).
 * @see https://www.imsglobal.org/spec/security/v1p0/#step-1-third-party-initiated-login
 */
export const OIDC_LOGIN_INITIATION_PARAM_NAMES = Object.freeze({
  required: Object.freeze([
    "iss",
    "login_hint",
    "target_link_uri",
    "client_id",
    "lti_deployment_id",
  ]),
  optional: Object.freeze(["lti_message_hint"]),
});

function rejectedInitiation(errors, params = {}) {
  return { ok: false, errors, params, status: LTI_STATUS };
}

function queryStringParams(input) {
  const params = {};
  const qs = new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
  for (const [key, value] of qs.entries()) params[key] = value;
  return params;
}

function objectParams(input) {
  const params = {};
  for (const [key, value] of Object.entries(input)) {
    if (value != null) params[key] = String(value);
  }
  return params;
}

function initiationParams(input) {
  if (typeof input === "string") return queryStringParams(input);
  if (typeof URLSearchParams !== "undefined" && input instanceof URLSearchParams) {
    return queryStringParams(input.toString());
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return objectParams(input);
  }
  return null;
}

/**
 * Parse + validate LTI 1.3 OIDC third-party initiated login parameters.
 * @param {Record<string, unknown> | URLSearchParams | string | null | undefined} input
 * @returns {{
 *   ok: boolean,
 *   errors?: string,
 *   params: Record<string, string>,
 *   status: typeof LTI_STATUS,
 * }}
 */
export function parseOidcLoginInitiation(input) {
  if (input == null) {
    return rejectedInitiation("missing initiation parameters");
  }
  const params = initiationParams(input);
  if (!params) return rejectedInitiation("initiation parameters must be object or query string");

  const missing = OIDC_LOGIN_INITIATION_PARAM_NAMES.required.filter(
    (name) => !params[name] || !String(params[name]).trim(),
  );
  if (missing.length) {
    return rejectedInitiation(
      `missing required OIDC login initiation params: ${missing.join(", ")}`,
      params,
    );
  }

  return { ok: true, params, status: LTI_STATUS };
}

function rejectedOidcLogin(parsed, error) {
  return {
    ok: false,
    status: LTI_STATUS,
    step: "reject",
    error,
    received: parsed.params,
  };
}

function oidcRegistrationError(parsed, opts, expectedTargetLinkUri) {
  if (opts.expectedClientId && parsed.params.client_id !== opts.expectedClientId) {
    return "client_id does not match tool registration";
  }
  if (opts.expectedIssuer && parsed.params.iss !== opts.expectedIssuer) {
    return "iss does not match trusted platform issuer";
  }
  return parsed.params.target_link_uri !== expectedTargetLinkUri
    ? "target_link_uri does not match tool registration"
    : undefined;
}

/**
 * Build the authorization redirect the tool would send back to the platform
 * after receiving a valid login initiation (lab mock - returns structured data).
 *
 * @param {{ ok: boolean, params?: Record<string, string>, errors?: string }} initiation
 * @param {{
 *   platformAuthUrl?: string,
 *   redirectUri?: string,
 *   state?: string,
 *   nonce?: string,
 * }} [opts]
 * @returns {{
 *   ok: boolean,
 *   error?: string,
 *   status: typeof LTI_STATUS,
 *   url?: string,
 *   params?: Record<string, string>,
 * }}
 */
export function buildOidcAuthorizationRedirect(initiation, opts = {}) {
  if (!initiation?.ok || !initiation.params) {
    return {
      ok: false,
      error: initiation?.errors ?? "invalid initiation",
      status: LTI_STATUS,
    };
  }
  const p = initiation.params;
  const state = opts.state ?? randomUUID();
  const nonce = opts.nonce ?? randomUUID();
  const redirectUri = opts.redirectUri ?? LTI_DEFAULT_LAUNCH_URL;
  const platformAuthUrl =
    opts.platformAuthUrl ?? "http://localhost:8790/platform/auth";

  const params = {
    scope: "openid",
    response_type: "id_token",
    response_mode: "form_post",
    prompt: "none",
    client_id: p.client_id,
    redirect_uri: redirectUri,
    login_hint: p.login_hint,
    state,
    nonce,
    lti_message_hint: p.lti_message_hint ?? "",
  };

  const url = new URL(platformAuthUrl);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  return {
    ok: true,
    status: LTI_STATUS,
    url: url.toString(),
    params,
  };
}

/**
 * Tool-side OIDC login initiation handler (local-mock).
 * Validates platform params and returns the next-step authorization redirect.
 *
 * @param {Record<string, unknown> | URLSearchParams | string | null | undefined} input
 * @param {{
 *   platformAuthUrl?: string,
 *   expectedClientId?: string,
 *   expectedIssuer?: string,
 *   redirectUri?: string,
 *   expectedTargetLinkUri?: string,
 * }} [opts]
 */
export function processOidcLoginInitiation(input, opts = {}) {
  const parsed = parseOidcLoginInitiation(input);
  if (!parsed.ok) {
    return rejectedOidcLogin(parsed, parsed.errors);
  }
  const expectedTargetLinkUri =
    opts.expectedTargetLinkUri ?? opts.redirectUri ?? LTI_DEFAULT_LAUNCH_URL;
  const registrationError = oidcRegistrationError(parsed, opts, expectedTargetLinkUri);
  if (registrationError) return rejectedOidcLogin(parsed, registrationError);

  const authorizationRedirect = buildOidcAuthorizationRedirect(parsed, {
    platformAuthUrl: opts.platformAuthUrl,
    redirectUri: opts.redirectUri ?? expectedTargetLinkUri,
  });

  return {
    ok: true,
    status: LTI_STATUS,
    step: "redirect_to_platform_auth",
    note:
      "LTI 1.3 OIDC login initiation accepted (local-mock). Not a live campus IdP flow.",
    received: parsed.params,
    authorizationRedirect,
  };
}
