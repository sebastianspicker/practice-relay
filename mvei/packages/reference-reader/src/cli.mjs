#!/usr/bin/env node
/**
 * mvei-reference-read - print Motif JSON summary (third implementation).
 * Usage: mvei-reference-read <motif.json>
 */
import { readFileSync } from "node:fs";
import { readMotifSummaryText } from "./index.mjs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: mvei-reference-read <motif.json>");
  process.exit(2);
}

try {
  const raw = readFileSync(file, "utf8");
  console.log(readMotifSummaryText(raw));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
