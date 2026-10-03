/** Regenerate the checked-in static schema-site page from its content module. */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPageHtml } from "../src/content.mjs";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = join(appRoot, "index.html");

writeFileSync(indexPath, buildPageHtml(), "utf8");
