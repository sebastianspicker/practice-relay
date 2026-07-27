#!/usr/bin/env node
/**
 * Command-line Motif-to-SVG engraver.
 * Why: MvEI fixtures need a scriptable reference-rendering path for validation.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderMotifToSvg } from "./index.ts";

function main() {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input) {
    console.error("Usage: mvei-engrave <motif.json> [out.svg]");
    process.exit(2);
  }
  const doc = JSON.parse(readFileSync(resolve(input), "utf8"));
  const svg = renderMotifToSvg(doc);
  if (output) {
    writeFileSync(resolve(output), svg, "utf8");
    console.log("Wrote", output);
  } else {
    process.stdout.write(svg);
  }
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) main();
