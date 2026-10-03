/**
 * Root check: `pnpm check:contracts`
 *
 * Validates shared fixtures against on-disk JSON Schemas (P0 monorepo gate):
 * - handoff package sample package
 * - every fixture listed in the movement corpus catalogue
 * Also enforces corpus catalogue count ≥ 3 (MvEI Q4).
 *
 * Exit 1 on any failure - used by the CI release gate.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import AjvModule from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  attachUsePolicySnapshot,
  createAbsoluteSpine,
  createEmptyRecord,
  createTake,
} from "@practice-relay/work-record";
import {
  hasSafeRepositoryPath,
  readRepositoryText,
} from "./repository-files.mjs";

const Ajv = (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule;
type AjvValidate = ((data: unknown) => boolean) & {
  errors?: { instancePath?: string; message?: string }[] | null;
};
const ajv = new (Ajv as unknown as new (opts: object) => {
  compile: (s: object) => AjvValidate;
  addSchema: (s: object) => void;
  getSchema: (id: string) => AjvValidate | undefined;
  errorsText: (errors?: unknown) => string;
})({ allErrors: true, strict: false });
const applyFormats =
  (addFormats as unknown as { default?: (instance: unknown) => void }).default ??
  (addFormats as unknown as (instance: unknown) => void);
applyFormats(ajv);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
ajv.addSchema(loadJson("packages/movement/schemas/music-co-timeline-annex.schema.json") as object);

/** One schema file + the fixtures that must validate against it. */
type Job = { schema: string; fixtures: string[] };

const jobs: Job[] = [
  {
    schema: "packages/handoff/schemas/work-record-package.schema.json",
    fixtures: [
      "packages/handoff/fixtures/sample-work-record-package.json",
    ],
  },
  ...movementCorpusJobs(),
];

const policyRecord = attachUsePolicySnapshot(
  createEmptyRecord("contract-policy", "Policy contract"),
  {
    id: "policy-snapshot-1",
    subjectId: "subject-1",
    purposes: ["course_assessment"],
    exportAllowed: true,
    createdAt: "2026-08-29T00:00:00.000Z",
  },
);

const runtimeJobs: readonly {
  schema: string;
  label: string;
  value: unknown;
}[] = [
  {
    schema: "packages/work-record/schemas/work-record.schema.json",
    label: "createEmptyRecord output",
    value: createEmptyRecord("contract-empty", "Empty contract"),
  },
  {
    schema: "packages/work-record/schemas/work-record.schema.json",
    label: "WorkRecord with policy snapshot",
    value: policyRecord,
  },
  {
    schema: "packages/work-record/schemas/time/time-core.schema.json",
    label: "createAbsoluteSpine output",
    value: createAbsoluteSpine(1_000),
  },
  {
    schema: "packages/work-record/schemas/media/media-take.schema.json",
    label: "createTake output",
    value: createTake("take-contract", {
      label: "Contract take",
      mediaPath: "media/take-contract.mp4",
      recordedAt: "2026-08-29T00:00:00.000Z",
      byteSize: 1,
    }),
  },
  {
    schema: "packages/work-record/schemas/policy/use-policy-snapshot.schema.json",
    label: "attached use-policy snapshot",
    value: policyRecord.usePolicySnapshots[0],
  },
];

/** Load one contained UTF-8 JSON repository file. */
function loadJson(path: string): unknown {
  return JSON.parse(readRepositoryText(root, path));
}

/** Derive every movement validation job from the package corpus catalogue. */
function movementCorpusJobs(): Job[] {
  const cataloguePath = "packages/movement/fixtures/corpus/index.json";
  const catalogue = loadJson(cataloguePath) as { fixtures?: unknown };
  if (!Array.isArray(catalogue.fixtures) || catalogue.fixtures.length === 0) {
    throw new TypeError(`${cataloguePath} requires a non-empty fixtures array`);
  }
  const fixturesBySchema = new Map<string, string[]>();
  for (const fixture of catalogue.fixtures) {
    if (!isCorpusFixture(fixture)) {
      throw new TypeError(`${cataloguePath} contains an invalid fixture entry`);
    }
    const schema = `packages/movement/${fixture.schema}`;
    const fixturePath = `packages/movement/fixtures/corpus/${fixture.file}`;
    const fixtures = fixturesBySchema.get(schema) ?? [];
    fixtures.push(fixturePath);
    fixturesBySchema.set(schema, fixtures);
  }
  const jobs = [...fixturesBySchema].map(([schema, fixtures]) => ({ schema, fixtures }));
  const motifJob = jobs.find(
    ({ schema }) => schema === "packages/movement/schemas/mvei-motif.schema.json",
  );
  if (!motifJob) {
    throw new TypeError(`${cataloguePath} must contain an mvei-motif fixture`);
  }
  motifJob.fixtures.push("fixtures/demo/motif.json");
  return jobs;
}

function isCorpusFixture(value: unknown): value is { file: string; schema: string } {
  if (!value || typeof value !== "object") return false;
  const fixture = value as { file?: unknown; schema?: unknown };
  return typeof fixture.file === "string" && typeof fixture.schema === "string";
}

let failed = 0;
for (const job of jobs) {
  if (!hasSafeRepositoryPath(root, job.schema)) {
    console.error("Missing schema:", job.schema);
    failed++;
    continue;
  }
  const schema = loadJson(job.schema) as object;
  const validate = ajv.compile(schema);
  for (const f of job.fixtures) {
    const data = loadJson(f);
    const ok = validate(data);
    if (!ok) {
      console.error("FAIL", f, ajv.errorsText(validate.errors));
      failed++;
    } else {
      console.log("OK  ", f);
    }
  }
}

for (const schemaPath of new Set(runtimeJobs.map((job) => job.schema))) {
  ajv.addSchema(loadJson(schemaPath) as object);
}

for (const job of runtimeJobs) {
  const schemaId = (loadJson(job.schema) as { $id?: string }).$id;
  const validate = schemaId ? ajv.getSchema(schemaId) : undefined;
  if (!validate) {
    console.error("FAIL missing runtime schema id", job.schema);
    failed++;
    continue;
  }
  if (!validate(job.value)) {
    console.error("FAIL", job.label, ajv.errorsText(validate.errors));
    failed++;
  } else {
    console.log("OK  ", job.label);
  }
}

// Ensure the authoritative corpus catalogue has at least three samples.
const corpusCatalogue = loadJson("packages/movement/fixtures/corpus/index.json") as {
  fixtures?: unknown;
};
const corpusCount = Array.isArray(corpusCatalogue.fixtures)
  ? corpusCatalogue.fixtures.length
  : 0;
if (corpusCount < 3) {
  console.error("FAIL corpus count < 3:", corpusCount);
  failed++;
} else {
  console.log("OK   corpus count", corpusCount);
}

if (failed > 0) {
  console.error(`\n${failed} validation error(s)`);
  process.exit(1);
}
console.log("\nAll schema fixtures valid.");
