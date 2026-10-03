/**
 * Tests - api-metrics.test.ts
 *
 * Why: protect bounded request labels and stable Prometheus exposition.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  recordRequestMetrics,
  renderPrometheusMetricsText,
  resetRequestMetrics,
} from "./api-metrics.ts";

function exposition(): string {
  return renderPrometheusMetricsText({
    recordCount: 0,
    mediaBytes: 0,
    auditEvents: 0,
  });
}

describe("API metrics", () => {
  it("keeps normalized standard methods, paths, statuses, and counts", () => {
    resetRequestMetrics();
    recordRequestMetrics("get", "/health", 200, 5);
    recordRequestMetrics("POST", "/work-records", 201, 10);
    recordRequestMetrics("propfind", "/profiles", 207, 15);
    const body = exposition();

    assert.match(
      body,
      /^practice_relay_request_count\{method="GET",path="\/health",status="200"\} 1$/m,
    );
    assert.match(
      body,
      /^practice_relay_request_count\{method="POST",path="\/work-records",status="201"\} 1$/m,
    );
    assert.match(
      body,
      /^practice_relay_request_count\{method="PROPFIND",path="\/profiles",status="207"\} 1$/m,
    );
    resetRequestMetrics();
  });

  it("aggregates unknown methods and paths into bounded request labels", () => {
    resetRequestMetrics();
    for (let index = 0; index < 300; index += 1) {
      recordRequestMetrics(`TOKEN${index}`, `/unrecognized-${index}`, 418, 1);
    }
    const body = exposition();
    const requestSeries = body
      .split("\n")
      .filter((line) => line.startsWith("practice_relay_request_count{"));

    assert.deepEqual(requestSeries, [
      'practice_relay_request_count{method="OTHER",path="/other",status="418"} 300',
    ]);
    assert.doesNotMatch(body, /TOKEN\d+/);
    resetRequestMetrics();
  });

  it("retains exact latency boundaries, cumulative counts, and totals", () => {
    resetRequestMetrics();
    for (const ms of [5, 6, 10, 5000, 5001]) {
      recordRequestMetrics("GET", "/health", 200, ms);
    }
    const body = exposition();
    const latencyBuckets = body
      .split("\n")
      .filter((line) => line.startsWith("practice_relay_request_latency_ms_bucket"));

    assert.deepEqual(latencyBuckets, [
      'practice_relay_request_latency_ms_bucket{le="5"} 1',
      'practice_relay_request_latency_ms_bucket{le="10"} 3',
      'practice_relay_request_latency_ms_bucket{le="25"} 3',
      'practice_relay_request_latency_ms_bucket{le="50"} 3',
      'practice_relay_request_latency_ms_bucket{le="100"} 3',
      'practice_relay_request_latency_ms_bucket{le="250"} 3',
      'practice_relay_request_latency_ms_bucket{le="500"} 3',
      'practice_relay_request_latency_ms_bucket{le="1000"} 3',
      'practice_relay_request_latency_ms_bucket{le="2500"} 3',
      'practice_relay_request_latency_ms_bucket{le="5000"} 4',
      'practice_relay_request_latency_ms_bucket{le="+Inf"} 5',
    ]);
    assert.match(body, /^practice_relay_request_latency_ms_sum 10022$/m);
    assert.match(body, /^practice_relay_request_latency_ms_count 5$/m);
    resetRequestMetrics();
  });

  it("clears request series and latency counters on reset", () => {
    resetRequestMetrics();
    recordRequestMetrics("GET", "/health", 200, 5);
    resetRequestMetrics();
    const body = exposition();

    assert.doesNotMatch(body, /practice_relay_request_count\{/);
    assert.match(body, /^practice_relay_request_latency_ms_bucket\{le="5"\} 0$/m);
    assert.match(body, /^practice_relay_request_latency_ms_bucket\{le="\+Inf"\} 0$/m);
    assert.match(body, /^practice_relay_request_latency_ms_sum 0$/m);
    assert.match(body, /^practice_relay_request_latency_ms_count 0$/m);
  });
});
