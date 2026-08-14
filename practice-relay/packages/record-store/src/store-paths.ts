/**
 * Filesystem path validation and layout shared by record-store backends.
 *
 * Why: tenant isolation must remain centralized instead of being recreated by callers.
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

/** Ensure a durable-store directory exists before filesystem operations. */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

/** Validate a tenant or record id as one portable filesystem segment without rewriting it. */
export function safePathSegment(id: string): string {
  if (
    typeof id !== "string" ||
    !/^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/.test(id) ||
    id === "." ||
    id === ".."
  ) {
    throw new Error("invalid filesystem path segment");
  }
  return id;
}

/**
 * Resolve the effective data root for a store, applying optional tenant prefix.
 * Layout: `{rootDir}/{tenantId}/work-records|events|audit|backups` when tenantId set.
 */
export function resolveTenantRoot(
  rootDir: string,
  tenantId?: string,
): string {
  const root = path.resolve(rootDir);
  if (tenantId === undefined) return root;
  return path.join(root, safePathSegment(tenantId));
}

/** Resolve the validated JSON record path beneath a store root. */
export function recordPath(root: string, id: string): string {
  const safe = safePathSegment(id);
  return path.join(root, "records", `${safe}.json`);
}

/** Resolve the validated event-log path beneath a store root. */
export function eventsPath(root: string, id: string): string {
  const safe = safePathSegment(id);
  return path.join(root, "events", `${safe}.jsonl`);
}
