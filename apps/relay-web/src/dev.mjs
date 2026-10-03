/** Practice Relay local web entrypoint. Why: the alpha shell needs a reproducible loopback URL. */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "../../../scripts/static-server.mjs";
import { BRAND } from "./shell.mjs";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(sourceDir, "../../..");
const release = JSON.parse(await readFile(join(repositoryRoot, "release.json"), "utf8"));

await startStaticServer({
  root: sourceDir,
  port: process.env.PRACTICE_RELAY_WEB_PORT ?? 5173,
  label: BRAND,
  mounts: [
    {
      urlPrefix: "/packages/movement/",
      root: join(repositoryRoot, "packages/movement"),
    },
    {
      urlPrefix: "/screenshots/",
      root: join(repositoryRoot, "docs/images", release.version),
    },
  ],
});
console.log("API integration: set globalThis.PRACTICE_RELAY_API_BASE before loading the application.");
