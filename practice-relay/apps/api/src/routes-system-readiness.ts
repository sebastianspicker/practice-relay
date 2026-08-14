/** Readiness route for store, media, and secret prerequisites. */
import { existsSync } from "node:fs";
import { awaitMaybe } from "@practice-relay/media-store";
import { sendJson } from "./api-http.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { durableStore, storeBackendLabel } from "./record-service.ts";

/** Probe readiness and write the response for a previously matched request. */
export async function handleSystemReadinessRoute(
  ctx: RequestContext,
): Promise<RouteResult> {
  const { res, runtime } = ctx;
  const durable = durableStore(runtime);
  const mediaOk =
    runtime.mediaStore.rootDir === ":memory:" ||
    runtime.mediaStore.rootDir.startsWith(":object:") ||
    runtime.mediaStore.rootDir.startsWith("s3://") ||
    existsSync(runtime.mediaStore.rootDir);
  let storeOk = true;
  try {
    runtime.recordStore.list();
  } catch {
    storeOk = false;
  }
  let mediaCheck = mediaOk;
  try {
    if (runtime.mediaStore.totalBytesAll) {
      await awaitMaybe(runtime.mediaStore.totalBytesAll());
    }
  } catch {
    mediaCheck = false;
  }
  const checks = {
    store: storeOk,
    durableConfigured: Boolean(process.env.PRACTICE_RELAY_DATA),
    durableReady: Boolean(durable),
    storeBackend: storeBackendLabel(runtime),
    mediaRoot: mediaCheck,
    objectStore: runtime.objectStoreMode,
    mediaBackend: runtime.mediaStore.backend ?? runtime.objectStoreMode,
    secrets:
      !runtime.opsSecrets.usingDevDefaults ||
      process.env.PRACTICE_RELAY_REQUIRE_SECRETS !== "1",
    ltiKeys: runtime.labRsaKeys ? "rsa" : "hmac",
  };
  const ready = checks.store && checks.mediaRoot && checks.secrets;
  sendJson(res, ready ? 200 : 503, {
    ok: ready,
    service: "practice-relay-api",
    checks,
  });
  return "handled";
}
