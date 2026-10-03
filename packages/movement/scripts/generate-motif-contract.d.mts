/** Type surface for the deterministic Motif contract generator. */
/** Return the exact generated artifact contents keyed by absolute path. */
export function generatedMotifContractFiles(): Map<string, string>;
/** Check generated artifacts for drift or rewrite them from the canonical JSON. */
export function synchronizeMotifContract(checkOnly?: boolean): void;
