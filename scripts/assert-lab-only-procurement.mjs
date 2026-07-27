#!/usr/bin/env node
/**
 * scripts/assert-lab-only-procurement.mjs
 *
 * local mock permanent lab-only "lock" guard:
 * fails if public surfaces claim IMS certified / Canvas production /
 * multi-campus SSO as shipped product capabilities.
 *
 * Usage: node scripts/assert-lab-only-procurement.mjs
 * Wired as: pnpm test:lab-only-claims
 */
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasSafeRepositoryPath,
  readRepositoryText,
} from "./repository-files.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Positive shipping claims (case-insensitive substring).
 * Lines that frame these as non-goals / not / never are exempt.
 */
const FORBIDDEN_SHIPPED_CLAIMS = [
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

/** Surfaces scanned for positive shipped claims. */
const SCAN_ROOTS = [
  "practice-relay/apps/web/src",
  "practice-relay/apps/lti-mock-platform/src",
  "docs/pilot-pack",
  "README.md",
  "practice-relay/README.md",
  "practice-relay/docs/lab-only-tier.md",
  "practice-relay/docs/lti-lms-registration.md",
];

const REQUIRED_FILES = [
  "practice-relay/docs/lti-lms-registration.md",
  "practice-relay/docs/lms-registration-preflight.md",
  "practice-relay/docs/lab-only-tier.md",
  "practice-relay/apps/lti-mock-platform/fixtures/deployment-registration.json",
  "practice-relay/apps/lti-mock-platform/fixtures/canvas-tool-config.json",
  "practice-relay/apps/lti-mock-platform/fixtures/moodle-tool-config.json",
  "scripts/assert-lab-only-procurement.mjs",
  "docker-compose.campus-lab.yml",
];

const REQUIRED_MARKERS = {
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

const errors = [];

/** Collect bounded claim surfaces without following symlinks. */
export function collectFiles(dirRel, acc = [], repositoryRoot = root) {
  const abs = join(repositoryRoot, dirRel);
  if (!existsSync(abs)) {
    errors.push(`missing scan root: ${dirRel}`);
    return acc;
  }
  const st = lstatSync(abs);
  if (st.isSymbolicLink()) return acc;
  if (st.isFile()) {
    acc.push(dirRel);
    return acc;
  }
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (
      entry.isSymbolicLink() ||
      entry.name === "node_modules" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }
    const rel = join(dirRel, entry.name);
    if (entry.isDirectory()) collectFiles(rel, acc, repositoryRoot);
    else if (
      entry.isFile() &&
      /\.(mjs|js|ts|tsx|html|md|json)$/.test(entry.name)
    ) {
      acc.push(rel);
    }
  }
  return acc;
}

/** Headings / intros that introduce ban lists or non-goals (exempt following body). */
function isBanListHeading(line) {
  const l = line.toLowerCase();
  return (
    /^#{1,6}\s+/.test(line) &&
    /(non-goal|nonclaim|not in |out of scope|never claim|do not use|do not claim|forbidden|kill-switch|explicit non|decision guide|path a|path b|acceptance criteria|lock pack)/.test(
      l,
    )
  );
}

function entersBanContext(line) {
  const l = line.toLowerCase().trim();
  if (isBanListHeading(line)) return true;
  if (/^\*\*not\b/.test(l)) return true;
  if (/^do \*\*not\*\* use|^do not use|^never claim|^not claimed|^out of scope/.test(l)) {
    return true;
  }
  if (/choose path a when|do \*\*not\*\* claim|do not claim/.test(l)) return true;
  // Source string continuations: nonGoals: "Non-goals: ..."
  if (/\bnon-?goals?\b/.test(l) || /\blocal-mock only\b/.test(l)) return true;
  return false;
}

const FRAMING_LINE_PATTERN = /\b(not|no|never|without|nor|neither|non-goal|nonclaim|out of scope|do not|don't|must not|does not|isn't|is not|deferred|later)\b|forbidden|banned|never claim|kill-switch|assert-lab-only|assertnoforbidden|disclaimer|local-mock|lab-only|path a|preflight|environment-dependent|mock platform|not canvas|checklist only|honesty|non-?goals?/;

const EXEMPT_LINE_PATTERNS = [
  /^\|/,
  /^\s*[-*]\s+["“'\x60]/,
  /^\s*[-*]\s+\*\*(?=.*(?:not|never|non-goal))/i,
  /^\s*["'\x60]/,
  /^\s*(?:\/\/|\*)/,
];

function isExemptLine(line, banContext) {
  if (banContext) return true;
  const trimmed = line.trim();
  for (const pattern of EXEMPT_LINE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return FRAMING_LINE_PATTERN.test(trimmed.toLowerCase());
}

function testAssertionLine(relPath, line) {
  return relPath.includes(".test.") && /assert|forbidden|doesnot|not\.|match\(/.test(line);
}

function scanFile(relPath) {
  const text = readRepositoryText(root, relPath);
  const lines = text.split(/\r?\n/);
  let banContext = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (/^#{1,2}\s+/.test(line) && !isBanListHeading(line)) banContext = false;
    if (entersBanContext(line)) banContext = true;

    if (isExemptLine(line, banContext)) continue;
    const lower = line.toLowerCase();
    for (const claim of FORBIDDEN_SHIPPED_CLAIMS) {
      for (const p of claim.patterns) {
        if (lower.includes(p)) {
          if (testAssertionLine(relPath, lower)) continue;
          errors.push(
            `${relPath}:${i + 1}: shipped claim "${claim.id}" (${p}): ${line.trim().slice(0, 140)}`,
          );
        }
      }
    }
  }
}

function assertRequiredMarkers(relPath, text, markers, markerType) {
  for (const marker of markers) {
    if (!text.includes(marker)) {
      errors.push(`${relPath} missing ${markerType}: ${marker}`);
    }
  }
}

function assertLoopbackPorts(relPath, text, ports) {
  for (const port of ports) {
    if (new RegExp(`^[\\t ]*- ["']?${port}:${port}["']?\\s*$`, "m").test(text)) {
      errors.push(`${relPath} publishes ${port} on all host interfaces`);
    }
  }
}

function mustExist(relPath) {
  if (!hasSafeRepositoryPath(root, relPath)) {
    errors.push(`missing required local-mock and external-registration artefact: ${relPath}`);
  }
}

function mustContain(relPath, needles) {
  if (!hasSafeRepositoryPath(root, relPath)) {
    errors.push(`missing required file: ${relPath}`);
    return;
  }
  const text = readRepositoryText(root, relPath);
  for (const n of needles) {
    if (!text.includes(n)) {
      errors.push(`${relPath} missing required marker: ${n}`);
    }
  }
}

/** Campus compose is a local-only lab surface, never a shared-host shortcut. */
function assertCampusLabHardening() {
  const relPath = "docker-compose.campus-lab.yml";
  const text = readRepositoryText(root, relPath);
  const required = [
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
  ];
  assertRequiredMarkers(relPath, text, required, "campus-lab hardening marker");
  assertLoopbackPorts(relPath, text, ["8787", "8790", "9000", "9001"]);
  for (const forbidden of [
    "campus-lab-lti-dev-only-change-me",
    "campus-lab-auth-dev-only-change-me",
    "PRACTICE_RELAY_S3_ACCESS_KEY: ${PRACTICE_RELAY_S3_ACCESS_KEY:-",
    "PRACTICE_RELAY_S3_SECRET_KEY: ${PRACTICE_RELAY_S3_SECRET_KEY:-",
    "MINIO_ROOT_USER: ${PRACTICE_RELAY_S3_ACCESS_KEY:-",
    "MINIO_ROOT_PASSWORD: ${PRACTICE_RELAY_S3_SECRET_KEY:-",
    String.raw`tr -d '\\r\\n'`,
  ]) {
    if (text.includes(forbidden)) {
      errors.push(`${relPath} retains a fixed or fallback credential: ${forbidden}`);
    }
  }
  if (
    !/entrypoint:\s*\["\/bin\/sh",\s*"-ec"\]\s*\n\s*command:\s*\n\s*- \|/.test(
      text,
    )
  ) {
    errors.push(`${relPath} must pass the guarded MinIO script as one argv item`);
  }
}

/** Production-lab compose must also stay loopback-only and fail closed on secrets. */
function assertProductionLabHardening() {
  const relPath = "docker-compose.production-lab.yml";
  const text = readRepositoryText(root, relPath);
  const required = [
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
  ];
  assertRequiredMarkers(relPath, text, required, "production-lab hardening marker");
  assertLoopbackPorts(relPath, text, ["8787", "9000", "9001"]);
  const placeholderGuards = text.match(
    /refusing placeholder or default production-lab/g,
  )?.length ?? 0;
  if (placeholderGuards < 2) {
    errors.push(`${relPath} must guard MinIO server and bucket initialization secrets`);
  }
  const singleCommandArrays = text.match(
    /entrypoint:\s*\["\/bin\/sh",\s*"-ec"\]\s*\n\s*command:\s*\n\s*- \|/g,
  )?.length ?? 0;
  if (singleCommandArrays < 2) {
    errors.push(`${relPath} must pass both guarded shell scripts as one argv item`);
  }
}

function main() {
  for (const f of REQUIRED_FILES) mustExist(f);
  for (const [f, needles] of Object.entries(REQUIRED_MARKERS)) {
    mustContain(f, needles);
  }
  assertCampusLabHardening();
  assertProductionLabHardening();

  // package.json script wiring
  mustContain("package.json", [
    '"test:lab-only-claims"',
    "assert-lab-only-procurement.mjs",
  ]);

  const files = SCAN_ROOTS.flatMap((d) => collectFiles(d));
  for (const f of files) {
    if (/\.test\.(mjs|js|ts)$/.test(f)) continue;
    scanFile(f);
  }

  if (errors.length) {
    console.error("Lab-only procurement assertion FAILED:\n");
    for (const e of errors) console.error(`  - ${e}`);
    console.error(
      `\nSee practice-relay/docs/lab-only-tier.md (${errors.length} issue(s)).`,
    );
    process.exit(1);
  }

  const scanned = files.filter((f) => !/\.test\./.test(f)).length;
  console.log(
    `OK   lab-only-claims: scanned ${scanned} surface files; local mock artefacts present; no IMS/Canvas-production/multi-campus-SSO shipped claims`,
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
