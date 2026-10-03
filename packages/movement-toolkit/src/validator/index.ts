#!/usr/bin/env node
/**
 * mvei-validate compatibility CLI (@practice-relay/movement-toolkit).
 *
 * Why: MEI-pattern residual requires a shared validator + public corpus, not
 * app-local JSON. Selects schema by document profile/kind under
 * the public movement package. Exported validateMveiDocument is side-effect
 * free for tests; main() exits non-zero on failure.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import AjvModule from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const Ajv = (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule;

const movementRequire = createRequire(import.meta.url);

/** Structured result so unit tests never need process.exit. */
export type ValidateResult = { ok: boolean; message: string };

/**
 * Load JSON, pick Motif vs annotation schema, validate with Ajv 2020.
 * @param filePath Absolute or relative path to a document on disk.
 */
export function validateMveiDocument(filePath: string): ValidateResult {
  if (!existsSync(filePath)) {
    return { ok: false, message: `File not found: ${filePath}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch (e) {
    return { ok: false, message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      message: "MvEI document must be a non-null JSON object",
    };
  }
  const data = parsed as { profile?: string; kind?: string };

  let schemaPath: string;
  if (data.profile === "mvei-motif") {
    schemaPath = movementRequire.resolve(
      "@practice-relay/movement/schemas/mvei-motif.schema.json",
    );
  } else if (data.profile === "mvei-laban-subset") {
    schemaPath = movementRequire.resolve(
      "@practice-relay/movement/schemas/mvei-laban-subset.schema.json",
    );
  } else if (data.kind === "movement_annotation") {
    schemaPath = movementRequire.resolve(
      "@practice-relay/movement/schemas/movement-annotation-v0.schema.json",
    );
  } else {
    return {
      ok: false,
      message:
        "Unknown document type (need profile=mvei-motif|mvei-laban-subset or kind=movement_annotation)",
    };
  }

  if (!existsSync(schemaPath)) {
    return { ok: false, message: `Schema missing: ${schemaPath}` };
  }

  const annexSchemaPath = movementRequire.resolve(
    "@practice-relay/movement/schemas/music-co-timeline-annex.schema.json",
  );
  if (!existsSync(annexSchemaPath)) {
    return { ok: false, message: `Schema missing: ${annexSchemaPath}` };
  }

  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const ajv = new (Ajv as unknown as new (o: object) => {
    addSchema: (s: object) => void;
    compile: (s: object) => ((d: unknown) => boolean) & {
      errors?: { instancePath?: string; message?: string }[] | null;
    };
    errorsText: (errors?: unknown) => string;
  })({ allErrors: true, strict: false });
  const applyFormats =
    (addFormats as unknown as { default?: (instance: unknown) => void }).default ??
    (addFormats as unknown as (instance: unknown) => void);
  applyFormats(ajv);
  ajv.addSchema(JSON.parse(readFileSync(annexSchemaPath, "utf8")) as object);

  const validate = ajv.compile(schema);
  if (!validate(data)) {
    const detail =
      ajv.errorsText(validate.errors) ||
      validate.errors
        ?.map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`)
        .join("; ") ||
      "schema validation failed";
    return { ok: false, message: detail };
  }
  return { ok: true, message: `OK ${filePath}` };
}

/** CLI entry: usage exit 2, validation fail exit 1, success prints OK line. */
function main(): void {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: mvei-validate <file.json>");
    process.exit(2);
  }
  const result = validateMveiDocument(resolve(file));
  if (!result.ok) {
    console.error(result.message);
    process.exit(1);
  }
  console.log(result.message);
}

// Run only as a Node CLI entry, not when imported by tests.
const entryHref = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : "";
if (import.meta.url === entryHref) {
  main();
}
