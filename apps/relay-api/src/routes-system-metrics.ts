/** Authenticated Prometheus metrics route. */
import {
  corsHeaders,
  responseMetaOf,
} from "./api-http.ts";
import { renderPrometheusMetricsText } from "./api-metrics.ts";
import { requireOpsAdmin } from "./access.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { storageMetrics, storageFreshnessMetrics } from "./storage-metrics.ts";

/** Write metrics only after the operation-admin authorization check. */
export async function handleSystemMetricsRoute(
  ctx: RequestContext,
): Promise<RouteResult> {
  if (requireOpsAdmin(ctx) === undefined) return "handled";
  const { res, runtime } = ctx;
  const body = renderPrometheusMetricsText(storageMetrics(runtime)) + storageFreshnessMetrics(runtime);
  const meta = responseMetaOf(res);
  if (meta) meta.status = 200;
  res.writeHead(200, {
    "content-type": "text/plain; version=0.0.4; charset=utf-8",
    ...corsHeaders(meta?.requestId, meta?.corsOrigin),
  });
  res.end(body);
  return "handled";
}
