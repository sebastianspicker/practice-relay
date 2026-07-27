/**
 * Staged OSC validation harness - load demo WorkRecord → ossia hint + Max dict
 * under test-results/generated-fixtures/osc/, assert multi-asset addresses non-empty.
 *
 * Document projection only - not a show-control runtime.
 *
 * Usage (repo root):
 *   pnpm test:osc-stage
 *   node --import tsx scripts/osc-stage-validate.mjs
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  projectOscBundle,
  toOssianHint,
  toMaxDict,
} from "../packages/interop/src/index.ts";
import {
  readContainedText,
  writeContainedText,
} from "./contained-output.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = join(repoRoot, "fixtures/demo/work-record-seed.json");
const stagedDir = join(repoRoot, "test-results/generated-fixtures/osc");

/**
 * Map demo seed JSON to the bounded multi-asset OSC document projection.
 */
function loadDemoRecord() {
  const seed = JSON.parse(readContainedText(repoRoot, seedPath));
  const region = seed.region;
  return {
    id: seed.id,
    title: seed.title,
    preferredTakeId: seed.preferredTakeId ?? null,
    tracks: (seed.tracks ?? []).map((t) => ({
      id: t.id,
      type: t.type,
      label: t.label,
      ref: t.ref,
    })),
    takes: seed.takes ?? [],
    spine: {
      durationMs: Math.max(60_000, region?.endMs ?? 0),
      regions: region
        ? [
            {
              id: region.id,
              startMs: region.startMs,
              endMs: region.endMs,
              label: region.label,
            },
            {
              id: "reg-phrase-b",
              startMs: region.endMs,
              endMs: region.endMs + 8000,
              label: "Phrase B (bars 9–16)",
            },
          ]
        : [],
    },
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function writeStagePatches({ ossia, maxDict }) {
  writeContainedText(
    repoRoot,
    join(stagedDir, "ossia-receive-hint.json"),
    JSON.stringify(ossia, null, 2) + "\n",
  );
  writeContainedText(
    repoRoot,
    join(stagedDir, "max-dict-patch.json"),
    JSON.stringify(maxDict, null, 2) + "\n",
  );
}

function assertMessageProjection(record, messages) {
  assert(messages.length > 0, "projectOscBundle produced zero messages");
  assert(
    (record.tracks?.length ?? 0) >= 2,
    "demo WorkRecord must be multi-asset (≥2 tracks)",
  );

  const addresses = messages.map((m) => m.address);
  for (const a of addresses) {
    assert(typeof a === "string" && a.length > 0, "empty OSC address");
    assert(a.startsWith("/practice-relay/"), `address not under /practice-relay/: ${a}`);
  }

  for (const suffix of ["/region", "/track", "/preferred_take"]) {
    assert(addresses.some((address) => address.endsWith(suffix)), `missing ${suffix} address`);
  }
  const trackMsgs = messages.filter((m) => m.address.endsWith("/track"));
  assert(
    trackMsgs.length >= 2,
    `expected multi-asset track cues ≥2, got ${trackMsgs.length}`,
  );
  return { addresses, trackMsgs, trackTypes: new Set(trackMsgs.map((m) => String(m.args[1] ?? ""))) };
}

function assertStageAdapters({ ossia, maxDict }) {
  assert(
    ossia.kind === "practice-relay-ossia-hint" &&
      ossia.receiveAddresses?.length >= 3 &&
      ossia.cues?.length >= 3 &&
      ossia.receiveAddresses.every((route) => route.address && route.address.length > 0),
    "invalid ossia projection",
  );
  assert(ossia.kind === "practice-relay-ossia-hint", "ossia kind");
  assert(
    maxDict.kind === "practice-relay-max-dict" &&
      maxDict.routeTree?.length >= 3 &&
      maxDict.dict?.cues?.length >= 3 &&
      maxDict.routeTree.every((route) => route.pattern && route.pattern.length > 0),
    "invalid Max projection",
  );
}

function stageSummary(record, messages, projection) {
  return {
    kind: "practice-relay-osc-stage-summary",
    schemaVersion: "0.4.0",
    workRecordId: record.id,
    stagedDir: "test-results/generated-fixtures/osc",
    files: [
      "ossia-receive-hint.json",
      "max-dict-patch.json",
      "stage-summary.json",
      "README.md",
    ],
    messageCount: messages.length,
    trackCueCount: projection.trackMsgs.length,
    trackTypes: [...projection.trackTypes],
    addressesSample: [...new Set(projection.addresses)],
    note:
      "Staged validation only - not a runtime, not binary Max/ossia project files.",
  };
}

function writeStageSummary(summary) {
  writeContainedText(
    repoRoot,
    join(stagedDir, "stage-summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  writeContainedText(
    repoRoot,
    join(stagedDir, "README.md"),
    [
      "# Staged OSC patches",
      "",
      "Produced by `pnpm test:osc-stage` from `fixtures/demo/work-record-seed.json`.",
      "",
      "| File | API |",
      "|------|-----|",
      "| `ossia-receive-hint.json` | `toOssianHint` |",
      "| `max-dict-patch.json` | `toMaxDict` |",
      "| `stage-summary.json` | harness summary |",
      "",
      "Not binary Max/ossia show files. See `practice-relay/docs/osc-federation.md` § Staged validation.",
      "",
    ].join("\n"),
  );
}

/**
 * Run staged validation: write patches, check addresses multi-asset non-empty.
 */
export function runOscStageValidate() {
  const record = loadDemoRecord();
  const messages = projectOscBundle(record);
  const ossia = toOssianHint(record);
  const maxDict = toMaxDict(record);
  writeStagePatches({ ossia, maxDict });
  const projection = assertMessageProjection(record, messages);
  assert(projection.trackTypes.size >= 2, `expected ≥2 distinct track types, got ${[...projection.trackTypes].join(",")}`);
  assertStageAdapters({ ossia, maxDict });
  const summary = stageSummary(record, messages, projection);
  writeStageSummary(summary);
  return {
    ok: true,
    stagedDir,
    files: summary.files,
    summary,
  };
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const result = runOscStageValidate();
    console.log(
      JSON.stringify(
        {
          ok: true,
          stagedDir: result.stagedDir,
          files: result.files,
          messageCount: result.summary.messageCount,
          trackTypes: result.summary.trackTypes,
          addresses: result.summary.addressesSample,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  } catch (e) {
    console.error(
      "osc-stage-validate FAILED:",
      e instanceof Error ? e.message : e,
    );
    process.exit(1);
  }
}
