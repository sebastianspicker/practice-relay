/**
 * LTI test score fixtures loaded from repository-owned JSON samples.
 *
 * Why: every protocol suite exercises the same representative multi-asset shapes.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const facultyTemplatePath = join(root, "practice-relay/fixtures/faculty-multi-asset-template.json");
const demoSeedPath = join(root, "fixtures/demo/work-record-seed.json");

/** Build a score-shaped projection from the faculty multi-asset template. */
export function scoreFromFacultyTemplate() {
  const seed = JSON.parse(readFileSync(facultyTemplatePath, "utf8"));
  return { id: seed.id, title: seed.title, tracks: seed.tracks, takes: seed.takes, preferredTakeId: seed.preferredTakeId, consents: [{ purposes: seed.consentPurposes, exportAllowed: true }] };
}

/** Build a score-shaped projection from the demo seed, including its motif track. */
export function scoreFromDemoSeed() {
  const seed = JSON.parse(readFileSync(demoSeedPath, "utf8"));
  return { id: seed.id, title: seed.title, tracks: [...seed.tracks, { id: seed.motif.trackId, type: "movement_notation", label: seed.motif.label, ref: seed.motif.ref }], takes: seed.takes, preferredTakeId: seed.preferredTakeId, consents: [{ purposes: seed.consent.purposes, exportAllowed: seed.consent.exportAllowed }] };
}

