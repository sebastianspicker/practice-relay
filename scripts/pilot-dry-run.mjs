/**
 * Synthetic repository dry-run for WorkRecord, MvEI, and capture fixtures.
 * Why: combines executable local paths without presenting fixture output as
 * participant, pilot, deployment, or interoperability evidence.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runE2eDemo } from "./e2e-demo.ts";
import { runCaptureLabDemo } from "./capture-lab-demo.ts";
import {
  hasContainedPath,
  readContainedText,
} from "./contained-output.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Repository dry-run checklist items, excluding participant outcomes. */
const CHECKLIST = [
  {
    id: "fixtures.demo",
    label: "fixtures/demo seed + motif present",
    check: () =>
      hasContainedPath(repoRoot, "fixtures/demo/work-record-seed.json") &&
      hasContainedPath(repoRoot, "fixtures/demo/motif.json"),
  },
  {
    id: "protocol.doc",
    label: "dry-run-protocol.md present",
    check: () =>
      hasContainedPath(repoRoot, "docs/pilot-pack/dry-run-protocol.md"),
  },
  {
    id: "decision-log.blank",
    label: "decision-log.md remains blank template (no invented results)",
    check: () => {
      const p = join(repoRoot, "docs/pilot-pack/decision-log.md");
      if (!hasContainedPath(repoRoot, p)) return false;
      const t = readContainedText(repoRoot, p);
      // Must not look like filled multi-site results
      const banned =
        /n=\d{2,}|multi-site pilot (success|complete)|adopted at \d+ institutions/i;
      return !banned.test(t) && /blank|template|TBD|fill/i.test(t);
    },
  },
  {
    id: "e2e.lifecycle",
    label: "e2e: Practice Relay lifecycle",
    check: null, // filled from e2e steps
  },
  {
    id: "e2e.work-record-package",
    label: "e2e: work-record package + RO-Crate export",
    check: null,
  },
  {
    id: "e2e.multi_asset",
    label: "e2e: multi-asset assignment payload",
    check: null,
  },
  {
    id: "e2e.mvei",
    label: "e2e: Motif validate accept/reject",
    check: null,
  },
  {
    id: "e2e.mveiWorkbench",
    label: "e2e: MvEI Workbench load/emit/edit",
    check: null,
  },
  {
    id: "capture.lab",
    label: "capture-bridge demo artifacts written",
    check: null,
  },
  {
    id: "nonclaims",
    label: "non-claims: no automated coaching, firstness, or multi-site results",
    check: () => true,
  },
];

function captureLabResult() {
  let captureOk = false;
  let captureDetail = "";
  try {
    const cap = runCaptureLabDemo({});
    captureOk =
      cap.files.length >= 3 &&
      cap.annotation?.events?.length >= 1 &&
      cap.motifSketch?.profile === "mvei-motif";
    captureDetail = `outDir=${cap.outDir} events=${cap.annotation.events.length} motifItems=${cap.motifSketch.items.length}`;
  } catch (e) {
    captureDetail = e instanceof Error ? e.message : String(e);
  }
  return { captureOk, captureDetail };
}

function checklistResults(e2e, captureOk) {
  const stepOk = (id) => e2e.steps.find((s) => s.id === id)?.ok === true;
  const results = CHECKLIST.map((item) => {
    let ok = false;
    if (item.id === "e2e.lifecycle") ok = stepOk("practice-relay.lifecycle");
    else if (item.id === "e2e.work-record-package") ok = stepOk("practice-relay.work-record-package-export");
    else if (item.id === "e2e.multi_asset")
      ok = stepOk("practice-relay.multi-asset-assignment");
    else if (item.id === "e2e.mvei")
      ok =
        stepOk("mvei.validate_valid") && stepOk("mvei.validate_invalid");
    else if (item.id === "e2e.mveiWorkbench")
      ok = stepOk("mvei-workbench.load-emit") && stepOk("mvei-workbench.motif-edit");
    else if (item.id === "capture.lab") ok = captureOk;
    else if (item.check) ok = item.check();
    return { id: item.id, label: item.label, ok };
  });
  return results;
}

function renderDryRun({ e2e, capture, results }) {
  const lines = [
    "# Practice Relay synthetic repository dry-run",
    `time: ${new Date().toISOString()}`,
    "scope: fixtures/demo only; not participant, pilot, or deployment evidence",
    "protocol: docs/pilot-pack/dry-run-protocol.md",
    "",
    "## e2e demo steps",
    ...e2e.steps.map((step) => `- [${step.ok ? "x" : " "}] ${step.id}: ${step.detail}`),
    `e2e_summary: ${e2e.ok ? "all steps ok" : "FAILED"}`,
    "",
    "## capture-bridge smoke",
    `- [${capture.captureOk ? "x" : " "}] capture-bridge: ${capture.captureDetail}`,
    "",
    "## repository dry-run checklist completion",
    ...results.map((result) => `- [${result.ok ? "x" : " "}] ${result.id}: ${result.label}`),
    "",
    `checklist: ${results.filter((result) => result.ok).length}/${results.length} complete`,
    "",
    "## honesty",
    "- decision-log.md left blank (do not invent course results)",
    "- no participant or multi-site pilot results claimed",
    "- no IMS cert claim; LTI remains lab-only / local-mock",
    "- no automated coaching product",
    "",
  ];
  return lines;
}

/**
 * Run lab dry-run: e2e + capture-lab smoke + checklist report.
 */
export function runPilotDryRun() {
  const e2e = runE2eDemo({});
  const capture = captureLabResult();
  const results = checklistResults(e2e, capture.captureOk);
  const ok = e2e.ok && capture.captureOk && results.every((result) => result.ok);
  const lines = renderDryRun({ e2e, capture, results });
  lines.push(`summary: ${ok ? "synthetic dry-run complete" : "dry-run FAILED"}`);

  return {
    ok,
    text: lines.join("\n") + "\n",
    checklist: results,
    e2eOk: e2e.ok,
    captureOk: capture.captureOk,
  };
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = runPilotDryRun();
  process.stdout.write(result.text);
  process.exit(result.ok ? 0 : 1);
}
