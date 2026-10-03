/** Shared Ajv/browser comparison helpers for canonical movement schemas. */
import { readFileSync } from "node:fs";
import AjvModule from "ajv/dist/2020.js";
import { parseMovementDocument } from "../src/index.ts";

type AjvValidate = ((value: unknown) => boolean) & { errors?: unknown };
type AjvInstance = { addSchema(schema: object): AjvInstance; compile(schema: object): AjvValidate };

const Ajv = (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule;
const ajv = new (Ajv as unknown as new (options: object) => AjvInstance)({
  allErrors: true,
  strict: false,
});
const musicCoTimelineAnnexSchema = JSON.parse(
  readFileSync(new URL("../schemas/music-co-timeline-annex.schema.json", import.meta.url), "utf8"),
) as object;
ajv.addSchema(musicCoTimelineAnnexSchema);

/** Compile a package schema for differential browser-parser testing. */
export function compileSchema(relativeSchemaPath: string): AjvValidate {
  const schema = JSON.parse(
    readFileSync(new URL(relativeSchemaPath, import.meta.url), "utf8"),
  ) as object;
  return ajv.compile(schema);
}

/** Return whether the browser parser accepts a JSON document. */
export function browserAccepts(input: unknown): boolean {
  try {
    parseMovementDocument(input);
    return true;
  } catch {
    return false;
  }
}

/** Clone a corpus document, mutate it, and retain an object-shaped test value. */
export function mutateDocument(source: unknown, change: (value: any) => void): object {
  const copy = JSON.parse(JSON.stringify(source)) as any;
  change(copy);
  return copy;
}

/** Deep clone a JSON-compatible test value. */
export function cloneDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
