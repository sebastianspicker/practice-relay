/** MvEI Workbench local entrypoint. Why: the generated editor needs a reproducible loopback URL. */
import { dirname, join } from "node:path";
import { env, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { writeContainedText } from "../../../scripts/contained-output.mjs";
import { startStaticServer } from "../../../scripts/static-server.mjs";
import {
  BRAND,
  STANDARD,
  loadDemoMotif,
  renderShellHtml,
  scaffoldBanner,
} from "./shell.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = loadDemoMotif();
const indexPath = writeContainedText(
  __dirname,
  "index.html",
  renderShellHtml(doc),
);

function writeStatus(value) {
  const status = String(value).replaceAll(/[\r\n]/g, "");
  stdout.write(`${status}\n`);
}

for (const line of scaffoldBanner().split("\n")) writeStatus(line);
writeStatus("");
writeStatus(`${BRAND} Motif surface written: ${indexPath}`);
writeStatus(`Standard: ${STANDARD} · Motif id: ${doc.id} · items: ${doc.items.length}`);
await startStaticServer({
  root: __dirname,
  port: env.MVEI_WORKBENCH_PORT ?? 5175,
  label: BRAND,
  mounts: [
    {
      urlPrefix: "/packages/movement/",
      root: join(__dirname, "../../../packages/movement"),
    },
  ],
});
