/**
 * Practice Relay alpha e2e demo - drives shipped entry points only.
 *
 * Scenario: fixtures/demo (multi-asset WorkRecord + MvEI Motif).
 * Steps: Practice Relay lifecycle → WorkRecord package + RO-Crate export → multi-asset assignment →
 *        Motif validate accept/reject → MvEI Workbench load/emit/edit of the same Motif.
 *
 * Usage:
 *   pnpm demo:e2e
 *   pnpm demo:e2e -- --log fixtures/demo/last-e2e-demo.txt
 *
 * Exports runE2eDemo() for acceptance tests (no process.exit when imported).
 */
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  addComment,
  addMember,
  addRegion,
  addTake,
  addTrack,
  attachUsePolicySnapshot,
  attachMveiMotifTrack,
  createEmptyRecord,
  resolveComment,
  setPreferredTake,
  submitVersion,
  type WorkRecord,
  type Role,
  type TrackType,
} from "@practice-relay/work-record-core";
import {
  exportWorkRecordPackage,
  validateRoCrateMetadata,
  WORK_RECORD_PACKAGE_PROFILE_URI,
  RO_CRATE_CONTEXT,
} from "@practice-relay/work-record-package";
import { validateMveiDocument } from "../mvei/packages/validator/src/cli.ts";
import {
  loadMotif,
  emitMotif,
  addItem,
  updateItem,
  removeItem,
  reorderItems,
} from "../mvei/apps/workbench/src/motif.mjs";
import { validateMotifAgainstSchema } from "../mvei/apps/workbench/src/validate-motif.mjs";
import {
  buildMultiAssetAssignmentPayload,
  validateMultiAssetAssignmentPayload,
  LTI_STATUS,
  LTI_ASSIGNMENT_PAYLOAD_STATUS,
} from "../practice-relay/apps/lti/src/index.mjs";
import {
  readContainedText,
  writeContainedText,
} from "./contained-output.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_DIR = join(root, "fixtures/demo");
const SEED_PATH = join(DEMO_DIR, "work-record-seed.json");
const MOTIF_PATH = join(DEMO_DIR, "motif.json");

/** One evidence-bearing step emitted by the shipped-entry-point demo. */
export type DemoStep = {
  id: string;
  ok: boolean;
  detail: string;
  /** Optional structured payload for tests (never a fake "PASS" alone). */
  data?: Record<string, unknown>;
};

/** Aggregate result and human-readable log for the end-to-end demo. */
export type DemoResult = {
  ok: boolean;
  steps: DemoStep[];
  logText: string;
};

type Seed = {
  id: string;
  title: string;
  members: { userId: string; role: Role }[];
  tracks: { id: string; type: TrackType; label?: string; ref?: string }[];
  takes: { id: string; label?: string; mediaPath?: string }[];
  preferredTakeId: string;
  region: { id: string; label?: string; startMs: number; endMs: number };
  comment: {
    id: string;
    regionId: string;
    trackId?: string;
    authorId: string;
    body: string;
    resolved?: boolean;
  };
  consent: {
    id: string;
    subjectId: string;
    purposes: string[];
    exportAllowed?: boolean;
  };
  motif: { trackId: string; label?: string; ref: string };
  submitTag: string;
};

function loadSeed(): Seed {
  return JSON.parse(readContainedText(root, SEED_PATH)) as Seed;
}

function loadMotifJson(): unknown {
  return JSON.parse(readContainedText(root, MOTIF_PATH));
}

/** Build a WorkRecord from the demo seed via domain constructors only. */
export function buildDemoScoreFromSeed(seed: Seed = loadSeed()): WorkRecord {
  let score = createEmptyRecord(seed.id, seed.title);

  for (const m of seed.members) {
    score = addMember(score, m);
  }
  for (const t of seed.tracks) {
    score = addTrack(score, t);
  }
  for (const take of seed.takes) {
    score = addTake(score, take);
  }
  score = setPreferredTake(score, seed.preferredTakeId);
  score = addRegion(score, seed.region);
  score = addComment(score, {
    id: seed.comment.id,
    regionId: seed.comment.regionId,
    trackId: seed.comment.trackId,
    authorId: seed.comment.authorId,
    body: seed.comment.body,
    resolved: seed.comment.resolved ?? false,
  });
  score = attachUsePolicySnapshot(score, {
    id: seed.consent.id,
    subjectId: seed.consent.subjectId,
    purposes: seed.consent.purposes,
    exportAllowed: seed.consent.exportAllowed ?? true,
    createdAt: new Date().toISOString(),
  });
  // Motif ref is relative to monorepo root - real path, not a "mock" string
  const motifRef = seed.motif.ref.startsWith("/")
    ? seed.motif.ref
    : join(root, seed.motif.ref);
  score = attachMveiMotifTrack(score, {
    id: seed.motif.trackId,
    label: seed.motif.label,
    ref: motifRef,
  });
  score = resolveComment(score, seed.comment.id);
  score = submitVersion(score, seed.submitTag);
  return score;
}

function formatLog(steps: DemoStep[]): string {
  const lines = [
    `# Practice Relay alpha e2e demo log`,
    `time: ${new Date().toISOString()}`,
    `demo_dir: ${DEMO_DIR}`,
    "",
  ];
  for (const s of steps) {
    const status = s.ok ? "OK" : "FAIL";
    lines.push(`[${status}] ${s.id}: ${s.detail}`);
    if (s.data) {
      for (const [k, v] of Object.entries(s.data)) {
        lines.push(`  ${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
      }
    }
  }
  const allOk = steps.every((s) => s.ok);
  lines.push("");
  lines.push(`summary: ${allOk ? "all steps ok" : "one or more steps failed"}`);
  lines.push(`step_count: ${steps.length}`);
  return lines.join("\n") + "\n";
}

/**
 * Run the full e2e demo against shipped modules.
 * Writes structured log when logPath is set.
 */
export function runE2eDemo(opts: { logPath?: string } = {}): DemoResult {
  const steps: DemoStep[] = [];
  const seed = loadSeed();

  // --- Practice Relay lifecycle ---
  let score: WorkRecord;
  try {
    score = buildDemoScoreFromSeed(seed);
    const trackTypes = new Set(score.tracks.map((t) => t.type));
    steps.push({
      id: "practice-relay.lifecycle",
      ok:
        score.id === seed.id &&
        trackTypes.size >= 4 &&
        score.preferredTakeId === seed.preferredTakeId &&
        score.usePolicySnapshots.length > 0 &&
        score.comments.some((c) => c.id === seed.comment.id && c.resolved) &&
        score.tracks.some((t) => t.type === "movement_notation"),
      detail: `record ${score.id} tracks=${score.tracks.length} types=${trackTypes.size} preferred=${score.preferredTakeId} comments_resolved=${score.comments.filter((c) => c.resolved).length}`,
      data: {
        id: score.id,
        trackTypes: [...trackTypes],
        preferredTakeId: score.preferredTakeId,
        purposes: score.usePolicySnapshots.flatMap((c) => c.purposes),
      },
    });
  } catch (e) {
    steps.push({
      id: "practice-relay.lifecycle",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
    const logText = formatLog(steps);
    if (opts.logPath) {
      writeContainedText(root, opts.logPath, logText);
    }
    return { ok: false, steps, logText };
  }

  // --- WorkRecord package export + RO-Crate 1.3 ---
  try {
    const { manifest, roCrateMetadata, validated } = exportWorkRecordPackage(score);
    const profileOk =
      typeof manifest.profile === "string" &&
      manifest.profile.length > 0 &&
      manifest.profile === WORK_RECORD_PACKAGE_PROFILE_URI;
    const crateCheck = validateRoCrateMetadata(roCrateMetadata);
    const root = roCrateMetadata["@graph"].find((n) => n["@id"] === "./") as
      | Record<string, unknown>
      | undefined;
    const crateIdMatch =
      root?.["workRecord:workRecordId"] === manifest.workRecordId;
    const crateMveiMatch = root?.["workRecord:mveiRef"] === manifest.mveiRef;
    steps.push({
      id: "practice-relay.work-record-package-export",
      ok:
        validated === true &&
        profileOk &&
        crateCheck.ok === true &&
        crateIdMatch &&
        roCrateMetadata["@context"] === RO_CRATE_CONTEXT,
      detail: `validated=${validated} profile=${manifest.profile} roCrate=${crateCheck.ok} mveiMatch=${crateMveiMatch}`,
      data: {
        profile: manifest.profile,
        workRecordId: manifest.workRecordId,
        trackCount: manifest.tracks.length,
        preferredTakeId: manifest.preferredTakeId,
        mveiRef: manifest.mveiRef,
        roCrateContext: roCrateMetadata["@context"],
        roCrateWorkRecordId: root?.["workRecord:workRecordId"],
      },
    });
  } catch (e) {
    steps.push({
      id: "practice-relay.work-record-package-export",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // --- Multi-asset assignment payload (LTI data shape; local-mock handshake) ---
  try {
    const payload = buildMultiAssetAssignmentPayload(score);
    const check = validateMultiAssetAssignmentPayload(payload);
    const multi =
      payload.assetMode === "multi-asset" &&
      payload.singleVideoUrl === null &&
      payload.trackTypes.length >= 4 &&
      payload.packageId === score.id &&
      payload.preferredTakeId === score.preferredTakeId &&
      (LTI_STATUS === "local-mock" || LTI_STATUS === "stub") &&
      LTI_ASSIGNMENT_PAYLOAD_STATUS === "ready";
    steps.push({
      id: "practice-relay.multi-asset-assignment",
      ok: check.ok === true && multi,
      detail: `packageId=${payload.packageId} trackTypes=${payload.trackTypes.length} preferred=${payload.preferredTakeId} consentRequired=${payload.consentRequired} handshake=${payload.ltiHandshakeStatus}`,
      data: {
        packageId: payload.packageId,
        trackTypes: payload.trackTypes,
        preferredTakeId: payload.preferredTakeId,
        consentRequired: payload.consentRequired,
        mveiRef: payload.mveiRef,
        assetMode: payload.assetMode,
        singleVideoUrl: payload.singleVideoUrl,
      },
    });
  } catch (e) {
    steps.push({
      id: "practice-relay.multi-asset-assignment",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // --- Motif valid ---
  try {
    readContainedText(root, MOTIF_PATH);
    const valid = validateMveiDocument(MOTIF_PATH);
    steps.push({
      id: "mvei.validate_valid",
      ok: valid.ok === true,
      detail: valid.message,
      data: { path: MOTIF_PATH },
    });
  } catch (e) {
    steps.push({
      id: "mvei.validate_valid",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // --- Motif invalid (expect failure) ---
  const invalidDir = mkdtempSync(join(tmpdir(), "practice-relay-e2e-invalid-"));
  try {
    const badPath = join(invalidDir, "invalid-empty.json");
    writeContainedText(invalidDir, badPath, "{}\n");
    const invalid = validateMveiDocument(badPath);
    steps.push({
      id: "mvei.validate_invalid",
      ok: invalid.ok === false,
      detail: invalid.ok
        ? "expected reject but validator accepted empty object"
        : `rejected as expected: ${invalid.message}`,
      data: { rejected: !invalid.ok, message: invalid.message },
    });
  } catch (e) {
    steps.push({
      id: "mvei.validate_invalid",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  } finally {
    rmSync(invalidDir, { recursive: true, force: true });
  }

  // --- MvEI Workbench load / emit / schema validate ---
  try {
    const raw = loadMotifJson();
    const doc = loadMotif(raw);
    const emitted = emitMotif(doc);
    const round = loadMotif(emitted);
    const schema = validateMotifAgainstSchema(doc);
    steps.push({
      id: "mvei-workbench.load-emit",
      ok:
        doc.profile === "mvei-motif" &&
        doc.items.length > 0 &&
        round.id === doc.id &&
        schema.ok === true,
      detail: `id=${doc.id} items=${doc.items.length} schema=${schema.message} roundTripId=${round.id}`,
      data: {
        id: doc.id,
        completeness: doc.completeness,
        itemCount: doc.items.length,
        schemaOk: schema.ok,
      },
    });
  } catch (e) {
    steps.push({
      id: "mvei-workbench.load-emit",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // --- MvEI Workbench Motif item edit ops → emit → shared schema → load ---
  try {
    let doc = loadMotif(loadMotifJson());
    const originalCount = doc.items.length;
    const firstId = doc.items[0]?.id;
    if (!firstId) throw new Error("demo Motif has no items to edit");

    doc = addItem(doc, {
      id: "e2e-edit-item",
      symbol: "e2e-gesture",
    });
    doc = updateItem(doc, "e2e-edit-item", { symbol: "e2e-gesture-updated" });
    const ids = doc.items.map((i) => i.id);
    // move new item to front
    doc = reorderItems(doc, ["e2e-edit-item", ...ids.filter((id) => id !== "e2e-edit-item")]);
    doc = removeItem(doc, "e2e-edit-item");
    if (doc.items.length !== originalCount) {
      throw new Error(`edit cycle length drift: ${doc.items.length} vs ${originalCount}`);
    }

    const emitted = emitMotif(doc);
    const reloaded = loadMotif(emitted);
    const schema = validateMotifAgainstSchema(reloaded);
    steps.push({
      id: "mvei-workbench.motif-edit",
      ok:
        schema.ok === true &&
        reloaded.profile === "mvei-motif" &&
        reloaded.items.length === originalCount &&
        !reloaded.items.some((i) => i.id === "e2e-edit-item"),
      detail: `items=${reloaded.items.length} schema=${schema.message} firstId=${firstId}`,
      data: {
        id: reloaded.id,
        completeness: reloaded.completeness,
        itemCount: reloaded.items.length,
        schemaOk: schema.ok,
      },
    });
  } catch (e) {
    steps.push({
      id: "mvei-workbench.motif-edit",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  const ok = steps.every((s) => s.ok);
  const logText = formatLog(steps);
  if (opts.logPath) {
    writeContainedText(root, opts.logPath, logText);
  }
  return { ok, steps, logText };
}

function parseLogArg(argv: string[]): string | undefined {
  const i = argv.indexOf("--log");
  if (i >= 0 && argv[i + 1]) return resolve(argv[i + 1]);
  const eq = argv.find((a) => a.startsWith("--log="));
  if (eq) return resolve(eq.slice("--log=".length));
  return undefined;
}

function main(): void {
  const logPath = parseLogArg(process.argv.slice(2));
  const result = runE2eDemo(logPath ? { logPath } : {});
  process.stdout.write(result.logText);
  if (logPath) console.log(`log written: ${logPath}`);
  process.exit(result.ok ? 0 : 1);
}

const entryHref = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === entryHref) {
  main();
}
