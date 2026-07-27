/**
 * Validate Motif documents against shared mvei-motif-stub.schema.json (Ajv).
 *
 * Why: MvEI Workbench success metric is “validates against @practice-relay/movement-encode”, not
 * a private demo schema. Schema paths point into root `packages/` only.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** From mvei/apps/workbench/src → repo shared package schema */
export const MOTIF_SCHEMA_PATH = join(
  __dirname,
  "../../../../packages/movement-encode/schemas/mvei-motif-stub.schema.json",
);

/**
 * Resolve ajv from package deps, with monorepo-root fallback (pre-install).
 * @returns {{ Ajv: new (opts: object) => { compile: (s: object) => ((d: unknown) => boolean) & { errors?: unknown }, errorsText: (errors?: unknown) => string }, addFormats: (ajv: unknown) => unknown }}
 */
function loadAjv() {
  const tryRequire = (filename) => {
    const req = createRequire(filename);
    const ajvMod = req("ajv/dist/2020.js");
    const Ajv = ajvMod.default ?? ajvMod;
    const formatsMod = req("ajv-formats");
    const addFormats = formatsMod.default ?? formatsMod;
    return { Ajv, addFormats };
  };

  try {
    return tryRequire(import.meta.url);
  } catch {
    return tryRequire(join(__dirname, "../../../../package.json"));
  }
}

/** @type {((data: unknown) => boolean & { errors?: unknown }) | null} */
let compiled = null;
/** @type {{ errorsText: (errors?: unknown) => string } | null} */
let ajvInstance = null;

function getValidator() {
  if (compiled) return { validate: compiled, ajv: ajvInstance };

  const schema = JSON.parse(readFileSync(MOTIF_SCHEMA_PATH, "utf8"));
  const { Ajv, addFormats } = loadAjv();
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  compiled = ajv.compile(schema);
  ajvInstance = ajv;
  return { validate: compiled, ajv };
}

/**
 * @param {unknown} doc
 * @returns {{ ok: boolean, message: string }}
 */
export function validateMotifAgainstSchema(doc) {
  try {
    const { validate, ajv } = getValidator();
    if (validate(doc)) {
      return { ok: true, message: "OK" };
    }
    return { ok: false, message: ajv.errorsText(validate.errors) };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
