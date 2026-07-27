#!/usr/bin/env node
/**
 * Maturity-check CLI and public scorecard API.
 *
 * This thin entrypoint preserves the repository's machine-readable maturity
 * contract while delegating evidence collection to bounded, maintainable modules.
 *
 * Usage: node scripts/maturity-check.mjs
 *        pnpm maturity:check
 */
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runFunctionalGates } from "./maturity-functional-gates.mjs";
import { readRootScripts, readSourceFamily } from "./maturity-runtime.mjs";
import { addCoreDimensions } from "./maturity-snapshot-dimensions.mjs";
import { addReadinessDimensions } from "./maturity-readiness-dimensions.mjs";
import {
  hasSafeRepositoryPath,
  readRepositoryText,
} from "./repository-files.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const here = fileURLToPath(import.meta.url);

/** @typedef {"strong"|"lab-mature"|"weak"} Level */
/** @typedef {{ id: string, label: string, target: Level, level: Level, evidence: string[], ok: boolean, nonClaim?: string }} DimensionResult */

function levelAtLeast(a, b) {
  const rank = { weak: 0, "lab-mature": 1, strong: 2 };
  return rank[a] >= rank[b];
}

function addGateRows({ push, fx }) {
  const gates = [
    ["gate-validate-schemas", "validate:schemas", fx.schemas],
    ["gate-lab-only-claims", "test:lab-only-claims", fx.labOnly],
    ["gate-kill-switches", "test:kill-switches", fx.killSwitches],
    ["gate-publish-dry-run", "publish:dry-run", fx.publish],
    ["gate-ops-restore", "test:ops-restore", fx.opsRestore],
    ["gate-ops-slo", "test:ops-slo", fx.opsSlo],
    ["gate-multi-asset-lti", "multi-asset LTI", fx.multiAsset],
    ["gate-federation-import", "federation import", fx.federation],
    ["gate-osc-stage", "osc stage", fx.osc],
    ["gate-triple-impl", "validate+engrave+read", fx.tripleImpl],
    ["gate-mveiWorkbench-sync", "mveiWorkbench history/sync", fx.mveiWorkbenchSync],
    ["gate-web-shell", "Practice Relay web shell", fx.webShell],
    ["gate-pilot-dry-run", "pilot dry-run", fx.pilotDryRun],
    ["gate-work-record-core-contracts", "WorkRecord Core contracts functional", fx.contracts],
  ];
  for (const [id, label, gate] of gates) {
    push({
      id,
      label: `Automated gate: ${label}`,
      target: "strong",
      level: gate?.ok ? "strong" : "weak",
      evidence: [gate?.ok ? gate.detail : `FAIL: ${gate?.detail || "missing"}`],
    });
  }
}

/**
 * Evaluate every residual maturity dimension without weakening NON-CLAIM bars.
 *
 * @param {{ skipHeavy?: boolean }} [opts] omit executable probes for structural tests.
 * @returns {{ ok: boolean, dimensions: DimensionResult[], summary: string }} scorecard result.
 */
export function evaluateMaturity(opts = {}) {
  /** @type {DimensionResult[]} */
  const dimensions = [];
  const heavy = !opts.skipHeavy;
  const fx = heavy
    ? runFunctionalGates({ root, scripts: readRootScripts({ root }) })
    : {};
  const push = (dimension) => {
    dimensions.push({
      ...dimension,
      ok: levelAtLeast(dimension.level, dimension.target),
    });
  };
  const evidence = {
    push,
    mustExist: (path) => hasSafeRepositoryPath(root, path),
    read: (path) => readRepositoryText(root, path),
    readSourceFamily: ({ relativeDirectory }) =>
      readSourceFamily({ root, relativeDirectory }),
    heavy,
    fx,
    root,
  };
  addCoreDimensions(evidence);
  addReadinessDimensions(evidence);
  if (heavy) addGateRows({ push, fx });
  const failed = dimensions.filter((dimension) => !dimension.ok);
  const ok = failed.length === 0;
  const strongCount = dimensions.filter(
    (dimension) => dimension.level === "strong",
  ).length;
  const summary = ok
    ? `OK   maturity: all ${dimensions.length} rows ≥ strong (${strongCount} strong)`
    : `FAIL maturity: ${failed.length} below strong: ${failed
        .map((dimension) => `${dimension.id}[${dimension.level}]`)
        .join(", ")}`;
  return { ok, dimensions, summary };
}

function main() {
  const { ok, dimensions, summary } = evaluateMaturity({
    skipHeavy: false,
  });
  console.log("# Practice Relay maturity scorecard (target: strong)\n");
  for (const dimension of dimensions) {
    console.log(
      `${dimension.ok ? "PASS" : "FAIL"}  [${dimension.level.padEnd(10)}] ${dimension.label}  (target ${dimension.target})`,
    );
    for (const item of dimension.evidence) console.log(`       · ${item}`);
    if (dimension.nonClaim) {
      console.log(`       · NON-CLAIM: ${dimension.nonClaim}`);
    }
  }
  console.log("\n" + summary);
  process.exit(ok ? 0 : 1);
}

const invoked = process.argv[1] &&
  (() => {
    try {
      return realpathSync(process.argv[1]) === realpathSync(here);
    } catch {
      return process.argv[1].includes("maturity-check");
    }
  })();

if (invoked) main();
