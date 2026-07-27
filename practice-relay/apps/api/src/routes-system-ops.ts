/**
 * System health, readiness, metrics, and operations routes for Practice Relay.
 * Why: process-level evidence and recovery controls share one ordered boundary.
 */
import { existsSync } from "node:fs";
import packageMetadata from "../../../../package.json" with { type: "json" };
import { collabEnabled } from "@practice-relay/collaboration";
import { awaitMaybe } from "@practice-relay/media-store";
import { LTI_STATUS } from "../../lti/src/index.mjs";
import {
  corsHeaders,
  readJson,
  responseMetaOf,
  sendJson,
  sendProblem,
} from "./api-http.ts";
import { renderPrometheusMetricsText } from "./api-metrics.ts";
import { requireOpsAdmin } from "./access.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import {
  backupPathForId,
  durableStore,
  publicBackup,
  storeBackendLabel,
} from "./record-service.ts";

/** Handle system and operations endpoints without consuming unmatched bodies. */
export async function handleSystemOpsRoutes(
  ctx: RequestContext,
): Promise<RouteResult> {
  const { method, pathname, req, res, runtime } = ctx;

  if (pathname === "/health" && method === "GET") {
    sendJson(res, 200, {
      ok: true,
      service: "practice-relay-api",
      version: packageMetadata.version,
      productTier: "lab-only",
      lti: LTI_STATUS,
      ltiAlg: runtime.labRsaKeys ? "RS256" : "HS256",
      collab: collabEnabled(),
      durable: Boolean(process.env.PRACTICE_RELAY_DATA),
      storeBackend: storeBackendLabel(runtime),
      objectStore: runtime.objectStoreMode,
    });
    return "handled";
  }

  if (pathname === "/readyz" && method === "GET") {
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

  if (pathname === "/metrics" && method === "GET") {
    if (!requireOpsAdmin(ctx)) return "handled";
    const durable = durableStore(runtime);
    let mediaBytes = 0;
    try {
      if (runtime.mediaStore.totalBytesAll) {
        mediaBytes = await awaitMaybe(runtime.mediaStore.totalBytesAll());
      }
    } catch {
      mediaBytes = 0;
    }
    const body = renderPrometheusMetricsText({
      recordCount: runtime.recordStore.list().length,
      mediaBytes,
      auditEvents: durable?.listAllEvents().length ?? 0,
    });
    const meta = responseMetaOf(res);
    if (meta) meta.status = 200;
    res.writeHead(200, {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      ...corsHeaders(meta?.requestId, meta?.corsOrigin),
    });
    res.end(body);
    return "handled";
  }

  if (pathname === "/ops/backup" && method === "POST") {
    if (!requireOpsAdmin(ctx)) return "handled";
    const durable = durableStore(runtime);
    if (!durable) {
      sendProblem(
        res,
        400,
        "Bad Request",
        "backup requires PRACTICE_RELAY_DATA durable store",
      );
      return "handled";
    }
    const manifest = durable.backup();
    sendJson(res, 200, { ok: true, manifest: publicBackup(manifest) });
    return "handled";
  }

  if (pathname === "/ops/backups" && method === "GET") {
    if (!requireOpsAdmin(ctx)) return "handled";
    const durable = durableStore(runtime);
    if (!durable) {
      sendJson(res, 200, { backups: [], durable: false });
      return "handled";
    }
    sendJson(res, 200, {
      backups: durable.listBackups().map(publicBackup),
      durable: true,
    });
    return "handled";
  }

  if (pathname === "/ops/restore" && method === "POST") {
    if (!requireOpsAdmin(ctx)) return "handled";
    if (process.env.PRACTICE_RELAY_LAB_OPS !== "1") {
      sendProblem(
        res,
        403,
        "Forbidden",
        "restore requires PRACTICE_RELAY_LAB_OPS=1",
      );
      return "handled";
    }
    const durable = durableStore(runtime);
    if (!durable) {
      sendProblem(
        res,
        400,
        "Bad Request",
        "restore requires PRACTICE_RELAY_DATA durable store",
      );
      return "handled";
    }
    const body = await readJson<{ backupId?: string }>(req);
    if (!body.backupId?.trim()) {
      sendProblem(res, 400, "Bad Request", "backupId required");
      return "handled";
    }
    try {
      const backupPath = backupPathForId(durable, body.backupId.trim());
      const manifest = durable.restoreFromBackup(backupPath);
      sendJson(res, 200, { ok: true, manifest: publicBackup(manifest) });
    } catch (err) {
      sendProblem(
        res,
        400,
        "Bad Request",
        err instanceof Error ? err.message : "restore failed",
      );
    }
    return "handled";
  }

  if (pathname === "/ops/audit" && method === "GET") {
    if (!requireOpsAdmin(ctx)) return "handled";
    if (!("listAllEvents" in runtime.recordStore)) {
      sendJson(res, 200, { events: [], durable: false });
      return "handled";
    }
    sendJson(res, 200, {
      events: (
        runtime.recordStore as { listAllEvents: () => unknown[] }
      ).listAllEvents(),
      durable: true,
    });
    return "handled";
  }

  return "unmatched";
}
