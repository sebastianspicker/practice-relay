#!/usr/bin/env node
/**
 * mvei-reference-read - print Motif JSON summary (third implementation).
 * Usage: mvei-reference-read <motif.json>
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { neutralizeTerminalScalar, readMotifSummaryText } from "./index.mjs";

const file = process.argv[2];
if (!file) {
  process.stderr.write("Usage: mvei-reference-read <motif.json>\n");
  process.exitCode = 2;
} else {
  try {
    const raw = readFileSync(file, "utf8");
    process.stdout.write(`${readMotifSummaryText(raw)}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : err;
    process.stderr.write(`${neutralizeTerminalScalar(message)}\n`);
    process.exitCode = 1;
  }
}
