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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAMPUS_LAB_HARDENING,
  FORBIDDEN_SHIPPED_CLAIMS,
  PRODUCTION_LAB_HARDENING,
  REQUIRED_FILES,
  REQUIRED_MARKERS,
  SCAN_ROOTS,
} from "./lab-only-claims-config.mjs";
import { assertLabComposeHardening } from "./lab-only-claims-compose.mjs";
import {
  collectClaimFiles,
  scanClaimFile,
} from "./lab-only-claims-scan.mjs";
import {
  hasSafeRepositoryPath,
  readRepositoryText,
} from "./repository-files.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const errors = [];

/** Collect bounded claim surfaces without following symlinks. */
export function collectFiles(dirRel, acc = [], repositoryRoot = root) {
  return collectClaimFiles({ dirRel, acc, repositoryRoot, errors });
}

function assertRequiredMarkers(relPath, text, markers, markerType) {
  for (const marker of markers) {
    if (!text.includes(marker)) {
      errors.push(`${relPath} missing ${markerType}: ${marker}`);
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

function main() {
  for (const f of REQUIRED_FILES) mustExist(f);
  for (const [f, needles] of Object.entries(REQUIRED_MARKERS)) {
    mustContain(f, needles);
  }
  assertLabComposeHardening({
    repositoryRoot: root,
    errors,
    campusHardening: CAMPUS_LAB_HARDENING,
    productionHardening: PRODUCTION_LAB_HARDENING,
  });

  // package.json script wiring
  mustContain("package.json", [
    '"test:lab-only-claims"',
    "assert-lab-only-procurement.mjs",
  ]);

  const files = SCAN_ROOTS.flatMap((d) => collectFiles(d));
  for (const f of files) {
    if (/\.test\.(mjs|js|ts)$/.test(f)) continue;
    scanClaimFile({
      relPath: f,
      repositoryRoot: root,
      errors,
      forbiddenClaims: FORBIDDEN_SHIPPED_CLAIMS,
    });
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
