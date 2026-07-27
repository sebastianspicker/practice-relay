/**
 * Tests: session-sync.test.mjs
 *
 * Why: guard shipped behaviour for technical reviewers; drive real modules,
 * not a re-implementation of domain/export/validate logic.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createSketchMotif, emitMotif } from "./motif.mjs";
import { addFromPalette } from "./canvas.mjs";
import {
  createMemoryChannel,
  createSessionSync,
  createYjsChannel,
  openSyncChannel,
  resolveSyncMode,
  subscribeMemoryChannel,
  SYNC_CHANNEL,
  SYNC_MODES,
} from "./session-sync.mjs";

test("session-sync publishes and receives Motif snapshots across peers", () => {
  const bus = createMemoryChannel();
  /** @type {import("./motif.mjs").MotifDocument | null} */
  let remote = null;
  const a = createSessionSync({
    channel: bus,
    origin: "tab-a",
    key: "test-key",
    mode: "memory",
  });
  const b = createSessionSync({
    channel: bus,
    origin: "tab-b",
    key: "test-key",
    mode: "memory",
    onRemote: (doc) => {
      remote = doc;
    },
  });

  let doc = createSketchMotif("sync-1", "Sync");
  doc = addFromPalette(doc, "walk");
  const rev = a.publish(doc);
  assert.equal(rev, 1);
  assert.ok(remote);
  assert.equal(remote.id, "sync-1");
  assert.equal(remote.items.length, 1);
  assert.equal(remote.items[0].symbol, "walk");

  doc = addFromPalette(doc, "turn");
  assert.equal(a.publish(doc), 2);
  assert.equal(remote.items.length, 2);

  remote = null;
  bus.postMessage({
    type: "motif-doc",
    key: "test-key",
    rev: 1,
    docJson: emitMotif(doc),
    origin: "tab-a",
  });
  assert.equal(remote, null);

  remote = null;
  b.publish(doc);
  assert.equal(remote, null);

  a.close();
  b.close();
  assert.equal(SYNC_CHANNEL.includes("mvei.workbench"), true);
});

test("session-sync converges delayed equal-revision publications by origin", () => {
  /** @type {Array<{ recipient: { onmessage: ((ev: { data: unknown }) => void) | null }, data: unknown }>} */
  const deliveries = [];
  const makeChannel = () => ({
    onmessage: null,
    postMessage() {},
  });
  const channelA = makeChannel();
  const channelB = makeChannel();
  channelA.postMessage = (data) => deliveries.push({ recipient: channelB, data });
  channelB.postMessage = (data) => deliveries.push({ recipient: channelA, data });

  /** @type {import("./motif.mjs").MotifDocument | null} */
  let appliedAtA = null;
  let remoteApplications = 0;
  const a = createSessionSync({
    channel: channelA,
    origin: "tab-a",
    key: "delayed-key",
    onRemote: (doc) => {
      appliedAtA = doc;
      remoteApplications++;
    },
  });
  const b = createSessionSync({
    channel: channelB,
    origin: "tab-b",
    key: "delayed-key",
  });

  const docA = createSketchMotif("delayed-a", "A");
  const docB = addFromPalette(createSketchMotif("delayed-b", "B"), "walk");
  assert.equal(a.publish(docA), 1);
  assert.equal(b.publish(docB), 1);
  assert.equal(deliveries.length, 2, "both first publications should be delayed");

  for (const delivery of deliveries.splice(0)) {
    delivery.recipient.onmessage?.({ data: delivery.data });
  }
  assert.equal(a.rev, 1);
  assert.equal(b.rev, 1);
  assert.equal(appliedAtA?.id, "delayed-b", "higher origin snapshot wins at equal rev");
  assert.equal(remoteApplications, 1);

  channelB.postMessage({
    type: "motif-doc",
    key: "delayed-key",
    rev: 0,
    docJson: emitMotif(docA),
    origin: "tab-z",
  });
  for (const delivery of deliveries.splice(0)) {
    delivery.recipient.onmessage?.({ data: delivery.data });
  }
  assert.equal(remoteApplications, 1, "stale snapshots remain ignored after convergence");

  a.close();
  b.close();
});

test("session-sync rejects invalid revisions and malformed winning snapshots", () => {
  const channel = { onmessage: null, postMessage() {} };
  /** @type {import("./motif.mjs").MotifDocument | null} */
  let remote = null;
  const sync = createSessionSync({
    channel,
    origin: "tab-local",
    key: "validation-key",
    onRemote: (doc) => {
      remote = doc;
    },
  });
  const valid = addFromPalette(createSketchMotif("valid-after-invalid", "Valid"), "walk");

  channel.onmessage?.({
    data: {
      type: "motif-doc",
      key: "validation-key",
      rev: Number.MAX_SAFE_INTEGER + 1,
      docJson: emitMotif(valid),
      origin: "tab-remote",
    },
  });
  channel.onmessage?.({
    data: {
      type: "motif-doc",
      key: "validation-key",
      rev: 1,
      docJson: "not a motif document",
      origin: "tab-remote",
    },
  });
  assert.equal(sync.rev, 0);
  assert.equal(remote, null);

  channel.onmessage?.({
    data: {
      type: "motif-doc",
      key: "validation-key",
      rev: 1,
      docJson: emitMotif(valid),
      origin: "tab-remote",
    },
  });
  assert.equal(sync.rev, 1);
  assert.equal(remote?.id, "valid-after-invalid");
  assert.throws(() => sync.setRev(Number.POSITIVE_INFINITY), /safe integer/i);
  assert.throws(() => sync.setRev(-1), /safe integer/i);
  sync.setRev(Number.MAX_SAFE_INTEGER);
  assert.throws(() => sync.publish(valid), /revision exhausted/i);

  sync.close();
});

test("memory channel multi-subscriber", () => {
  const ch = createMemoryChannel();
  let n = 0;
  const unsub = subscribeMemoryChannel(ch, () => {
    n++;
  });
  ch.postMessage({ hello: 1 });
  assert.equal(n, 1);
  unsub();
  ch.postMessage({ hello: 2 });
  assert.equal(n, 1);
});

test("resolveSyncMode honours mode + env feature flags", () => {
  assert.equal(resolveSyncMode({ mode: "yjs" }), "yjs");
  assert.equal(resolveSyncMode({ mode: "memory" }), "memory");
  assert.equal(resolveSyncMode({ mode: "broadcast" }), "broadcast");
  assert.equal(resolveSyncMode({}, { env: { MVEI_WORKBENCH_COLLAB: "yjs" } }), "yjs");
  assert.equal(resolveSyncMode({}, { env: { COLLAB: "1" } }), "yjs");
  assert.equal(resolveSyncMode({}, { env: {} }), "broadcast");
  assert.deepEqual([...SYNC_MODES], ["broadcast", "yjs", "memory"]);
});

test("memory mode openSyncChannel + Motif item sync", () => {
  const ch = openSyncChannel("memory");
  assert.equal(ch.mode, "memory");
  /** @type {import("./motif.mjs").MotifDocument | null} */
  let remote = null;
  const a = createSessionSync({
    channel: ch,
    mode: "memory",
    origin: "m-a",
    key: "mem-key",
  });
  const b = createSessionSync({
    channel: ch,
    mode: "memory",
    origin: "m-b",
    key: "mem-key",
    onRemote: (d) => {
      remote = d;
    },
  });
  let doc = createSketchMotif("mem-1", "Memory");
  doc = addFromPalette(doc, "gesture_arm");
  a.publish(doc);
  assert.ok(remote);
  assert.equal(remote.items[0].symbol, "gesture_arm");
  a.close();
  b.close();
});

test("yjs mode syncs Motif items across peers on shared doc", () => {
  // Shared fallback Y.Doc (or real yjs if injected)
  const shared = createYjsChannel({ roomKey: "yjs-key" });
  const docRef = shared.doc;
  /** @type {import("./motif.mjs").MotifDocument | null} */
  let remote = null;

  const a = createSessionSync({
    mode: "yjs",
    doc: docRef,
    origin: "y-a",
    key: "yjs-key",
  });
  // Second channel on same doc: peer B
  const chB = createYjsChannel({ doc: docRef, roomKey: "yjs-key" });
  const b = createSessionSync({
    mode: "yjs",
    channel: chB,
    origin: "y-b",
    key: "yjs-key",
    onRemote: (d) => {
      remote = d;
    },
  });

  assert.equal(a.mode, "yjs");
  let doc = createSketchMotif("yjs-1", "Yjs Motif");
  doc = addFromPalette(doc, "walk");
  doc = addFromPalette(doc, "travel");
  a.publish(doc);
  assert.ok(remote, "peer B should receive yjs motif snapshot");
  assert.equal(remote.id, "yjs-1");
  assert.equal(remote.items.length, 2);
  assert.equal(remote.items.map((i) => i.symbol).join(","), "walk,travel");

  // Stale rev ignored
  remote = null;
  chB.postMessage({
    type: "motif-doc",
    key: "yjs-key",
    rev: 0,
    docJson: emitMotif(doc),
    origin: "y-a",
  });
  assert.equal(remote, null);

  a.close();
  b.close();
  shared.close();
});
