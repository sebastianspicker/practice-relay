#!/usr/bin/env node
/**
 * Enforce the clean-break brand and positioning contract on active surfaces.
 * Why: retired product identities may remain as labelled history, but must not
 * leak back into executable paths, current documentation, or user-facing copy.
 */
import { readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isProtectedRepositoryPath } from "./protected-paths.mjs";
import {
  hasSafeRepositoryPath,
  readRepositoryText,
} from "./repository-files.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shellPath = "practice-relay/apps/web/src/shell.mjs";
const corePath = "packages/work-record-core/src/index.ts";
const workbenchPath = "mvei/apps/workbench/src/shell.mjs";
const scannedExtensions = new Set([
  ".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".mts",
  ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);
const ignoredDirectories = new Set([".git", "node_modules", "dist", "coverage"]);
const historicalPrefixes = [
  "docs/images/archive/",
];
const exemptFiles = new Set([
  "docs/EVIDENCE.md",
  "docs/positioning-kill-switches.md",
  shellPath,
  corePath,
  "scripts/assert-kill-switches.mjs",
]);
const retiredPatterns = [
  [/\bPartitura\b/i, "Partitura"],
  [/\bKineme\b/i, "Kineme"],
  [/\bContinuum\b/i, "Continuum"],
  [/\bIWI\b/i, "IWI"],
  [/@mac\//i, "@mac/"],
  [/\bARDP\b/i, "ARDP"],
  [/Performance[ -]?Score Hub/i, "Performance Score Hub"],
  [/(^|[\s`'"(])hub\//i, "hub/"],
  [/(^|[\s`'"(])cmnl\//i, "cmnl/"],
  [/shared\/packages/i, "shared/packages"],
  [/editor-motif/i, "editor-motif"],
];

const errors = [];

/** Collect active text files without following symlinks or protected paths. */
export function walk(directory, repositoryRoot = root) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const relativePath = relative(repositoryRoot, absolute).replaceAll("\\", "/");
    if (
      entry.isSymbolicLink() ||
      ignoredDirectories.has(entry.name) ||
      isProtectedRepositoryPath(relativePath)
    ) {
      continue;
    }
    if (entry.isDirectory()) files.push(...walk(absolute, repositoryRoot));
    else if (entry.isFile() && scannedExtensions.has(extname(entry.name))) {
      files.push(absolute);
    }
  }
  return files;
}

function isHistorical(relativePath) {
  return exemptFiles.has(relativePath) || historicalPrefixes.some((prefix) => relativePath.startsWith(prefix));
}

function requireText(relativePath, fragments) {
  const absolute = join(root, relativePath);
  if (!hasSafeRepositoryPath(root, absolute)) {
    errors.push(`missing required file: ${relativePath}`);
    return;
  }
  const text = readRepositoryText(root, absolute);
  for (const fragment of fragments) {
    if (!text.includes(fragment)) errors.push(`${relativePath} missing required marker: ${fragment}`);
  }
}

requireText(shellPath, ["Practice Relay", "FORBIDDEN_UI_STRINGS", "assertNoForbiddenCopy"]);
requireText(corePath, ["WorkRecord", "FORBIDDEN_STRINGS", "annotationTrackLabel"]);
requireText(workbenchPath, ["MvEI Workbench", "Movement Encoding Initiative"]);

function main() {
  let scanned = 0;
  for (const absolute of walk(root)) {
    const relativePath = relative(root, absolute);
    if (isHistorical(relativePath)) continue;
    scanned += 1;
    const lines = readRepositoryText(root, absolute).split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const [pattern, label] of retiredPatterns) {
        if (pattern.test(line)) {
          errors.push(`${relativePath}:${index + 1}: retired identity ${label}`);
        }
      }
    });
  }

  if (errors.length) {
    console.error("Brand and positioning guard FAILED:\n");
    errors.forEach((error) => console.error(`  - ${error}`));
    process.exit(1);
  }

  console.log(`OK   brand and positioning guard: ${scanned} active text files scanned`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
