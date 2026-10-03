/** Bounded private-file staging for upload and download streams. */
import { createHash, randomUUID } from "node:crypto";
import { open, rm } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { MediaAdmissionError, MediaIntegrityError, type MediaBlobMeta, type StagedMediaDownload, type StagedMediaFile } from "./types.js";
import { createStorageReadStream, prepareStorageRoot } from "./media-safety.js";

function asBytes(chunk: unknown): Uint8Array {
  if (typeof chunk === "string") return Buffer.from(chunk);
  if (chunk instanceof Uint8Array) return chunk;
  throw new TypeError("unsupported media stream chunk");
}

/** A private staging root must not be shared with the object namespace. */
export async function prepareStagingRoot(root: string): Promise<string> {
  return prepareStorageRoot(path.resolve(root));
}

/** Write and hash one bounded readable into a private staging file. */
export async function stageReadable(
  root: string,
  source: Readable,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<StagedMediaFile> {
  const stagingRoot = await prepareStagingRoot(root);
  const filePath = path.join(stagingRoot, `${randomUUID()}.stage`);
  const handle = await open(filePath, "wx", 0o600);
  const hash = createHash("sha256");
  let byteSize = 0;
  let cleaned = false;
  const abort = (): void => {
    source.destroy(signal?.reason instanceof Error ? signal.reason : new Error("media transfer aborted"));
  };
  const cleanup = async (): Promise<void> => {
    if (cleaned) return;
    cleaned = true;
    await rm(filePath, { force: true });
  };
  try {
    if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
    for await (const chunk of source) {
      const bytes = asBytes(chunk);
      byteSize += bytes.byteLength;
      if (byteSize > maxBytes) throw new Error(`media stream exceeds ${maxBytes} byte limit`);
      hash.update(bytes);
      let offset = 0;
      while (offset < bytes.byteLength) {
        const written = await handle.write(bytes, offset, bytes.byteLength - offset);
        if (written.bytesWritten < 1) throw new Error("media staging write made no progress");
        offset += written.bytesWritten;
      }
    }
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await cleanup();
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
  await handle.close();
  return { path: filePath, byteSize, sha256: hash.digest("hex"), cleanup };
}

/** Fully stage a download and verify it before callers can send headers. */
export async function verifiedDownloadStage(
  root: string,
  source: Readable,
  meta: MediaBlobMeta,
  options: { maxBytes: number; signal?: AbortSignal },
): Promise<StagedMediaDownload> {
  const staged = await stageReadable(root, source, options.maxBytes, options.signal);
  if (staged.byteSize !== meta.byteSize) {
    await staged.cleanup();
    throw new MediaIntegrityError("byteSize");
  }
  if (staged.sha256 !== meta.sha256) {
    await staged.cleanup();
    throw new MediaIntegrityError("sha256");
  }
  return {
    ...staged,
    meta,
    createReadStream: () => {
      options.signal?.throwIfAborted();
      const stream = createStorageReadStream(path.dirname(staged.path), path.dirname(staged.path), path.basename(staged.path));
      if (!stream) throw new Error("verified media stage is missing");
      const abort = (): void => {
        stream.destroy(options.signal?.reason instanceof Error ? options.signal.reason : new Error("media transfer aborted"));
      };
      options.signal?.addEventListener("abort", abort, { once: true });
      stream.once("close", () => options.signal?.removeEventListener("abort", abort));
      return stream;
    },
  };
}

/** Small process-local semaphore used by every transfer type. */
export class TransferGate {
  private active = 0;

  constructor(private readonly maximum: number) {}

  acquire(): () => void {
    if (this.active >= this.maximum) throw new MediaAdmissionError("process media transfer capacity exhausted");
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }
}
