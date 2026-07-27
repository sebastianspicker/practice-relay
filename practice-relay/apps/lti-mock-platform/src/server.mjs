/**
 * MOCK PLATFORM - not Canvas.
 * Why: this explicitly local listener owns the singleton tool registry and lab-safe network defaults.
 */
import { createServer } from "node:http";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MOCK_PLATFORM_BANNER,
  MOCK_PLATFORM_STATUS,
  createToolRegistry,
} from "./platform.mjs";
import { createMockRequestHandler } from "./request-routes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** TCP port used by the explicitly local-mock platform. */
export const PORT = Number(process.env.MOCK_PLATFORM_PORT ?? 8790);

/** Bind host; loopback locally, with containers opting into their network interface. */
export const MOCK_PLATFORM_HOST =
  process.env.MOCK_PLATFORM_HOST?.trim() || "127.0.0.1";

/** Practice Relay API origin used only for server-side local-mock requests. */
export const API_BASE = (
  process.env.PRACTICE_RELAY_API_BASE ?? "http://localhost:8787"
).replace(/\/$/, "");

const registry = createToolRegistry();

/** Handle one local-mock platform request without opening a listener. */
export const handleMockPlatformRequest = createMockRequestHandler({
  apiBase: API_BASE,
  dirname: __dirname,
  port: PORT,
  registry,
});

/** HTTP server for the explicitly local-mock LMS surface. */
export const server = createServer((req, res) => {
  void handleMockPlatformRequest(req, res);
});
server.headersTimeout = 15_000;
server.requestTimeout = 120_000;
server.keepAliveTimeout = 5_000;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.listen(PORT, MOCK_PLATFORM_HOST, () => {
    console.log(`${MOCK_PLATFORM_BANNER}`);
    console.log(`Listening http://${MOCK_PLATFORM_HOST}:${PORT}`);
    console.log(`Practice Relay API base: ${API_BASE}`);
    console.log(`Status: ${MOCK_PLATFORM_STATUS} - not IMS certified`);
  });
}
