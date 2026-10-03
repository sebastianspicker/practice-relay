/** Measure large streaming transfers using synthetic bytes in a disposable local store. */
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Readable } from "node:stream";
import { createFilesystemMediaStore } from "@practice-relay/media-store";

const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "relay-media-benchmark-")));
const store = createFilesystemMediaStore(root);
try {
  await store.initialize();
  for (const byteSize of [1024 * 1024, 64 * 1024 * 1024]) {
    const chunk = Buffer.alloc(64 * 1024, 23);
    const source = Readable.from((function* () {
      for (let offset = 0; offset < byteSize; offset += chunk.length) yield chunk;
    })());
    const baselineRss = process.memoryUsage().rss;
    let peakRss = baselineRss;
    const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 10);
    try {
      const start = performance.now();
      const reservation = await store.reserveUpload({ recordId: `size-${byteSize}`, takeId: "take", contentType: "application/octet-stream", declaredByteSize: byteSize });
      const stage = await store.stageUpload(reservation, source);
      try { await store.storeUpload(reservation, stage); await store.attachUpload(reservation); }
      finally { await stage.cleanup(); }
      const uploadMs = performance.now() - start;
      const downloadStart = performance.now();
      const download = await store.stageDownload(reservation.storageKey);
      assert.ok(download);
      let received = 0;
      try { for await (const bytes of download.createReadStream()) received += (bytes as Buffer).length; }
      finally { await download.cleanup(); }
      assert.equal(received, byteSize);
      const downloadMs = performance.now() - downloadStart;
      console.log(JSON.stringify({ byteSize, uploadMs, downloadMs, peakRssIncreaseBytes: Math.max(peakRss, process.memoryUsage().rss) - baselineRss, generatedChunkBytes: chunk.length }));
    } finally { clearInterval(sampler); }
  }
} finally { await store.close(); await rm(root, { recursive: true, force: true }); }
