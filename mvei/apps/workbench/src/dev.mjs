/** MvEI Workbench local entrypoint. Why: the generated editor needs a reproducible loopback URL. */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "../../../../scripts/static-server.mjs";
import {
  BRAND,
  STANDARD,
  loadDemoMotif,
  renderShellHtml,
  scaffoldBanner,
} from "./shell.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, "index.html");
const doc = loadDemoMotif();
const html = renderShellHtml(doc);
writeFileSync(indexPath, html, "utf8");

console.log(scaffoldBanner());
console.log("");
console.log(`${BRAND} Motif surface written: ${indexPath}`);
console.log(`Standard: ${STANDARD} · Motif id: ${doc.id} · items: ${doc.items.length}`);
await startStaticServer({
  root: __dirname,
  port: process.env.MVEI_WORKBENCH_PORT ?? 5175,
  label: BRAND,
  mounts: [
    {
      urlPrefix: "/packages/movement-encode/vocab/",
      root: join(__dirname, "../../../../packages/movement-encode/vocab"),
    },
  ],
});
