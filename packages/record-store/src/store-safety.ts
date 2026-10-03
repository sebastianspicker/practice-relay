/**
 * Compatibility facade for centralized filesystem, manifest, and event-log safety checks.
 *
 * Why: tenant isolation and restore validation must not be reimplemented by callers.
 */
export {
  ensureDir,
  eventsPath,
  recordPath,
  resolveTenantRoot,
  safePathSegment,
} from "./store-paths.js";
export { parseBackupManifest } from "./store-manifest.js";
export { validateJsonLines } from "./store-events.js";
