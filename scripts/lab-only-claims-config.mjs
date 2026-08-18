/** Immutable policy data for the local-mock procurement assertion. */
export const FORBIDDEN_SHIPPED_CLAIMS = [
  {
    id: "ims-certified",
    patterns: [
      "ims certified",
      "ims-certified",
      "ims global certified",
      "1edtech certified",
      "1edtech-certified",
    ],
  },
  {
    id: "canvas-certified",
    patterns: ["canvas-certified", "canvas certified"],
  },
  {
    id: "canvas-production",
    patterns: [
      "canvas production registration",
      "canvas production install",
      "production canvas install completed",
      "real canvas install completed",
    ],
  },
  {
    id: "multi-campus-sso-shipped",
    patterns: [
      "multi-campus sso shipped",
      "multi-campus sso as shipped",
      "production multi-campus sso",
      "shipped multi-campus sso",
    ],
  },
];

export const SCAN_ROOTS = [
  "practice-relay/apps/web/src",
  "practice-relay/apps/lti-mock-platform/src",
  "docs/pilot-pack",
  "README.md",
  "practice-relay/README.md",
  "practice-relay/docs/lab-only-tier.md",
  "practice-relay/docs/lti-lms-registration.md",
];

export const REQUIRED_FILES = [
  "practice-relay/docs/lti-lms-registration.md",
  "practice-relay/docs/lms-registration-preflight.md",
  "practice-relay/docs/lab-only-tier.md",
  "practice-relay/apps/lti-mock-platform/fixtures/deployment-registration.json",
  "practice-relay/apps/lti-mock-platform/fixtures/canvas-tool-config.json",
  "practice-relay/apps/lti-mock-platform/fixtures/moodle-tool-config.json",
  "scripts/assert-lab-only-procurement.mjs",
  "docker-compose.campus-lab.yml",
];

export const REQUIRED_MARKERS = {
  "practice-relay/docs/lab-only-tier.md": [
    "synthetic local evaluation",
    "MOCK PLATFORM - not Canvas",
    "pnpm test:lab-only-claims",
    "1EdTech",
  ],
  "practice-relay/apps/lti-mock-platform/src/platform.mjs": [
    "MOCK PLATFORM - not Canvas",
    "local-mock",
  ],
  "practice-relay/apps/lti-mock-platform/fixtures/deployment-registration.json": [
    "MOCK PLATFORM - not Canvas",
    "local-mock",
    '"singleVideoUrl": null',
  ],
  "practice-relay/apps/lti-mock-platform/fixtures/canvas-tool-config.json": [
    "target_link_uri",
    "openid_connect_initiation_url",
    "public_jwk_url",
    "not-production",
  ],
  "practice-relay/apps/lti-mock-platform/fixtures/moodle-tool-config.json": [
    "initiate_login_url",
    "redirection_uris",
    "public_keyset_url",
    "not-production",
  ],
};

export const CAMPUS_LAB_HARDENING = {
  relPath: "docker-compose.campus-lab.yml",
  required: [
    '"127.0.0.1:8787:8787"',
    '"127.0.0.1:8790:8790"',
    '"127.0.0.1:9000:9000"',
    '"127.0.0.1:9001:9001"',
    "SECRET_BACKEND: file",
    'PRACTICE_RELAY_REQUIRE_SECRETS: "1"',
    'PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS: "1"',
    'PRACTICE_RELAY_HOST: "0.0.0.0"',
    "PRACTICE_RELAY_ALLOWED_HOSTS: practice-relay-api:8787",
    "PRACTICE_RELAY_AUTH_SECRET_FILE: /run/secrets/practice-relay_auth",
    "PRACTICE_RELAY_LTI_SECRET_FILE: /run/secrets/practice-relay_lti",
    "PRACTICE_RELAY_AUTH_USERS_FILE: /run/secrets/practice-relay_users",
    "MINIO_ROOT_USER_FILE: /run/secrets/minio_root_user",
    "MINIO_ROOT_PASSWORD_FILE: /run/secrets/minio_root_password",
    "refusing placeholder or default campus-lab",
    "fetch('http://127.0.0.1:8787/readyz')",
    'if [ "$$attempt" -ge 15 ]',
    "MinIO did not become ready for bucket initialization",
    'until mc alias set lab http://minio:9000 "$$USER" "$$PASS"; do',
    "sleep 2",
  ],
  ports: ["8787", "8790", "9000", "9001"],
  forbidden: [
    "campus-lab-lti-dev-only-change-me",
    "campus-lab-auth-dev-only-change-me",
    "PRACTICE_RELAY_S3_ACCESS_KEY: ${PRACTICE_RELAY_S3_ACCESS_KEY:-",
    "PRACTICE_RELAY_S3_SECRET_KEY: ${PRACTICE_RELAY_S3_SECRET_KEY:-",
    "MINIO_ROOT_USER: ${PRACTICE_RELAY_S3_ACCESS_KEY:-",
    "MINIO_ROOT_PASSWORD: ${PRACTICE_RELAY_S3_SECRET_KEY:-",
    String.raw`tr -d '\\r\\n'`,
  ],
};

export const PRODUCTION_LAB_HARDENING = {
  relPath: "docker-compose.production-lab.yml",
  required: [
    '"127.0.0.1:8787:8787"',
    '"127.0.0.1:9000:9000"',
    '"127.0.0.1:9001:9001"',
    "SECRET_BACKEND: file",
    'PRACTICE_RELAY_REQUIRE_SECRETS: "1"',
    'PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS: "1"',
    'PRACTICE_RELAY_HOST: "0.0.0.0"',
    "PRACTICE_RELAY_AUTH_SECRET_FILE: /run/secrets/practice-relay_auth",
    "PRACTICE_RELAY_LTI_SECRET_FILE: /run/secrets/practice-relay_lti",
    "PRACTICE_RELAY_AUTH_USERS_FILE: /run/secrets/practice-relay_users",
    "MINIO_ROOT_USER_FILE: /run/secrets/minio_root_user",
    "MINIO_ROOT_PASSWORD_FILE: /run/secrets/minio_root_password",
    "refusing placeholder or default production-lab",
    'condition: service_healthy',
    'if [ "$$attempt" -ge 15 ]',
  ],
  ports: ["8787", "9000", "9001"],
};
