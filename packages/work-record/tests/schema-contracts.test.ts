/** Factory outputs must validate against the package-owned JSON Schemas. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import AjvModule from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  attachUsePolicySnapshot,
  createAbsoluteSpine,
  createEmptyRecord,
  createTake,
} from "../src/index.ts";

type Validate = ((value: unknown) => boolean) & { errors?: unknown };
type AjvInstance = { addSchema(schema: object): void; getSchema(id: string): Validate | undefined; errorsText(errors?: unknown): string };

const Ajv = (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule;
const applyFormats =
  (addFormats as unknown as { default?: (instance: unknown) => void }).default ??
  (addFormats as unknown as (instance: unknown) => void);
const ajv = new (Ajv as unknown as new (options: object) => AjvInstance)({ allErrors: true, strict: false });
applyFormats(ajv);

for (const path of [
  "../schemas/time/time-core.schema.json",
  "../schemas/media/media-take.schema.json",
  "../schemas/policy/use-policy-snapshot.schema.json",
  "../schemas/work-record.schema.json",
]) {
  ajv.addSchema(JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as object);
}

function assertValid(schemaId: string, value: unknown): void {
  const validate = ajv.getSchema(schemaId);
  assert.ok(validate, `missing validator for ${schemaId}`);
  assert.equal(validate(value), true, ajv.errorsText(validate.errors));
}

test("domain factories emit their canonical schema values", () => {
  const record = createEmptyRecord("record-1", "Schema fixture");
  assertValid("urn:work-record:schema:work-record:0.4", record);
  assertValid("urn:work-record:schema:time-core:0.1", createAbsoluteSpine(1_000));
  assertValid("urn:work-record:schema:media-take:0.1", createTake("take-1", {
    label: "First run",
    mediaPath: "media/take-1.mp4",
    recordedAt: "2026-08-29T00:00:00.000Z",
    byteSize: 1,
  }));
});

test("attached record-release snapshots match their schema", () => {
  const record = attachUsePolicySnapshot(createEmptyRecord("record-2", "Policy fixture"), {
    id: "snapshot-1",
    subjectId: "subject-1",
    purposes: ["course_assessment"],
    exportAllowed: true,
    createdAt: "2026-08-29T00:00:00.000Z",
  });
  assertValid("urn:work-record:schema:use-policy-snapshot:0.1", record.usePolicySnapshots[0]);
  assertValid("urn:work-record:schema:work-record:0.4", record);
});
