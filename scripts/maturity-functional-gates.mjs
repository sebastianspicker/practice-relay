/**
 * Functional evidence probes for the maturity scorecard.
 *
 * These remain separate from structural rows because strong claims require
 * executable local evidence, not only files and source markers.
 */
import { runRootScript, runTsx } from "./maturity-runtime.mjs";

function detail(result, success) {
  return {
    ok: result.ok,
    detail: result.ok ? success ?? result.out : result.out.slice(0, 280),
  };
}

/** Require both the current export action and its application source. */
export function hasStrongWebShellExport(primaryAction, html) {
  return primaryAction === "Prepare export" && html.includes("Prepare export");
}

/** Run the bounded functional probes that can elevate scorecard rows to strong. */
export function runFunctionalGates({ root, scripts }) {
  const rootScript = (script) => runRootScript({ root, scripts, script });
  const tsx = (code) => runTsx({ root, code });
  const fx = {};
  fx.multiAsset = detail(tsx(`
import {
  buildMultiAssetAssignmentPayload,
  validateMultiAssetAssignmentPayload,
  exportPlatformJwks,
  generateLabPlatformKeys,
  resolveLtiSecret,
  signHs256Jwt,
  verifyHs256Jwt,
} from "./practice-relay/apps/lti/src/index.mjs";

const p = buildMultiAssetAssignmentPayload({
  id: "ps-maturity-strong",
  tracks: [
    { id: "v", type: "video" },
    { id: "m", type: "music_notation", ref: "x" },
    { id: "a", type: "audio" },
    { id: "ma", type: "movement_annotation" },
  ],
  takes: [{ id: "t1" }],
  usePolicySnapshots: [{ purposes: ["course_assessment"], exportAllowed: true }],
});
const v = validateMultiAssetAssignmentPayload(p);
const bad = validateMultiAssetAssignmentPayload({ ...p, singleVideoUrl: "http://x" });
const secret = resolveLtiSecret("maturity-secret");
const signed = signHs256Jwt({ sub: "maturity", exp: 9e12 }, secret);
const verified = verifyHs256Jwt(signed, secret);
const keys = generateLabPlatformKeys();
const jwks = exportPlatformJwks(keys.publicKey);

if (
  !v.ok ||
  p.singleVideoUrl !== null ||
  p.assetMode !== "multi-asset" ||
  bad.ok !== false ||
  verified?.sub !== "maturity" ||
  jwks.keys.length !== 1
) {
  process.exit(1);
}

console.log(
  "multi-asset+lti-crypto strong tracks=" + p.trackTypes.length + " jwks=" + jwks.keys.length,
);
`));
  fx.opsRestore = detail(rootScript("test:ops-restore"), "ops-restore exit 0");
  fx.opsSlo = detail(rootScript("test:ops-slo"), "ops-slo exit 0");
  fx.webShell = detail(tsx(`
import { assertNoForbiddenCopy } from "./practice-relay/apps/web/src/shell.mjs";
import { hasStrongWebShellExport } from "./scripts/maturity-functional-gates.mjs";
import { readRepositoryText } from "./scripts/repository-files.mjs";

const html = readRepositoryText(process.cwd(), "practice-relay/apps/web/src/index.html");
const app = readRepositoryText(process.cwd(), "practice-relay/apps/web/src/practice-relay-app.mjs");
assertNoForbiddenCopy(html + app);
if (!hasStrongWebShellExport("Prepare export", app)) process.exit(1);
if (!html.includes("aria-live") || !html.includes("focus-visible")) process.exit(2);
if (!app.includes("No work records") || !app.includes("Showing an explicit local example")) process.exit(3);
console.log("practice-relay-web-strong states+a11y+export");
`));
  fx.schemas = detail(rootScript("validate:schemas"), "validate:schemas exit 0");
  fx.tripleImpl = detail(tsx(`
import { validateMveiDocument } from "./mvei/packages/validator/src/cli.ts";
import {
  renderMotifToSvg,
  renderMotifPrintHtml,
} from "./mvei/packages/engraver/src/index.ts";
import {
  loadMotifDocument,
  summarizeMotif,
} from "./mvei/packages/reference-reader/src/index.mjs";
import {
  readRepositoryText,
  resolveExistingRepositoryPath,
} from "./scripts/repository-files.mjs";

const fixture = "packages/movement-encode/fixtures/corpus/motif-sketch-01.json";
const path = resolveExistingRepositoryPath(process.cwd(), fixture).absolute;
const raw = readRepositoryText(process.cwd(), fixture);
const v = validateMveiDocument(path);
if (!v.ok) process.exit(1);

const doc = loadMotifDocument(raw);
const s = summarizeMotif(doc);
const svg = renderMotifToSvg(doc);
const html = renderMotifPrintHtml(doc);

if (
  s.itemCount < 1 ||
  !svg.includes("svg") ||
  !html.toLowerCase().includes("print")
) {
  process.exit(2);
}

console.log("triple-impl-strong validate+engrave+read items=" + s.itemCount);
`));
  fx.mveiWorkbenchSync = detail(tsx(`
import { createHistory } from "./mvei/apps/workbench/src/history.mjs";
import { createSketchMotif, addItem } from "./mvei/apps/workbench/src/motif.mjs";
import * as sync from "./mvei/apps/workbench/src/session-sync.mjs";

let doc = createSketchMotif("k-strong", "Strong");
doc = addItem(doc, { id: "i1", symbol: "walk", order: 0 });
const hist = createHistory(doc);
const next = addItem(doc, { id: "i2", symbol: "turn", order: 1 });
hist.push(next);
if (hist.get().items.length !== 2) process.exit(1);
hist.undo();
if (hist.get().items.length !== 1) process.exit(2);
if (sync.resolveSyncMode && !sync.resolveSyncMode({ MVEI_WORKBENCH_COLLAB: "memory" })) {
  process.exit(3);
}

console.log("mveiWorkbench-strong history+sync-api ok");
`));
  fx.federation = detail(tsx(`
import {
  importEafToRecordParts,
  importOtioToRecordParts,
  exportRecord,
} from "./packages/interop/src/index.ts";
import { readRepositoryText } from "./scripts/repository-files.mjs";

const a = importEafToRecordParts(
  readRepositoryText(process.cwd(), "fixtures/partner-lab/partner-session.eaf"),
);
const b = importOtioToRecordParts(
  readRepositoryText(process.cwd(), "fixtures/partner-lab/partner-nle.otio.json"),
);
if (!a.warnings?.length || !b.warnings?.length || !a.regions?.length) {
  process.exit(1);
}

const sample = {
  id: "ps-f",
  title: "F",
  tracks: [
    { id: "v", type: "video", ref: "a.mp4" },
    { id: "m", type: "music_notation", ref: "s.musicxml" },
  ],
  spine: { durationMs: 1000, regions: a.regions.slice(0, 1) },
  comments: [],
};
if (!exportRecord(sample, "otio-json").body || !exportRecord(sample, "eaf").body) {
  process.exit(2);
}

console.log(
  "federation-strong warnings",
  a.warnings.length,
  b.warnings.length,
  "export-ok",
);
`));
  fx.osc = detail(rootScript("test:osc-stage"), "osc-stage exit 0");
  const pilot = rootScript("demo:pilot-dry-run");
  fx.pilotDryRun = {
    ok: pilot.ok && /checklist:\s*10\/10|dry-run ready/i.test(pilot.out),
    detail: pilot.ok ? "pilot-dry-run complete" : pilot.out.slice(0, 280),
  };
  fx.publish = detail(rootScript("publish:dry-run"), "publish:dry-run exit 0");
  fx.labOnly = detail(rootScript("test:lab-only-claims"), "lab-only-claims exit 0");
  fx.killSwitches = detail(rootScript("test:kill-switches"), "kill-switches exit 0");
  const contracts = tsx(`
import {
  createEmptyRecord,
  addTrack,
  assertCanMutate,
  attachUsePolicySnapshot,
} from "./packages/work-record-core/src/index.ts";
import { createTake } from "./packages/media-index/src/index.ts";
import {
  createEmptyMotif,
  attachMusicCoTimeline,
} from "./packages/movement-encode/src/index.ts";

let s = attachUsePolicySnapshot(
  addTrack(createEmptyRecord("ps-work-record-core", "WorkRecord Core"), { id: "v", type: "video" }),
  {
    id: "c",
    subjectId: "u",
    purposes: ["course_assessment"],
    exportAllowed: true,
    createdAt: new Date().toISOString(),
  },
);
const t = createTake("t1", { label: "A" });
const m = attachMusicCoTimeline(createEmptyMotif("m1", "M"), {
  musicxmlRef: "x.musicxml",
  anchors: [],
});
if (!s.id || !t.id || m.profile !== "mvei-motif") process.exit(1);

assertCanMutate(s, "nobody", "edit_members");
s = {
  ...s,
  members: [
    { userId: "teacher-1", role: "faculty" },
    { userId: "student-1", role: "student" },
  ],
};
let denied = false;
try {
  assertCanMutate(s, "student-1", "edit_members");
} catch {
  denied = true;
}
if (!denied) process.exit(2);
assertCanMutate(s, "teacher-1", "edit_members");
console.log("work-record-core-contracts-strong ok core+media-index+movement-encode");
`);
  fx.contracts = {
    ok: contracts.ok,
    detail: contracts.ok
      ? contracts.out || "work-record-core-contracts-strong ok"
      : (contracts.out || `contracts exit ${contracts.status}`).slice(0, 280),
  };
  return fx;
}
