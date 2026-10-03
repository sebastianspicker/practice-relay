/** Startup reconciliation of private files left by interrupted JSON publication or removal. */
import path from "node:path";
import { listManagedDirectory, managedDirectoryExists, regularFileExists, removeManagedDirectory, removeRegularFile } from "./store-paths.js";

function originalName(name: string): string | undefined {
  let candidate = name;
  let wrapped = false;
  for (;;) {
    const match = /^\.(.+)\.\d+\.[a-f0-9]{18}\.(?:tmp|removing)$/u.exec(candidate);
    if (!match) return wrapped ? candidate : undefined;
    wrapped = true;
    candidate = match[1]!;
  }
}

function isRestoreStage(name: string): boolean {
  return /^restore-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(name);
}

/** Run only after journal recovery, when no transaction or restore stage remains active. */
export function cleanJsonTemporaries(root: string): void {
  for (const area of ["records", "events", "audit", "journal"]) {
    const directory = path.join(root, area);
    for (const name of listManagedDirectory(directory)) {
      const original = originalName(name);
      const entry = path.join(directory, name);
      if (area === "journal" && isRestoreStage(original ?? name)) {
        if (managedDirectoryExists(entry)) removeManagedDirectory(entry);
        continue;
      }
      if (!original) continue;
      const expected = area === "records" ? /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}\.json$/u.test(original)
        : area === "events" ? /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}\.jsonl$/u.test(original)
        : area === "audit" ? original === "audit.jsonl"
        : ["pending.json", "counters.json", "restore.json"].includes(original);
      if (expected && regularFileExists(entry)) removeRegularFile(entry);
    }
  }
}
