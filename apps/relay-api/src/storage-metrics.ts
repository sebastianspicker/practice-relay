/** Periodic storage snapshots keep scrape cost independent of collection size. */
import type { ApiRuntime } from "./runtime.ts";

type StorageSnapshot = { recordCount: number; mediaBytes: number; auditEvents: number; refreshedAt: number; failures: number };
const snapshots = new WeakMap<ApiRuntime, StorageSnapshot>();
const refreshing = new WeakMap<ApiRuntime, Promise<void>>();

/** Read the last complete snapshot without performing storage I/O. */
export function storageMetrics(runtime: ApiRuntime): StorageSnapshot {
  return snapshots.get(runtime) ?? { recordCount: 0, mediaBytes: 0, auditEvents: 0, refreshedAt: 0, failures: 0 };
}

/** Refresh once, retain prior gauges on failure, and expose staleness separately. */
export async function refreshStorageMetrics(runtime: ApiRuntime): Promise<void> {
  const pending = refreshing.get(runtime);
  if (pending) return pending;
  const work = (async () => {
    const previous = storageMetrics(runtime);
    try {
      const [records, mediaBytes] = await Promise.all([
        runtime.recordStore.healthMetrics(), runtime.mediaStore.totalBytesAll?.() ?? 0,
      ]);
      snapshots.set(runtime, { recordCount: records.recordCount, auditEvents: records.auditEventCount, mediaBytes, refreshedAt: Date.now(), failures: previous.failures });
    } catch {
      snapshots.set(runtime, { ...previous, failures: previous.failures + 1 });
    }
  })();
  refreshing.set(runtime, work);
  try { await work; } finally { refreshing.delete(runtime); }
}

/** Start a bounded periodic refresh and return its shutdown hook. */
export function startStorageMetrics(runtime: ApiRuntime): () => void {
  void refreshStorageMetrics(runtime);
  const timer = setInterval(() => { void refreshStorageMetrics(runtime); }, 15_000);
  timer.unref();
  return () => clearInterval(timer);
}

/** Additional gauges make uninitialized or stale storage measurements explicit. */
export function storageFreshnessMetrics(runtime: ApiRuntime): string {
  const snapshot = storageMetrics(runtime);
  return `# TYPE practice_relay_storage_refreshed_timestamp_seconds gauge\npractice_relay_storage_refreshed_timestamp_seconds ${snapshot.refreshedAt / 1000}\n# TYPE practice_relay_storage_refresh_failures_total counter\npractice_relay_storage_refresh_failures_total ${snapshot.failures}\n`;
}
