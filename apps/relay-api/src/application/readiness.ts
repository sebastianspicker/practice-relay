/** Runtime readiness probes kept independent from HTTP formatting. */
import type { ApiRuntime } from "../runtime.ts";
import { durableStore, storeBackendLabel } from "./records.ts";

/** Probe the process dependencies used by the readiness endpoint. */
export async function checkReadiness(runtime: ApiRuntime) {
  const durable = durableStore(runtime);
  const durableRequired = runtime.readinessPolicy.requireDurable;
  let store = true;
  try { await runtime.recordStore.checkHealth(); await runtime.coordination.checkHealth(); } catch { store = false; }
  let mediaRoot = true;
  try { await runtime.mediaStore.checkHealth(); } catch { mediaRoot = false; }
  const checks = {
    store,
    durableConfigured: runtime.recordStore.durable,
    durableRequired,
    durableReady: !durableRequired || Boolean(durable),
    storeBackend: storeBackendLabel(runtime),
    mediaRoot,
    objectStore: runtime.objectStoreMode,
    mediaBackend: runtime.mediaStore.backend ?? runtime.objectStoreMode,
    secrets: !runtime.opsSecrets.usingDevDefaults || !runtime.readinessPolicy.requireSecrets,
    ltiKeys: runtime.labRsaKeys ? "rsa" : "hmac",
  };
  return {
    ok: checks.store && checks.durableReady && checks.mediaRoot && checks.secrets,
    checks,
  };
}
