/**
 * In-process API metrics for the Practice Relay single-host lab tier.
 * Why: bounded route labels provide useful evidence without attacker cardinality.
 */

const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000] as const;

type MetricsState = {
  requestCount: Map<string, number>;
  latencyCount: number;
  latencySumMs: number;
  latencyBuckets: number[];
  latencyInf: number;
};

const metricsState: MetricsState = {
  requestCount: new Map(),
  latencyCount: 0,
  latencySumMs: 0,
  latencyBuckets: LATENCY_BUCKETS_MS.map(() => 0),
  latencyInf: 0,
};

const STATIC_METRIC_PATHS = new Set([
  "/auth/login",
  "/auth/users",
  "/demo/export",
  "/health",
  "/lti/ags/scores",
  "/lti/jwks",
  "/lti/launch",
  "/lti/login",
  "/lti/oauth/token",
  "/me",
  "/metrics",
  "/ops/backup",
  "/ops/restore",
  "/readyz",
  "/profiles",
  "/work-records",
]);

function metricsKey(method: string, pathLabel: string, status: number): string {
  return `${method}\0${pathLabel}\0${status}`;
}

function pathLabelForMetrics(pathname: string): string {
  if (pathname.startsWith("/media/")) return "/media/*";
  if (pathname.startsWith("/work-records/")) {
    const segments = pathname.split("/").filter(Boolean);
    return segments.length === 2 ? "/work-records/:id" : "/work-records/:id/*";
  }
  return STATIC_METRIC_PATHS.has(pathname) ? pathname : "/other";
}

/** Record one completed request against bounded path and latency labels. */
export function recordRequestMetrics(
  method: string,
  pathname: string,
  status: number,
  ms: number,
): void {
  const label = pathLabelForMetrics(pathname);
  const key = metricsKey(method, label, status || 0);
  metricsState.requestCount.set(
    key,
    (metricsState.requestCount.get(key) ?? 0) + 1,
  );
  metricsState.latencyCount += 1;
  metricsState.latencySumMs += ms;
  for (let i = 0; i < LATENCY_BUCKETS_MS.length; i++) {
    if (ms <= LATENCY_BUCKETS_MS[i]!) {
      metricsState.latencyBuckets[i]! += 1;
      break;
    }
  }
  metricsState.latencyInf += 1;
}

/** Render Prometheus exposition from request state and caller-supplied gauges. */
export function renderPrometheusMetricsText(opts: {
  recordCount: number;
  mediaBytes: number;
  auditEvents: number;
}): string {
  const lines: string[] = [];
  lines.push("# HELP practice_relay_request_count Total HTTP requests by method, path, status.");
  lines.push("# TYPE practice_relay_request_count counter");
  for (const [key, count] of metricsState.requestCount) {
    const [method, pathLabel, status] = key.split("\0");
    lines.push(
      `practice_relay_request_count{method="${method}",path="${pathLabel}",status="${status}"} ${count}`,
    );
  }
  lines.push(
    "# HELP practice_relay_request_latency_ms Request latency histogram in milliseconds.",
  );
  lines.push("# TYPE practice_relay_request_latency_ms histogram");
  let cumulative = 0;
  for (let i = 0; i < LATENCY_BUCKETS_MS.length; i++) {
    cumulative += metricsState.latencyBuckets[i] ?? 0;
    lines.push(
      `practice_relay_request_latency_ms_bucket{le="${LATENCY_BUCKETS_MS[i]}"} ${cumulative}`,
    );
  }
  lines.push(
    `practice_relay_request_latency_ms_bucket{le="+Inf"} ${metricsState.latencyInf}`,
  );
  lines.push(
    `practice_relay_request_latency_ms_sum ${metricsState.latencySumMs}`,
  );
  lines.push(
    `practice_relay_request_latency_ms_count ${metricsState.latencyCount}`,
  );
  lines.push("# HELP practice_relay_record_count Number of records in the active store.");
  lines.push("# TYPE practice_relay_record_count gauge");
  lines.push(`practice_relay_record_count ${opts.recordCount}`);
  lines.push("# HELP practice_relay_media_bytes Total active media bytes (best-effort).");
  lines.push("# TYPE practice_relay_media_bytes gauge");
  lines.push(`practice_relay_media_bytes ${opts.mediaBytes}`);
  lines.push("# HELP practice_relay_audit_events Audit event count when durable store enabled.");
  lines.push("# TYPE practice_relay_audit_events gauge");
  lines.push(`practice_relay_audit_events ${opts.auditEvents}`);
  lines.push("");
  return lines.join("\n");
}

/** Reset all in-process counters for deterministic API tests. */
export function resetRequestMetrics(): void {
  metricsState.requestCount.clear();
  metricsState.latencyCount = 0;
  metricsState.latencySumMs = 0;
  metricsState.latencyBuckets = LATENCY_BUCKETS_MS.map(() => 0);
  metricsState.latencyInf = 0;
}
