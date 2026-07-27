/**
 * Root script: `pnpm validate:schemas`
 *
 * Validates shared fixtures against on-disk JSON Schemas (P0 monorepo gate):
 * - work-record package sample package
 * - Motif corpus (sketch + partial)
 * - movement_annotation demo
 * Also enforces corpus directory count ≥ 3 (MvEI Q4).
 *
 * Exit 1 on any failure - used by CI and alpha:check.
 */
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import AjvModule from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  hasSafeRepositoryPath,
  readRepositoryText,
  resolveExistingRepositoryPath,
} from "./repository-files.mjs";

const Ajv = (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule;
type AjvValidate = ((data: unknown) => boolean) & {
  errors?: { instancePath?: string; message?: string }[] | null;
};
const ajv = new (Ajv as unknown as new (opts: object) => {
  compile: (s: object) => AjvValidate;
  errorsText: (errors?: unknown) => string;
})({ allErrors: true, strict: false });
const applyFormats =
  (addFormats as unknown as { default?: (instance: unknown) => void }).default ??
  (addFormats as unknown as (instance: unknown) => void);
applyFormats(ajv);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** One schema file + the fixtures that must validate against it. */
type Job = { schema: string; fixtures: string[] };

const jobs: Job[] = [
  {
    schema: "packages/work-record-package/schemas/work-record-package.schema.json",
    fixtures: [
      "packages/work-record-package/fixtures/sample-work-record-package.json",
    ],
  },
  {
    schema: "packages/movement-encode/schemas/mvei-motif-stub.schema.json",
    fixtures: [
      "packages/movement-encode/fixtures/corpus/motif-sketch-01.json",
      "packages/movement-encode/fixtures/corpus/motif-partial-02.json",
      "fixtures/demo/motif.json",
    ],
  },
  {
    schema:
      "packages/movement-encode/schemas/mvei-laban-subset.schema.json",
    fixtures: [
      "packages/movement-encode/fixtures/corpus/laban-subset-01.json",
      "packages/movement-encode/fixtures/corpus/laban-subset-02.json",
      "packages/movement-encode/fixtures/corpus/laban-subset-03-dense.json",
      "packages/movement-encode/fixtures/corpus/laban-subset-04.json",
      "packages/movement-encode/fixtures/corpus/laban-subset-05.json",
      "packages/movement-encode/fixtures/corpus/laban-subset-06.json",
    ],
  },
  {
    schema:
      "packages/movement-encode/schemas/movement-annotation-v0.schema.json",
    fixtures: [
      "packages/movement-encode/fixtures/corpus/annotation-v0-demo.json",
    ],
  },
];

/** Load one contained UTF-8 JSON repository file. */
function loadJson(path: string): unknown {
  return JSON.parse(readRepositoryText(root, path));
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

// Ensure corpus has at least 3 pedagogical samples
const corpus = "packages/movement-encode/fixtures/corpus";
const corpusFiles = hasSafeRepositoryPath(root, corpus)
  ? readdirSync(resolveExistingRepositoryPath(root, corpus).absolute).filter((n) => n.endsWith(".json"))
  : [];
if (corpusFiles.length < 3) {
  console.error("FAIL corpus count < 3:", corpusFiles.length);
  failed++;
} else {
  console.log("OK   corpus count", corpusFiles.length);
}

if (failed > 0) {
  console.error(`\n${failed} validation error(s)`);
  process.exit(1);
}
console.log("\nAll schema fixtures valid.");
