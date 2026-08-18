/** Ordered facade for system health, readiness, metrics, and operations routes. */
import type { RequestContext, RouteResult } from "./request-context.ts";
import {
  handleSystemAuditRoute,
  handleSystemBackupRoute,
  handleSystemBackupsRoute,
  handleSystemRestoreRoute,
} from "./routes-system-admin.ts";
import { handleSystemHealthRoute } from "./routes-system-health.ts";
import { handleSystemMetricsRoute } from "./routes-system-metrics.ts";
import { handleSystemReadinessRoute } from "./routes-system-readiness.ts";

type SystemRoute = {
  pathname: string;
  method: string;
  handle: (ctx: RequestContext) => RouteResult | Promise<RouteResult>;
};

// Order is the route-precedence contract for this process-level boundary.
const systemRoutes: readonly SystemRoute[] = [
  { pathname: "/health", method: "GET", handle: handleSystemHealthRoute },
  { pathname: "/readyz", method: "GET", handle: handleSystemReadinessRoute },
  { pathname: "/metrics", method: "GET", handle: handleSystemMetricsRoute },
  { pathname: "/ops/backup", method: "POST", handle: handleSystemBackupRoute },
  { pathname: "/ops/backups", method: "GET", handle: handleSystemBackupsRoute },
  { pathname: "/ops/restore", method: "POST", handle: handleSystemRestoreRoute },
  { pathname: "/ops/audit", method: "GET", handle: handleSystemAuditRoute },
];

/** Handle system and operations endpoints without consuming unmatched bodies. */
export async function handleSystemOpsRoutes(
  ctx: RequestContext,
): Promise<RouteResult> {
  const { method, pathname } = ctx;
  const route = systemRoutes.find(
    (candidate) => candidate.pathname === pathname && candidate.method === method,
  );
  return route ? route.handle(ctx) : "unmatched";
}
