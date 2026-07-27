/**
 * Shared structural scoring helpers for maturity scorecard dimensions.
 *
 * Why: core and readiness rows use the same evidence and gate rules, so this
 * module keeps their score transitions identical as those rows evolve.
 */

/** Return the requested paths whose evidence is present. */
export function presentFiles(files, mustExist) {
  return files.filter(mustExist);
}

/** Determine a row's level from structural evidence and optional functional gates. */
export function elevatedLevel({ structural, present, threshold, heavy, gates }) {
  if (!structural) return present >= threshold ? "lab-mature" : "weak";
  return heavy && !gates.every((gate) => gate?.ok) ? "lab-mature" : "strong";
}
