/**
 * In-memory WorkRecord store adapter.
 * Why: the core retains a deterministic revision-aware store without IO.
 */
import type { WorkRecord } from "./index.ts";

/** In-memory record store interface. */
export interface RecordStore {
  create: (record: WorkRecord) => WorkRecord;
  get: (id: string) => WorkRecord | undefined;
  list: () => WorkRecord[];
  update: (id: string, record: WorkRecord) => WorkRecord;
  delete: (id: string) => boolean;
}

/** Creates a revision-aware Map-backed record store. */
export function createRecordStore(): RecordStore {
  const map = new Map<string, WorkRecord>();
  return {
    create(record) {
      if (map.has(record.id)) throw new Error(`record ${record.id} already exists`);
      const created = { ...record, revision: 0 };
      map.set(record.id, created);
      return created;
    },
    get: (id) => map.get(id),
    list: () => [...map.values()],
    update(id, record) {
      const previous = map.get(id);
      if (!previous) throw new Error(`record ${id} not found`);
      const previousRevision = previous.revision ?? 0;
      if (record.revision !== undefined && record.revision !== previousRevision) {
        throw new Error(`record ${id} revision conflict: expected ${previousRevision}, received ${record.revision}`);
      }
      const updated = { ...record, id, revision: previousRevision + 1 };
      map.set(id, updated);
      return updated;
    },
    delete: (id) => map.delete(id),
  };
}
