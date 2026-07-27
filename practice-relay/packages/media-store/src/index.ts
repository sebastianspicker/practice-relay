/**
 * Public facade for Practice Relay media storage.
 *
 * Why: retain the package entrypoint while keeping safety, S3, and lifecycle concerns bounded.
 */
export type { MaybePromise, MediaBlobMeta, ObjectStorageAdapter, S3CompatibleConfig, MediaStoreAdapter, MediaStore } from "./types.js";
export { awaitMaybe, createFilesystemObjectStore, createMemoryObjectStore } from "./object-store.js";
export { createS3CompatibleObjectStore, createObjectStoreFromEnv } from "./s3-store.js";
export { createMediaStoreOnObjectStore } from "./object-media-store.js";
export { createMediaStore, createFilesystemMediaStore, createMemoryMediaStore, createMediaStoreFromEnv } from "./filesystem-media-store.js";

