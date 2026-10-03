/** Streaming media storage contracts shared by local and PostgreSQL adapters. */
import type { Readable } from "node:stream";
import type { Database } from "@practice-relay/database";

export const DEFAULT_MAX_MEDIA_OBJECT_BYTES = 200 * 1024 * 1024;
export const DEFAULT_MAX_MEDIA_RECORD_BYTES = 1024 * 1024 * 1024;

/** Persisted identity, checksum, and lifecycle metadata for one immutable blob. */
export interface MediaBlobMeta {
  readonly storageKey: string;
  readonly recordId: string;
  readonly takeId: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly originalName?: string;
  readonly createdAt: string;
  readonly cleanupPending?: boolean;
  /** Legacy filesystem tombstone accepted only by offline inventory migration. */
  readonly deletedAt?: string;
}

/** Lease-bound ownership proof for one admitted upload. */
export interface MediaUploadReservation {
  readonly id: string;
  readonly ownerToken: string;
  readonly storageKey: string;
  readonly recordId: string;
  readonly takeId: string;
  readonly reservedBytes: number;
  readonly expiresAt: string;
}

/** Private local stage. Call cleanup exactly once when the transfer finishes. */
export interface StagedMediaFile {
  readonly path: string;
  readonly byteSize: number;
  readonly sha256: string;
  cleanup(): Promise<void>;
}

/** Fully downloaded and verified local stage; headers may be sent after this exists. */
export interface StagedMediaDownload extends StagedMediaFile {
  readonly meta: MediaBlobMeta;
  createReadStream(): Readable;
}

/** Bounded byte, concurrency, and lease limits for media operations. */
export interface MediaStoreLimits {
  readonly maxObjectBytes: number;
  readonly maxRecordBytes: number;
  readonly maxActiveTransfers: number;
  readonly maxActiveTransfersDeployment: number;
  readonly maxActiveUploadsPerRecord: number;
  readonly leaseMs: number;
}

/** Validated record identity and declared properties used during admission. */
export interface ReserveMediaUploadInput {
  readonly recordId: string;
  readonly takeId: string;
  readonly declaredByteSize?: number;
  readonly contentType: string;
  readonly originalName?: string;
}

/** Metadata attachment context and optional replacement identity. */
export interface AttachMediaUploadOptions {
  readonly replacedStorageKey?: string;
  /** Transaction-bound database used to commit metadata with the WorkRecord update. */
  readonly database?: Database;
}

/** Canonical-reference callback and time boundary used by cleanup recovery. */
export interface MediaRecoveryOptions {
  /** Must consult the canonical WorkRecord before physical deletion. */
  readonly isReferenced: (meta: MediaBlobMeta) => Promise<boolean>;
  readonly now?: Date;
}

/** Counts from one bounded recovery pass. */
export interface MediaRecoveryResult {
  readonly examined: number;
  readonly deleted: number;
  readonly retained: number;
  readonly failed: number;
}

/** Optional cancellation supplied by the request or caller owning a transfer. */
export interface MediaTransferOptions {
  readonly signal?: AbortSignal;
}

/** Media domain store. Network and request bytes always pass through bounded files. */
export interface MediaStoreAdapter {
  readonly rootDir: string;
  readonly backend: string;
  readonly limits: MediaStoreLimits;
  initialize(): Promise<void>;
  reserveUpload(input: ReserveMediaUploadInput): Promise<MediaUploadReservation>;
  renewUpload(reservation: MediaUploadReservation): Promise<MediaUploadReservation>;
  stageUpload(reservation: MediaUploadReservation, source: Readable, options?: MediaTransferOptions): Promise<StagedMediaFile>;
  storeUpload(reservation: MediaUploadReservation, staged: StagedMediaFile, options?: MediaTransferOptions): Promise<MediaBlobMeta>;
  attachUpload(reservation: MediaUploadReservation, options?: AttachMediaUploadOptions): Promise<MediaBlobMeta>;
  abandonUpload(reservation: MediaUploadReservation, staged?: StagedMediaFile): Promise<void>;
  stageDownload(storageKey: string, options?: MediaTransferOptions): Promise<StagedMediaDownload | undefined>;
  listForRecord(recordId: string): Promise<MediaBlobMeta[]>;
  totalBytesForRecord(recordId: string): Promise<number>;
  totalBytesAll(): Promise<number>;
  recover(options: MediaRecoveryOptions): Promise<MediaRecoveryResult>;
  checkHealth(): Promise<void>;
  close(): Promise<void>;
}

/** Stored bytes no longer match their authoritative metadata. */
export class MediaIntegrityError extends Error {
  constructor(readonly reason: "byteSize" | "sha256") {
    super(`media integrity check failed: ${reason} mismatch`);
    this.name = "MediaIntegrityError";
  }
}

/** A declared or actual media size exceeds an admission limit. */
export class MediaQuotaError extends Error {
  constructor(message = "media would exceed the per-record storage quota") {
    super(message);
    this.name = "MediaQuotaError";
  }
}

/** The caller no longer owns a live upload or transfer lease. */
export class MediaLeaseExpiredError extends Error {
  constructor() {
    super("media upload lease expired");
    this.name = "MediaLeaseExpiredError";
  }
}

/** Current process or deployment concurrency prevents a new transfer. */
export class MediaAdmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaAdmissionError";
  }
}

/** Code carried when an immutable media object already exists at its key. */
export const MEDIA_OBJECT_EXISTS = "MEDIA_OBJECT_EXISTS";

/** An immutable object write found an existing object at the same key. */
export class MediaObjectExistsError extends Error {
  readonly code = MEDIA_OBJECT_EXISTS;

  constructor(message: string) {
    super(message);
    this.name = "MediaObjectExistsError";
  }
}

/** Identify an immutable object conflict by its stable code, independent of class identity. */
export function isMediaObjectExists(err: unknown): err is MediaObjectExistsError {
  return err instanceof Error && (err as { code?: unknown }).code === MEDIA_OBJECT_EXISTS;
}

/** Immutable byte-object operations beneath the authoritative metadata layer. */
export interface ObjectStorageAdapter {
  readonly backend: string;
  putFile(key: string, filePath: string, options: { contentType: string; byteSize: number; sha256: string; signal?: AbortSignal }): Promise<void>;
  getStream(key: string, options?: { signal?: AbortSignal }): Promise<Readable | undefined>;
  deleteObject(key: string): Promise<boolean>;
  checkHealth?(): Promise<void>;
}

/** Connection and signing settings for an S3-compatible object service. */
export interface S3CompatibleConfig {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle?: boolean;
  region?: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
}
