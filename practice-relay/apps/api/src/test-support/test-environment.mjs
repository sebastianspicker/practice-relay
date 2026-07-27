/**
 * Isolated process environment for API unit tests.
 * Why: importing the API must never consume ambient storage, cloud, proxy, or secret inputs.
 */

const APPLICATION_PREFIXES = [
  "PRACTICE_RELAY_",
  "MVEI_",
  "AWS_",
  "MINIO_",
  "SECRET_",
  "KMS_",
  "AZURE_",
  "GOOGLE_",
  "GCP_",
];

const NETWORK_ENVIRONMENT_NAMES = new Set([
  "ALL_PROXY",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "all_proxy",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "NODE_TLS_REJECT_UNAUTHORIZED",
]);

const TEST_ENVIRONMENT = Object.freeze({
  PRACTICE_RELAY_AUTH_SECRET: "api-unit-auth-secret-material-000001",
  PRACTICE_RELAY_LTI_SECRET: "api-unit-lti-secret-material-0000002",
  PRACTICE_RELAY_OBJECT_STORE: "memory",
  PRACTICE_RELAY_REQUIRE_SECRETS: "1",
});

function isAmbientApplicationInput(name) {
  return (
    APPLICATION_PREFIXES.some((prefix) => name.startsWith(prefix)) ||
    NETWORK_ENVIRONMENT_NAMES.has(name)
  );
}

/** Return a deterministic API test environment with memory-only storage. */
export function createApiTestEnvironment(source) {
  const environment = { ...source };
  for (const name of Object.keys(environment)) {
    if (isAmbientApplicationInput(name)) delete environment[name];
  }
  return { ...environment, ...TEST_ENVIRONMENT };
}

function installApiTestEnvironment() {
  const environment = createApiTestEnvironment(process.env);
  for (const name of Object.keys(process.env)) {
    if (isAmbientApplicationInput(name)) delete process.env[name];
  }
  Object.assign(process.env, environment);
}

installApiTestEnvironment();
