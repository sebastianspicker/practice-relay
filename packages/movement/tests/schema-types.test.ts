/** Compile-time parity checks for the public Motif and Laban schema contracts. */
import type {
  LabanDirection,
  LabanLevel,
  LabanStaffColumn,
  LabanSubsetSymbol,
  LabanSymbolKind,
  MotifDocument,
} from "../src/index.ts";

const canonicalMotif: MotifDocument = {
  schemaVersion: "0.2.0",
  profile: "mvei-motif",
  id: "typed-motif",
  completeness: "sketch",
  items: [{ id: "item-1", symbol: "walk", order: 0 }],
};

const unknownMotif: MotifDocument = {
  ...canonicalMotif,
  items: [{
    id: "item-1",
    // @ts-expect-error Canonical Motif documents reject unknown vocabulary symbols.
    symbol: "not-a-motif-symbol",
    order: 0,
  }],
};

const canonicalLabanSymbol: LabanSubsetSymbol = {
  id: "symbol-1",
  kind: "support",
  column: "support_left",
  measureId: "m0",
  direction: "forward",
  level: "middle",
};

// @ts-expect-error The Laban schema rejects unknown staff columns.
const invalidColumn: LabanStaffColumn = "wing";
// @ts-expect-error The Laban schema rejects unknown symbol kinds.
const invalidKind: LabanSymbolKind = "shape";
// @ts-expect-error The Laban schema rejects unknown directions.
const invalidDirection: LabanDirection = "sideways";
// @ts-expect-error The Laban schema rejects unknown levels.
const invalidLevel: LabanLevel = "floating";

void unknownMotif;
void canonicalLabanSymbol;
void invalidColumn;
void invalidKind;
void invalidDirection;
void invalidLevel;
