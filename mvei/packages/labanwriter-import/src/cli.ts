#!/usr/bin/env node
/**
 * LabanWriter open-intermediate CLI - validates external JSON before emitting MvEI.
 * Why: migration failures must be controlled diagnostics, never malformed target files.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { importLabanWriterIntermediate } from "./index.ts";

function main() {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input) {
    console.error(
      "Usage: mvei-labanwriter-import <intermediate.json> [out-laban-subset.json]",
    );
    process.exit(2);
  }
  try {
    const raw = JSON.parse(readFileSync(resolve(input), "utf8")) as unknown;
    const { document, warnings } = importLabanWriterIntermediate(raw);
    for (const w of warnings) console.error("WARN:", w);
    const text = JSON.stringify(document, null, 2) + "\n";
    if (output) {
      writeFileSync(resolve(output), text, "utf8");
      console.log("Wrote", output);
    } else {
      process.stdout.write(text);
    }
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) main();
