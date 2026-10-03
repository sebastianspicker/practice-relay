/** Schema-backed boundary for untrusted complete WorkRecord documents. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import AjvModule from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { assertWorkRecordAggregateInvariants } from "../domain/aggregate-invariants.ts";
import type { WorkRecord } from "../domain/types.ts";

const WORK_RECORD_SCHEMA_ID = "urn:work-record:schema:work-record:0.4";
const SCHEMA_FILES = ["time/time-core.schema.json", "media/media-take.schema.json", "policy/use-policy-snapshot.schema.json", "work-record.schema.json"] as const;
type Validate = ((value: unknown) => boolean) & { errors?: unknown };
type AjvInstance = { addSchema(schema: object): AjvInstance; errorsText(errors?: unknown): string; getSchema(id: string): Validate | undefined };
let cachedValidator: { ajv: AjvInstance; validate: Validate } | undefined;

/** Parse and validate an untrusted complete WorkRecord without projecting fields. */
export function parseWorkRecord(value: unknown): WorkRecord {
  const { ajv, validate } = getValidator();
  if (!validate(value)) throw new Error(`invalid WorkRecord: ${ajv.errorsText(validate.errors)}`);
  const record = value as WorkRecord;
  try { assertWorkRecordAggregateInvariants(record); } catch (error) {
    throw new Error(`invalid WorkRecord: ${error instanceof Error ? error.message : String(error)}`);
  }
  return record;
}

/** Assert that an unknown value is a complete canonical WorkRecord. */
export function assertWorkRecord(value: unknown): asserts value is WorkRecord { parseWorkRecord(value); }

function getValidator(): { ajv: AjvInstance; validate: Validate } {
  if (cachedValidator) return cachedValidator;
  const Ajv = (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule;
  const ajv = new (Ajv as unknown as new (options: object) => AjvInstance)({ allErrors: true, strict: false });
  ((addFormats as unknown as { default?: (instance: unknown) => void }).default ?? (addFormats as unknown as (instance: unknown) => void))(ajv);
  const root = resolveSchemaRoot();
  for (const relativePath of SCHEMA_FILES) ajv.addSchema(JSON.parse(readFileSync(join(root, relativePath), "utf8")) as object);
  const validate = ajv.getSchema(WORK_RECORD_SCHEMA_ID);
  if (!validate) throw new Error("WorkRecord schema did not register its canonical validator");
  cachedValidator = { ajv, validate };
  return cachedValidator;
}

function resolveSchemaRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // API bundles copy this package's runtime assets beside dist/index.mjs.
    join(moduleDirectory, "schemas/work-record"),
    // Source execution resolves from src/validation into the package root.
    join(moduleDirectory, "../../schemas"),
    // Workspace fallback for source loaders that rewrite import.meta.url.
    join(process.cwd(), "packages/work-record/schemas"),
  ];
  const root = candidates.find((candidate) => SCHEMA_FILES.every((file) => existsSync(join(candidate, file))));
  if (!root) throw new Error("WorkRecord schemas are unavailable; cannot validate untrusted record data");
  return root;
}
