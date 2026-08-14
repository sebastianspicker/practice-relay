/** Contained fixture loading and repository-relative paths for the E2E demo. */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readContainedText } from "./contained-output.mjs";
import type { Seed } from "./e2e-demo-types.ts";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DEMO_DIR = join(root, "fixtures/demo");
export const SEED_PATH = join(DEMO_DIR, "work-record-seed.json");
export const MOTIF_PATH = join(DEMO_DIR, "motif.json");

/** Read the demo WorkRecord fixture through the protected path boundary. */
export function loadSeed(): Seed {
  return JSON.parse(readContainedText(root, SEED_PATH)) as Seed;
}

/** Read the shared Motif fixture through the protected path boundary. */
export function loadMotifJson(): unknown {
  return JSON.parse(readContainedText(root, MOTIF_PATH));
}
