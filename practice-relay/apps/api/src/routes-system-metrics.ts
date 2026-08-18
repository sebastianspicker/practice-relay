/** Authenticated Prometheus metrics route. */
import { awaitMaybe } from "@practice-relay/media-store";
import {
  corsHeaders,
  responseMetaOf,
} from "./api-http.ts";
import { renderPrometheusMetricsText } from "./api-metrics.ts";
import { requireOpsAdmin } from "./access.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { durableStore } from "./record-service.ts";

/** Write metrics only after the operation-admin authorization check. */
export async function handleSystemMetricsRoute(
  ctx: RequestContext,
): Promise<RouteResult> {
  if (!requireOpsAdmin(ctx)) return "handled";
  const { res, runtime } = ctx;
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
