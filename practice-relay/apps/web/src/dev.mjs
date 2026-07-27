/** Practice Relay local web entrypoint. Why: the alpha shell needs a reproducible loopback URL. */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "../../../../scripts/static-server.mjs";
import { BRAND } from "./shell.mjs";

await startStaticServer({
  root: dirname(fileURLToPath(import.meta.url)),
  port: process.env.PRACTICE_RELAY_WEB_PORT ?? 5173,
  label: BRAND,
});
console.log("API integration: set globalThis.PRACTICE_RELAY_API_BASE before loading the application.");
