/** Minimal persistence port kept independent from concrete storage adapters. */
import type { WorkRecord } from "./types.ts";

/** Minimal persistence port required by the portable WorkRecord domain. */
export interface RecordStore {
  create: (record: WorkRecord) => Promise<WorkRecord>;
  get: (id: string) => Promise<WorkRecord | undefined>;
  list: () => Promise<WorkRecord[]>;
  update: (id: string, record: WorkRecord) => Promise<WorkRecord>;
  delete: (id: string) => Promise<boolean>;
  /**
   * Lock one current aggregate, run a synchronous pure transition, and persist
   * its next revision before releasing the lock.
   */
  mutate: (
    id: string,
    transition: (latest: WorkRecord) => WorkRecord,
    options?: RecordMutationOptions,
  ) => Promise<WorkRecord>;
}

/** Audit and optimistic-concurrency inputs attached to one atomic mutation. */
export interface RecordMutationOptions {
  readonly expectedRevision?: number;
  readonly actorId?: string;
  readonly kind?: string;
  readonly detail?: string;
}
