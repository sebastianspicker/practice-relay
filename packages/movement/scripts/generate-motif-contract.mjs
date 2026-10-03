/**
 * Generate Motif vocabulary runtime/types and its canonical schema enum.
 *
 * `vocabulary/motif-vocabulary.json` is the only authored symbol list.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { argv } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const vocabularyPath = join(packageRoot, "vocabulary/motif-vocabulary.json");
const runtimePath = join(packageRoot, "vocabulary/motif-vocabulary.mjs");
const declarationPath = join(packageRoot, "vocabulary/motif-vocabulary.d.mts");
const schemaPath = join(packageRoot, "schemas/mvei-motif.schema.json");

/** Build the generated package artifacts from the sole authored vocabulary JSON. */
export function generatedMotifContractFiles() {
  const vocabulary = readJson(vocabularyPath);
  const symbols = requireSymbols(vocabulary);
  const schema = readJson(schemaPath);
  schema.$comment = "Motif symbol enum is generated from vocabulary/motif-vocabulary.json. Schema identity changed without a compatibility alias in the 0.4 alpha.";
  schema.properties.items.items.properties.symbol.enum = symbols.map(({ id }) => id);
  return new Map([
    [runtimePath, renderRuntime(symbols)],
    [declarationPath, renderDeclarations(symbols)],
    [schemaPath, `${JSON.stringify(schema, null, 2)}\n`],
  ]);
}

/** Check or write every deterministic artifact. */
export function synchronizeMotifContract(checkOnly = false) {
  const stale = [];
  for (const [path, expected] of generatedMotifContractFiles()) {
    const actual = readFileSync(path, "utf8");
    if (actual === expected) continue;
    if (checkOnly) stale.push(path);
    else writeFileSync(path, expected, "utf8");
  }
  if (stale.length > 0) {
    throw new Error(`Generated Motif contract drift: ${stale.join(", ")}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function requireSymbols(vocabulary) {
  if (!Array.isArray(vocabulary?.symbols) || vocabulary.symbols.length === 0) {
    throw new TypeError("Motif vocabulary requires a non-empty symbols array");
  }
  const symbols = vocabulary.symbols.map((symbol) => {
    if (
      !symbol ||
      typeof symbol.id !== "string" ||
      typeof symbol.group !== "string" ||
      typeof symbol.label !== "string"
    ) {
      throw new TypeError("Each Motif vocabulary symbol requires string id, group, and label");
    }
    return { id: symbol.id, group: symbol.group, label: symbol.label };
  });
  if (new Set(symbols.map(({ id }) => id)).size !== symbols.length) {
    throw new TypeError("Motif vocabulary symbol ids must be unique");
  }
  return symbols;
}

function renderRuntime(symbols) {
  return `/** Generated from motif-vocabulary.json. Do not edit manually. */
export const MOTIF_VOCABULARY = Object.freeze(${JSON.stringify(symbols, null, 2)});

/** Ordered controlled Motif symbol identifiers. */
export const MOTIF_SYMBOL_IDS = Object.freeze(MOTIF_VOCABULARY.map(({ id }) => id));
`;
}

function renderDeclarations(symbols) {
  const entries = symbols
    .map(({ id, group, label }) => `  { readonly id: ${JSON.stringify(id)}; readonly group: ${JSON.stringify(group)}; readonly label: ${JSON.stringify(label)}; },`)
    .join("\n");
  const ids = symbols.map(({ id }) => `  ${JSON.stringify(id)},`).join("\n");
  return `/** Generated from motif-vocabulary.json. Do not edit manually. */
/** One Motif symbol generated from the canonical vocabulary. */
export interface MotifVocabularyEntry {
  readonly id: string;
  readonly group: string;
  readonly label: string;
}

export const MOTIF_VOCABULARY: readonly [
${entries}
];

export const MOTIF_SYMBOL_IDS: readonly [
${ids}
];
`;
}

const entryHref = argv[1] ? pathToFileURL(argv[1]).href : "";
if (import.meta.url === entryHref) {
  synchronizeMotifContract(argv.includes("--check"));
}
