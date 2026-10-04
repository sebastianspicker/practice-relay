// tsc skips src/reference-reader/index.mjs because it resolves to the hand-written index.d.mts, so ship both as-is.
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dist/reference-reader", { recursive: true });
for (const file of ["index.mjs", "index.d.mts"]) {
  cpSync(`src/reference-reader/${file}`, `dist/reference-reader/${file}`);
}
