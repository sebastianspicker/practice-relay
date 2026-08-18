/** On-disk JSON Schema loading and cached Ajv manifest validation. */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import AjvModule from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

/**
 * Locate work-record-package.schema.json from package path or monorepo cwd.
 * Multiple candidates so tests work when run from package or repo root.
 */
function resolveSchemaPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../schemas/work-record-package.schema.json"),
    join(
      here,
      "../../../../packages/work-record-package/schemas/work-record-package.schema.json",
    ),
    join(
      process.cwd(),
      "packages/work-record-package/schemas/work-record-package.schema.json",
    ),
    join(
      process.cwd(),
      "../../../packages/work-record-package/schemas/work-record-package.schema.json",
    ),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`work-record package schema not found (tried: ${candidates.join(", ")})`);
}

type AjvValidate = ((data: unknown) => boolean) & {
  errors?: { instancePath?: string; message?: string }[] | null;
};

/** Cached compiled validator - schema is stable for process lifetime. */
let cachedValidate: AjvValidate | null = null;

/** Compile Ajv 2020 validator against the real work-record package schema file. */
function getAjvValidate(): AjvValidate {
  if (cachedValidate) return cachedValidate;
  const Ajv =
    (AjvModule as unknown as { default?: typeof AjvModule }).default ??
    AjvModule;
  const ajv = new (Ajv as unknown as new (opts: object) => {
    compile: (s: object) => AjvValidate;
    errorsText: (errors?: unknown) => string;
  })({ allErrors: true, strict: false });
  const applyFormats =
    (addFormats as unknown as { default?: (instance: unknown) => void }).default ??
    (addFormats as unknown as (instance: unknown) => void);
  applyFormats(ajv);
  const schemaPath = resolveSchemaPath();
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
  cachedValidate = ajv.compile(schema);
  return cachedValidate;
}

/**
 * Validate an unknown JSON value against the on-disk work-record package schema (Ajv).
 * Used by export path and acceptance Q7 - never re-implement the schema in tests.
 */
export function validateWorkRecordPackageManifest(manifest: unknown): {
  ok: boolean;
  errors?: string;
} {
  const validate = getAjvValidate();
  const ok = validate(manifest);
  if (ok) return { ok: true };
  const errors =
    validate.errors
      ?.map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`)
      .join("; ") ?? "invalid work-record package manifest";
  return { ok: false, errors };
}
