/**
 * Root script: `pnpm validate:evidence`
 *
 * Structural check that the scientific evidence layer stays wired:
 * - Required residual/evidence files exist on disk
 * - Brand/residual markers present on public evidence surfaces
 * - Relative .md links from EVIDENCE entrypoints resolve (no dead links)
 *
 * Does not re-litigate residual text - only wiring + required markers.
 * Invoked from `pnpm test` after package suites.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasSafeRepositoryPath,
  readRepositoryText,
} from "./repository-files.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Files that must exist for the evidence ladder to be navigable. */
const requiredFiles = [
  "docs/EVIDENCE.md",
  "docs/products/naming.md",
  "docs/products/merge-decision.md",
  "practice-relay/IMPLEMENTATION.md",
  "practice-relay/docs/scope.md",
  "mvei/IMPLEMENTATION.md",
  "mvei/docs/scope.md",
] as const;

const EVIDENCE_MARKERS: [string, string[]][] = [
  ["docs/EVIDENCE.md", ["Practice Relay", "MvEI", "MvEI Workbench", "WorkRecord Core", "WorkRecord", "RO-Crate", "merge"]],
  ["practice-relay/IMPLEMENTATION.md", ["EVIDENCE.md", "Practice Relay"]],
  ["mvei/IMPLEMENTATION.md", ["EVIDENCE.md", "MvEI"]],
  ["docs/products/naming.md", ["Practice Relay", "MvEI", "MvEI Workbench", "WorkRecord Core"]],
  ["docs/products/merge-decision.md", ["Practice Relay", "MvEI Workbench", "separate"]],
];

/** Collect relative .md targets from markdown link syntax (skip http). */
function extractMdLinks(content: string): string[] {
  const out: string[] = [];
  const re = /\[[^\]]*\]\(([^)]+\.md(?:#[^)]*)?)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const raw = m[1].split("#")[0];
    if (raw.startsWith("http")) continue;
    out.push(raw);
  }
  return out;
}

/** Fail if any needle is missing from the file (brand/residual markers). */
function mustContain(pathRel: string, needles: string[]): void {
  const text = readRepositoryText(root, pathRel);
  for (const n of needles) {
    if (!text.includes(n)) {
      throw new Error(`${pathRel} missing required marker: ${n}`);
    }
  }
}

function validateRequiredFiles(): void {
  const missing = requiredFiles.filter((f) => !hasSafeRepositoryPath(root, f));
  if (missing.length) {
    console.error("Missing evidence files:\n" + missing.map((m) => `  - ${m}`).join("\n"));
    process.exit(1);
  }
  console.log(`OK   ${requiredFiles.length} required evidence files exist`);
}

function validateEvidenceMarkers(): void {
  for (const [pathRel, needles] of EVIDENCE_MARKERS) mustContain(pathRel, needles);
  console.log("OK   brand / residual markers present on evidence surfaces");
}

function validateEntrypointLinks(): void {
  const entrypoints = [
    "docs/EVIDENCE.md",
  ] as const;

  let checked = 0;
  const dead: string[] = [];
  for (const entry of entrypoints) {
    const absEntry = join(root, entry);
    const baseDir = dirname(absEntry);
    const links = extractMdLinks(readRepositoryText(root, absEntry));
    for (const rel of links) {
      // skip pure anchors-only already stripped
      const target = resolve(baseDir, rel);
      checked += 1;
      if (!hasSafeRepositoryPath(root, target)) {
        dead.push(`${entry} → ${rel}`);
      }
    }
  }
  if (dead.length) {
    console.error("Dead evidence links:\n" + dead.map((d) => `  - ${d}`).join("\n"));
    process.exit(1);
  }
  console.log(`OK   ${checked} markdown links from evidence entrypoints resolve on disk`);
}

/** Run all evidence wiring checks; exit 1 on failure. */
function main(): void {
  validateRequiredFiles();
  validateEvidenceMarkers();
  validateEntrypointLinks();
  console.log("All evidence wiring checks passed.");
}

main();
