/** Authenticated backup, restore, and audit routes. */
import {
  readJson,
  sendJson,
  sendProblem,
} from "./api-http.ts";
import { requireOpsAdmin } from "./access.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import {
  backupPathForId,
  durableStore,
  publicBackup,
} from "./application/records.ts";

/** Create a backup after confirming operations-admin access. */
export async function handleSystemBackupRoute(ctx: RequestContext): Promise<RouteResult> {
  if (requireOpsAdmin(ctx) === undefined) return "handled";
  const { res, runtime } = ctx;
  const durable = durableStore(runtime);
  if (!durable || durable.backend !== "json") {
    sendProblem(
      res,
      400,
      "Bad Request",
      "backup requires PRACTICE_RELAY_DATA durable store",
    );
    return "handled";
  }
  const manifest = await durable.backup();
  sendJson(res, 200, { ok: true, manifest: publicBackup(manifest) });
  return "handled";
}

/** List public backup summaries after confirming operations-admin access. */
export async function handleSystemBackupsRoute(ctx: RequestContext): Promise<RouteResult> {
  if (requireOpsAdmin(ctx) === undefined) return "handled";
  const { res, runtime } = ctx;
  const durable = durableStore(runtime);
  if (!durable || durable.backend !== "json") {
    sendJson(res, 200, { backups: [], durable: false });
    return "handled";
  }
  sendJson(res, 200, {
    backups: (await durable.listBackups()).map(publicBackup),
    durable: true,
  });
  return "handled";
}

/** Restore a named backup after the environment and authorization gates. */
export async function handleSystemRestoreRoute(
  ctx: RequestContext,
): Promise<RouteResult> {
  if (requireOpsAdmin(ctx) === undefined) return "handled";
  const { req, res, runtime } = ctx;
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
  if (!durable || durable.backend !== "json") {
    sendProblem(
      res,
      400,
      "Bad Request",
      "restore requires PRACTICE_RELAY_DATA durable store",
    );
    return "handled";
  }
  const body = await readJson<{ backupId?: unknown }>(req);
  if (typeof body.backupId !== "string") {
    sendProblem(res, 400, "Bad Request", "backupId required");
    return "handled";
  }
  const backupId = body.backupId.trim();
  if (backupId === "") {
    sendProblem(res, 400, "Bad Request", "backupId required");
    return "handled";
  }
  try {
    const backupPath = backupPathForId(durable, backupId);
    const manifest = await durable.restoreFromBackup(backupPath);
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

/** List durable audit events after confirming operations-admin access. */
export async function handleSystemAuditRoute(ctx: RequestContext): Promise<RouteResult> {
  if (requireOpsAdmin(ctx) === undefined) return "handled";
  const { res, runtime } = ctx;
  const durable = durableStore(runtime);
  if (!durable) {
    sendJson(res, 200, { events: [], durable: false });
    return "handled";
  }
  sendJson(res, 200, {
    events: await durable.listAllEvents(),
    durable: true,
  });
  return "handled";
}
