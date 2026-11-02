/**
 * Root check: `pnpm check:contracts`
 *
 * Structural check that the scientific evidence layer stays wired:
 * - Required residual/evidence files exist on disk
 * - Brand/residual markers present on public evidence surfaces
 *
 * Does not re-litigate residual text - only wiring + required markers.
 * Invoked from `pnpm check:contracts`.
 */
import { dirname, join } from "node:path";
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
  "docs/relay/README.md",
  "docs/relay/architecture.md",
  "docs/movement/README.md",
  "docs/movement/architecture.md",
] as const;

const EVIDENCE_MARKERS: [string, string[]][] = [
  ["docs/EVIDENCE.md", ["Practice Relay", "MvEI", "MvEI Workbench", "WorkRecord contracts", "WorkRecord", "RO-Crate", "merge"]],
  ["docs/relay/README.md", ["Practice Relay", "WorkRecord"]],
  ["docs/movement/README.md", ["MvEI", "movement"]],
  ["docs/products/naming.md", ["Practice Relay", "MvEI", "MvEI Workbench", "WorkRecord contracts"]],
  ["docs/products/merge-decision.md", ["Practice Relay", "MvEI Workbench", "separate"]],
];

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

/** Run all evidence wiring checks; exit 1 on failure. */
function main(): void {
  validateRequiredFiles();
  validateEvidenceMarkers();
  console.log("All evidence wiring checks passed.");
}

main();
