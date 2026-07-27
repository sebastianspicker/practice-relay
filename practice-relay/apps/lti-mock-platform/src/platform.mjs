/**
 * MOCK PLATFORM - not Canvas.
 *
 * Pure helpers for in-repo LMS-shaped register / OIDC initiation / launch / AGS
 * against Practice Relay API local-mock endpoints. Not IMS-certified.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGS_SCORE_SCOPE,
  buildLtiResourceLinkLaunch,
  buildMultiAssetAssignmentPayload,
  issueAgsServiceToken,
  parseOidcLoginInitiation,
  buildOidcAuthorizationRedirect,
  validateMultiAssetAssignmentPayload,
  LTI_STATUS,
} from "../../lti/src/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(
  __dirname,
  "..",
  "fixtures",
  "deployment-registration.json",
);

export const MOCK_PLATFORM_BANNER = "MOCK PLATFORM - not Canvas";
export const MOCK_PLATFORM_STATUS = "local-mock";

/** @returns {Record<string, unknown>} */
export function loadDeploymentRegistration(path = FIXTURE_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * In-memory tool registration (Canvas-like “Developer Key / External tool”).
 * @param {Record<string, unknown>} [seed]
 */
export function createToolRegistry(seed) {
  const fixture = seed ?? loadDeploymentRegistration();
  /** @type {Record<string, unknown>} */
  let registration = structuredClone(fixture);

  return {
    get() {
      return registration;
    },
    /** @param {Partial<{ tool: Record<string, unknown>, platform: Record<string, unknown> }>} patch */
    register(patch) {
      registration = {
        ...registration,
        ...patch,
        tool: { ...(registration.tool ?? {}), ...(patch.tool ?? {}) },
        platform: {
          ...(registration.platform ?? {}),
          ...(patch.platform ?? {}),
        },
        status: MOCK_PLATFORM_STATUS,
        disclaimer: MOCK_PLATFORM_BANNER + ". Not IMS certified.",
        updatedAt: new Date().toISOString(),
      };
      return registration;
    },
    banner: MOCK_PLATFORM_BANNER,
    status: MOCK_PLATFORM_STATUS,
  };
}

function registrationParts(registration) {
  return {
    tool: /** @type {Record<string, string>} */ (registration.tool ?? {}),
    platform: /** @type {Record<string, string>} */ (registration.platform ?? {}),
  };
}

function mockLaunchOptions(opts, tool, platform) {
  return {
    userId: opts.userId ?? "faculty-ada",
    roles: opts.roles,
    secret: opts.secret,
    privateKeyPem: opts.privateKeyPem,
    kid: opts.kid,
    deploymentId: opts.deploymentId ?? tool.deploymentId,
    platformIss: opts.platformIss ?? platform.issuer,
    nonce: opts.nonce,
  };
}

function mockLaunchResponse(launch, score, tool, opts) {
  const assignment = launch.assignment ?? buildMultiAssetAssignmentPayload(score);
  return {
    banner: MOCK_PLATFORM_BANNER,
    status: LTI_STATUS,
    idToken: launch.idToken,
    claims: launch.claims,
    assignment,
    validation: validateMultiAssetAssignmentPayload(assignment),
    alg: launch.alg,
    targetLinkUri: tool.targetLinkUri,
    clientId: tool.clientId,
    deploymentId: tool.deploymentId ?? opts.deploymentId,
  };
}

/**
 * Build a multi-asset launch as the mock LMS would, using the shared LTI package.
 * @param {import("../../lti/src/index.mjs").WorkRecordLike | Record<string, unknown>} score
 * @param {{
 *   userId?: string,
 *   roles?: string[],
 *   secret?: string,
 *   privateKeyPem?: string,
 *   kid?: string,
 *   deploymentId?: string,
 *   platformIss?: string,
 *   nonce?: string,
 * }} [opts]
 */
export function issueMockPlatformLaunch(score, opts = {}) {
  const reg = loadDeploymentRegistration();
  const { tool, platform } = registrationParts(reg);
  const launch = buildLtiResourceLinkLaunch(
    score,
    mockLaunchOptions(opts, tool, platform),
  );
  return mockLaunchResponse(launch, score, tool, opts);
}

function mockOidcPlatformParams(opts, platform) {
  return {
    iss: opts.iss ?? platform.issuer,
    login_hint: opts.loginHint ?? "faculty-ada",
    lti_message_hint: opts.ltiMessageHint ?? "rl-mock-1",
  };
}

function mockOidcToolParams(opts, tool) {
  return {
    target_link_uri: opts.targetLinkUri ?? tool.targetLinkUri,
    client_id: opts.clientId ?? tool.clientId,
    lti_deployment_id: opts.deploymentId ?? tool.deploymentId,
  };
}

function mockOidcLoginParams(opts, tool, platform) {
  return {
    ...mockOidcPlatformParams(opts, platform),
    ...mockOidcToolParams(opts, tool),
  };
}

/**
 * Start OIDC third-party login from mock platform → tool `/lti/login`.
 * @param {{
 *   loginHint?: string,
 *   ltiMessageHint?: string,
 *   targetLinkUri?: string,
 *   clientId?: string,
 *   deploymentId?: string,
 *   iss?: string,
 * }} [opts]
 */
export function buildMockOidcLoginInitiation(opts = {}) {
  const reg = loadDeploymentRegistration();
  const { tool, platform } = registrationParts(reg);
  const params = mockOidcLoginParams(opts, tool, platform);
  const parsed = parseOidcLoginInitiation(params);
  return {
    banner: MOCK_PLATFORM_BANNER,
    status: MOCK_PLATFORM_STATUS,
    toolLoginUrl: tool.oidcLoginInitiationUrl,
    params,
    parsed,
  };
}

/**
 * After tool parses initiation, mock platform issues authorization response (id_token).
 * @param {ReturnType<typeof parseOidcLoginInitiation>} initiation
 * @param {import("../../lti/src/index.mjs").WorkRecordLike | Record<string, unknown>} score
 * @param {{ secret?: string, privateKeyPem?: string, kid?: string, userId?: string }} [opts]
 */
export function completeMockPlatformAuth(initiation, score, opts = {}) {
  if (!initiation.ok) {
    return { ok: false, error: initiation.errors, banner: MOCK_PLATFORM_BANNER };
  }
  const registration = loadDeploymentRegistration();
  const tool = /** @type {Record<string, string>} */ (registration.tool ?? {});
  const authRedirect = buildOidcAuthorizationRedirect(initiation, {
    platformAuthUrl:
      /** @type {string} */ (
        registration.platform?.authLoginUrl
      ) ?? "http://localhost:8790/platform/auth",
    redirectUri: tool.targetLinkUri,
  });
  const launch = issueMockPlatformLaunch(score, {
    userId: opts.userId ?? String(initiation.params.login_hint),
    secret: opts.secret,
    privateKeyPem: opts.privateKeyPem,
    kid: opts.kid,
    deploymentId: String(initiation.params.lti_deployment_id),
    platformIss: String(initiation.params.iss),
    nonce: authRedirect.params.nonce,
  });
  return {
    ok: true,
    banner: MOCK_PLATFORM_BANNER,
    status: MOCK_PLATFORM_STATUS,
    authorizationRedirect: authRedirect,
    idToken: launch.idToken,
    assignment: launch.assignment,
    validation: launch.validation,
    formPost: {
      id_token: launch.idToken,
      state: authRedirect.params.state,
    },
  };
}

/**
 * Issue AGS client-credentials token the way a tool would against platform token URL.
 * Lab: Practice Relay API hosts the mock token endpoint.
 * @param {{ clientId?: string, secret?: string, scope?: string }} [opts]
 */
export function issueMockAgsClientCredentials(opts = {}) {
  const reg = loadDeploymentRegistration();
  const tool = /** @type {Record<string, string>} */ (reg.tool ?? {});
  const token = issueAgsServiceToken({
    clientId: opts.clientId ?? tool.clientId ?? "practice-relay-tool",
    secret: opts.secret,
    scope: opts.scope ?? AGS_SCORE_SCOPE,
  });
  return {
    banner: MOCK_PLATFORM_BANNER,
    status: MOCK_PLATFORM_STATUS,
    tokenUrl: tool.agsTokenUrl,
    scoreUrl: tool.agsScoreUrl,
    token,
  };
}

/**
 * Default demo score shape for mock launches (multi-asset, singleVideoUrl null).
 */
export function demoScoreForMockLaunch() {
  return {
    id: "ps-mock-platform-demo",
    title: "MOCK PLATFORM multi-asset assignment",
    tracks: [
      { id: "tr-video", type: "video", label: "Video", ref: "media/demo.mp4" },
      {
        id: "tr-music",
        type: "music_notation",
        label: "Score",
        ref: "scores/demo.musicxml",
      },
      {
        id: "tr-motif",
        type: "movement_notation",
        label: "Motif",
        ref: "motif/demo.mvei.json",
      },
    ],
    takes: [{ id: "take-1", label: "Take 1", mediaPath: "media/demo.mp4" }],
    preferredTakeId: "take-1",
    consents: [
      {
        purposes: ["course_assessment"],
        exportAllowed: true,
      },
    ],
  };
}
