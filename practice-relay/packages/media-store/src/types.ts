/**
 * Public media-store contracts shared by filesystem, object, and S3 adapters.
 *
 * Why: callers retain one stable shape while backends preserve their own safety boundaries.
 */

/** Value returned synchronously by local stores or asynchronously by remote stores. */
export type MaybePromise<T> = T | Promise<T>;

/** Persisted identity, checksum, and lifecycle metadata for one media blob. */
export interface MediaBlobMeta {
  storageKey: string;
  recordId: string;
  takeId: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  originalName?: string;
  createdAt: string;
  /** Soft-delete marker for lifecycle GC. */
  deletedAt?: string;
}

/**
 * S3-like object storage surface keyed by caller-provided relative paths.
 * Methods may return Promises for network backends (S3); memory/fs stay sync.
 */
export interface ObjectStorageAdapter {
  /** Put bytes at key (relative object key, not absolute path). */
  putObject: (
    key: string,
    bytes: Buffer,
    opts?: { contentType?: string },
  ) => MaybePromise<void>;
  /** Get bytes by key; undefined if missing. */
  getObject: (key: string) => MaybePromise<Buffer | undefined>;
  /** Delete object if present. */
  deleteObject?: (key: string) => MaybePromise<boolean>;
  /** Backend label for readiness/metrics. */
  backend?: string;
}

/**
 * Config for S3-compatible object stores (AWS S3, MinIO, Garage, etc.).
 * Prefer path-style (`forcePathStyle: true`) for MinIO local labs.
 */
export interface S3CompatibleConfig {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle?: boolean;
  region?: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Media domain store keyed by record and take identifiers.
 * Methods may return Promises when backed by network object storage.
 */
export interface MediaStoreAdapter {
  rootDir: string;
  put: (
    recordId: string,
    takeId: string,
    bytes: Buffer,
    opts?: { contentType?: string; originalName?: string },
  ) => MaybePromise<MediaBlobMeta>;
  get: (
    storageKey: string,
  ) => MaybePromise<{ meta: MediaBlobMeta; bytes: Buffer } | undefined>;
  getByTake: (
    recordId: string,
    takeId: string,
  ) => MaybePromise<{ meta: MediaBlobMeta; bytes: Buffer } | undefined>;
  listForRecord: (recordId: string) => MaybePromise<MediaBlobMeta[]>;
  /** Soft-delete blob (keeps meta until purge). */
  softDelete: (storageKey: string) => MaybePromise<MediaBlobMeta | undefined>;
  /** Delete a blob and its metadata immediately after a transactional hand-off. */
  hardDelete: (storageKey: string) => MaybePromise<boolean>;
  /** Remove soft-deleted blobs older than maxAgeMs (default 0 = all deleted). */
  purgeDeleted: (maxAgeMs?: number) => MaybePromise<number>;
  /** Total physically retained byte size for a record, including tombstones. */
  totalBytesForRecord: (recordId: string) => MaybePromise<number>;
  /** Backend label. */
  backend?: string;
  /** Total physically retained media bytes across all records (best-effort). */
  totalBytesAll?: () => MaybePromise<number>;
}

/** @deprecated Prefer MediaStoreAdapter; same shape. */
export type MediaStore = MediaStoreAdapter;
