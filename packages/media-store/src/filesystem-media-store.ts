/** Single-process media lifecycle for memory and filesystem labs. */
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Readable } from "node:stream";
import type { ObjectStorageAdapter, MediaBlobMeta, MediaStoreAdapter, MediaStoreLimits, MediaUploadReservation, ReserveMediaUploadInput, StagedMediaFile } from "./types.js";
import { DEFAULT_MAX_MEDIA_OBJECT_BYTES, DEFAULT_MAX_MEDIA_RECORD_BYTES, MediaAdmissionError, MediaLeaseExpiredError, MediaQuotaError } from "./types.js";
import { createFilesystemObjectStore, createMemoryObjectStore } from "./object-store.js";
import { createObjectStoreFromEnv } from "./s3-store.js";
import { prepareStorageRoot, readStorageFile, safeId, writeStorageFile } from "./media-safety.js";
import { stageReadable, TransferGate, verifiedDownloadStage } from "./staging.js";
import { scanFilesystemMediaInventory } from "./inventory.js";

type LocalUpload = {
  reservation: MediaUploadReservation;
  input: ReserveMediaUploadInput;
  state: "reserved" | "object_ready" | "attached" | "abandoned";
  actual?: Pick<MediaBlobMeta, "byteSize" | "sha256">;
  release: () => void;
};

function validLimit(value: number | undefined, fallback: number, ceiling?: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || (ceiling !== undefined && resolved > ceiling)) throw new Error("invalid media store limit");
  return resolved;
}

/** Resolve bounded media limits while enforcing the product byte ceilings. */
export function resolveMediaStoreLimits(input: Partial<MediaStoreLimits> = {}): MediaStoreLimits {
  return {
    maxObjectBytes: validLimit(input.maxObjectBytes, DEFAULT_MAX_MEDIA_OBJECT_BYTES, DEFAULT_MAX_MEDIA_OBJECT_BYTES),
    maxRecordBytes: validLimit(input.maxRecordBytes, DEFAULT_MAX_MEDIA_RECORD_BYTES, DEFAULT_MAX_MEDIA_RECORD_BYTES),
    maxActiveTransfers: validLimit(input.maxActiveTransfers, 4),
    maxActiveTransfersDeployment: validLimit(input.maxActiveTransfersDeployment, 16),
    maxActiveUploadsPerRecord: validLimit(input.maxActiveUploadsPerRecord, 1),
    leaseMs: validLimit(input.leaseMs, 120_000),
  };
}

function immutableKey(recordId: string, takeId: string, operationId: string): string {
  return `${safeId(recordId)}/${safeId(takeId)}-${operationId}.bin`;
}

function isQuotaCharged(upload: LocalUpload): boolean {
  return upload.state === "reserved" || upload.state === "object_ready" || (upload.state === "abandoned" && upload.actual !== undefined);
}

/** Create a process-local lifecycle around a streaming object adapter. */
export function createMediaStoreOnObjectStore(objectStore: ObjectStorageAdapter, options: {
  rootDir?: string; stagingRoot?: string; limits?: Partial<MediaStoreLimits>; stateRoot?: string;
} = {}): MediaStoreAdapter {
  const limits = resolveMediaStoreLimits(options.limits);
  const rootDir = options.rootDir ?? `:object:${objectStore.backend}`;
  const stagingRoot = options.stagingRoot ?? path.join(process.cwd(), ".media-staging");
  const uploads = new Map<string, LocalUpload>();
  const metas = new Map<string, MediaBlobMeta>();
  const transferGate = new TransferGate(limits.maxActiveTransfers);
  const activeControllers = new Set<AbortController>();
  const activeStageCleanups = new Set<() => Promise<void>>();
  const stateRoot = options.stateRoot ? path.resolve(options.stateRoot) : undefined;
  const stateRealRoot = stateRoot ? prepareStorageRoot(stateRoot) : undefined;
  const stateKey = "__media-state.json";

  const deleteObjectArtifacts = async (storageKey: string): Promise<void> => {
    await objectStore.deleteObject(storageKey);
    if (stateRoot && objectStore.backend === "fs") {
      await objectStore.deleteObject(`${storageKey}.meta.json`);
    }
  };

  const persist = (): void => {
    if (!stateRoot || !stateRealRoot) return;
    const value = {
      version: 1,
      metas: [...metas.values()],
      uploads: [...uploads.values()].filter((upload) => upload.state !== "attached").map(({ release: _release, ...upload }) => upload),
    };
    writeStorageFile(stateRoot, stateRealRoot, stateKey, JSON.stringify(value));
  };

  const assertOwned = (reservation: MediaUploadReservation): LocalUpload => {
    const upload = uploads.get(reservation.id);
    if (!upload || upload.reservation.ownerToken !== reservation.ownerToken || upload.state === "abandoned") throw new MediaLeaseExpiredError();
    if (Date.parse(upload.reservation.expiresAt) <= Date.now()) {
      upload.state = "abandoned"; upload.release(); persist();
      throw new MediaLeaseExpiredError();
    }
    return upload;
  };
  const bytesForRecord = (recordId: string): number => {
    let total = 0;
    for (const meta of metas.values()) if (meta.recordId === recordId) total += meta.byteSize;
    for (const upload of uploads.values()) {
      if (upload.reservation.recordId === recordId && isQuotaCharged(upload)) total += upload.actual?.byteSize ?? upload.reservation.reservedBytes;
    }
    return total;
  };
  const trackStage = <T extends StagedMediaFile>(staged: T): T => {
    const original = staged.cleanup;
    let cleaned = false;
    const cleanup = async (): Promise<void> => { if (cleaned) return; cleaned = true; activeStageCleanups.delete(cleanup); await original(); };
    activeStageCleanups.add(cleanup);
    return { ...staged, cleanup };
  };

  return {
    rootDir, backend: objectStore.backend, limits,
    async initialize() {
      await objectStore.checkHealth?.();
      if (!stateRoot || !stateRealRoot) return;
      const raw = readStorageFile(stateRoot, stateRealRoot, stateKey);
      if (raw) {
        const parsed = JSON.parse(raw.toString("utf8")) as { version?: unknown; metas?: unknown; uploads?: unknown };
        if (parsed.version !== 1 || !Array.isArray(parsed.metas) || !Array.isArray(parsed.uploads)) throw new Error("invalid filesystem media state");
        for (const meta of parsed.metas as MediaBlobMeta[]) metas.set(meta.storageKey, meta);
        for (const saved of parsed.uploads as Omit<LocalUpload, "release">[]) {
          uploads.set(saved.reservation.id, { ...saved, state: "abandoned", release: () => undefined });
        }
      }
      const knownStorageKeys = new Set([
        ...metas.keys(),
        ...[...uploads.values()].map((upload) => upload.reservation.storageKey),
      ]);
      const legacy = await scanFilesystemMediaInventory(stateRoot, { knownStorageKeys });
      for (const entry of legacy.entries) if (!metas.has(entry.storageKey)) metas.set(entry.storageKey, entry);
      persist();
    },
    async reserveUpload(input) {
      safeId(input.recordId); safeId(input.takeId);
      if (input.declaredByteSize !== undefined && (!Number.isSafeInteger(input.declaredByteSize) || input.declaredByteSize < 0 || input.declaredByteSize > limits.maxObjectBytes)) throw new MediaQuotaError("invalid or oversized declared media length");
      const now = Date.now();
      for (const upload of uploads.values()) {
        if (["reserved", "object_ready"].includes(upload.state) && Date.parse(upload.reservation.expiresAt) <= now) {
          upload.state = "abandoned";
          upload.release();
        }
      }
      persist();
      const activeForRecord = [...uploads.values()].filter((upload) => upload.reservation.recordId === input.recordId && ["reserved", "object_ready"].includes(upload.state)).length;
      if (activeForRecord >= limits.maxActiveUploadsPerRecord) throw new MediaAdmissionError("another media upload is active for this record");
      const release = transferGate.acquire();
      const reservedBytes = input.declaredByteSize ?? limits.maxObjectBytes;
      if (bytesForRecord(input.recordId) + reservedBytes > limits.maxRecordBytes) { release(); throw new MediaQuotaError(); }
      const id = randomUUID();
      const reservation: MediaUploadReservation = { id, ownerToken: randomUUID(), storageKey: immutableKey(input.recordId, input.takeId, id), recordId: input.recordId, takeId: input.takeId, reservedBytes, expiresAt: new Date(Date.now() + limits.leaseMs).toISOString() };
      uploads.set(id, { reservation, input, state: "reserved", release });
      persist();
      return reservation;
    },
    async renewUpload(reservation) {
      const upload = assertOwned(reservation);
      upload.reservation = { ...upload.reservation, expiresAt: new Date(Date.now() + limits.leaseMs).toISOString() };
      persist();
      return upload.reservation;
    },
    async stageUpload(reservation, source: Readable, transferOptions) {
      assertOwned(reservation);
      const controller = new AbortController(); activeControllers.add(controller);
      const signal = transferOptions?.signal
        ? AbortSignal.any([controller.signal, transferOptions.signal])
        : controller.signal;
      let renewing = false;
      const timer = setInterval(() => { if (renewing) return; renewing = true; void this.renewUpload(reservation).catch(() => controller.abort(new MediaLeaseExpiredError())).finally(() => { renewing = false; }); }, Math.max(1_000, Math.floor(limits.leaseMs / 3)));
      timer.unref();
      try { return trackStage(await stageReadable(stagingRoot, source, limits.maxObjectBytes, signal)); }
      finally { clearInterval(timer); activeControllers.delete(controller); }
    },
    async storeUpload(reservation, staged, transferOptions) {
      const upload = assertOwned(reservation);
      const priorCharge = upload.reservation.reservedBytes;
      const recordUsage = bytesForRecord(upload.reservation.recordId) - priorCharge;
      if (staged.byteSize > limits.maxObjectBytes || recordUsage + staged.byteSize > limits.maxRecordBytes) throw new MediaQuotaError();
      upload.actual = { byteSize: staged.byteSize, sha256: staged.sha256 };
      persist();
      const controller = new AbortController(); activeControllers.add(controller);
      const signal = transferOptions?.signal
        ? AbortSignal.any([controller.signal, transferOptions.signal])
        : controller.signal;
      let renewing = false;
      const timer = setInterval(() => {
        if (renewing) return; renewing = true;
        void this.renewUpload(upload.reservation).then((next) => { upload.reservation = next; }, () => controller.abort()).finally(() => { renewing = false; });
      }, Math.max(1_000, Math.floor(limits.leaseMs / 3)));
      timer.unref();
      try {
        await objectStore.putFile(upload.reservation.storageKey, staged.path, { contentType: upload.input.contentType, byteSize: staged.byteSize, sha256: staged.sha256, signal });
      } finally { clearInterval(timer); activeControllers.delete(controller); }
      assertOwned(upload.reservation);
      upload.state = "object_ready";
      persist();
      return { storageKey: upload.reservation.storageKey, recordId: upload.input.recordId, takeId: upload.input.takeId, contentType: upload.input.contentType, originalName: upload.input.originalName, byteSize: staged.byteSize, sha256: staged.sha256, createdAt: new Date().toISOString() };
    },
    async attachUpload(reservation, options = {}) {
      const upload = assertOwned(reservation);
      if (upload.state !== "object_ready" || !upload.actual) throw new Error("media upload is not ready to attach");
      const meta: MediaBlobMeta = { storageKey: upload.reservation.storageKey, recordId: upload.input.recordId, takeId: upload.input.takeId, contentType: upload.input.contentType, originalName: upload.input.originalName, ...upload.actual, createdAt: new Date().toISOString() };
      const old = options.replacedStorageKey && metas.get(options.replacedStorageKey);
      if (old && old.storageKey !== meta.storageKey) {
        metas.set(old.storageKey, { ...old, cleanupPending: true });
      }
      metas.set(meta.storageKey, meta); upload.state = "attached"; upload.release(); uploads.delete(upload.reservation.id); persist();
      if (old && old.storageKey !== meta.storageKey) {
        try { await deleteObjectArtifacts(old.storageKey); metas.delete(old.storageKey); persist(); } catch { /* durable quota charge remains */ }
      }
      return meta;
    },
    async abandonUpload(reservation, staged) {
      await staged?.cleanup().catch(() => undefined);
      const upload = uploads.get(reservation.id);
      if (!upload || upload.reservation.ownerToken !== reservation.ownerToken) return;
      upload.state = "abandoned"; upload.release(); persist();
      try { await deleteObjectArtifacts(upload.reservation.storageKey); uploads.delete(reservation.id); persist(); } catch { /* recovery retries */ }
    },
    async stageDownload(storageKey, transferOptions) {
      const meta = metas.get(storageKey);
      if (!meta || meta.cleanupPending) return undefined;
      const release = transferGate.acquire();
      const controller = new AbortController(); activeControllers.add(controller);
      const signal = transferOptions?.signal
        ? AbortSignal.any([controller.signal, transferOptions.signal])
        : controller.signal;
      try {
        const stream = await objectStore.getStream(storageKey, { signal });
        if (!stream) { activeControllers.delete(controller); release(); return undefined; }
        const staged = trackStage(await verifiedDownloadStage(stagingRoot, stream, meta, { maxBytes: limits.maxObjectBytes, signal }));
        const cleanup = staged.cleanup;
        return { ...staged, cleanup: async () => { try { await cleanup(); } finally { controller.abort(); activeControllers.delete(controller); release(); } } };
      } catch (error) { controller.abort(); activeControllers.delete(controller); release(); throw error; }
    },
    async listForRecord(recordId) { return [...metas.values()].filter((meta) => meta.recordId === recordId && !meta.cleanupPending); },
    async totalBytesForRecord(recordId) { return bytesForRecord(recordId); },
    async totalBytesAll() { return [...metas.values()].reduce((sum, meta) => sum + meta.byteSize, 0) + [...uploads.values()].filter(isQuotaCharged).reduce((sum, upload) => sum + (upload.actual?.byteSize ?? upload.reservation.reservedBytes), 0); },
    async recover(options) {
      let examined = 0, deleted = 0, retained = 0, failed = 0;
      const cleanupCandidates = [...metas.values()].filter((meta) => meta.cleanupPending);
      for (const upload of uploads.values()) if (upload.state !== "attached" && Date.parse(upload.reservation.expiresAt) <= (options.now ?? new Date()).getTime()) {
        examined += 1; upload.state = "abandoned"; upload.release(); persist();
        const actual = upload.actual;
        const candidate: MediaBlobMeta = { storageKey: upload.reservation.storageKey, recordId: upload.input.recordId, takeId: upload.input.takeId, contentType: upload.input.contentType, byteSize: actual?.byteSize ?? upload.reservation.reservedBytes, sha256: actual?.sha256 ?? "", createdAt: upload.reservation.expiresAt };
        try {
          if (await options.isReferenced(candidate)) {
            if (!actual?.sha256) { retained += 1; continue; }
            metas.set(candidate.storageKey, candidate); uploads.delete(upload.reservation.id); persist();
            try {
              if (await options.isReferenced(candidate)) {
                if (metas.get(candidate.storageKey) === candidate) retained += 1;
              } else if (metas.get(candidate.storageKey) === candidate) {
                metas.set(candidate.storageKey, { ...candidate, cleanupPending: true });
                persist();
              }
            } catch {
              if (metas.get(candidate.storageKey) === candidate) {
                metas.set(candidate.storageKey, { ...candidate, cleanupPending: true });
                persist();
              }
              failed += 1;
            }
            continue;
          }
          await deleteObjectArtifacts(candidate.storageKey); uploads.delete(upload.reservation.id); persist(); deleted += 1;
        } catch { failed += 1; }
      }
      for (const meta of cleanupCandidates) {
        examined += 1;
        try {
          const referenced = await options.isReferenced(meta);
          if (metas.get(meta.storageKey) !== meta) continue;
          if (referenced) {
            const { cleanupPending: _pending, ...attached } = meta;
            metas.set(meta.storageKey, attached);
            persist(); retained += 1; continue;
          }
          await deleteObjectArtifacts(meta.storageKey); metas.delete(meta.storageKey); persist(); deleted += 1;
        } catch { failed += 1; }
      }
      return { examined, deleted, retained, failed };
    },
    async checkHealth() { await objectStore.checkHealth?.(); },
    async close() { for (const controller of activeControllers) controller.abort(new Error("media store closed")); await Promise.allSettled([...activeStageCleanups].map((cleanup) => cleanup())); for (const upload of uploads.values()) upload.release(); },
  };
}

/** Create the restart-persistent single-process filesystem media store. */
export function createFilesystemMediaStore(rootDir: string, options: { stagingRoot?: string; limits?: Partial<MediaStoreLimits> } = {}): MediaStoreAdapter {
  return createMediaStoreOnObjectStore(createFilesystemObjectStore(rootDir), { rootDir: path.resolve(rootDir), stateRoot: rootDir, stagingRoot: options.stagingRoot ?? path.join(rootDir, ".staging"), limits: options.limits });
}

export const createMediaStore = createFilesystemMediaStore;

/** Create an isolated in-memory object store with staged transfer semantics. */
export function createMemoryMediaStore(options: { stagingRoot?: string; limits?: Partial<MediaStoreLimits> } = {}): MediaStoreAdapter {
  return createMediaStoreOnObjectStore(createMemoryObjectStore(), { rootDir: ":memory:", ...options });
}

/** Create the single-process store selected by media object-store environment. */
export function createMediaStoreFromEnv(env: NodeJS.ProcessEnv = process.env, options: { mediaRoot?: string; stagingRoot?: string; fetchImpl?: typeof fetch; limits?: Partial<MediaStoreLimits> } = {}): MediaStoreAdapter {
  const root = options.mediaRoot ?? env.PRACTICE_RELAY_MEDIA?.trim() ?? path.join(process.cwd(), "data", "media");
  const objectStore = createObjectStoreFromEnv(env, { fsRoot: root, fetchImpl: options.fetchImpl });
  return createMediaStoreOnObjectStore(objectStore, {
    rootDir: objectStore.backend === "fs" ? root : `:${objectStore.backend}:`,
    stateRoot: objectStore.backend === "memory" ? undefined : root,
    stagingRoot: options.stagingRoot ?? env.PRACTICE_RELAY_MEDIA_STAGING?.trim(),
    limits: options.limits,
  });
}
