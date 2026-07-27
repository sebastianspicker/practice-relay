/**
 * OSC thin-adapter tests - multi-asset addresses, not a runtime.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  projectOscBundle,
  formatOscUdpPayload,
  toOssianHint,
  toMaxDict,
} from "../src/osc-bridge.ts";
import {
  projectOscBundle as reexported,
  toOssianHint as reOssian,
  toMaxDict as reMax,
} from "../src/index.ts";

const sample = {
  id: "ps-osc",
  title: "OSC multi-asset sample",
  preferredTakeId: "take-pref",
  tracks: [
    { id: "v1", type: "video", ref: "media/a.mp4", label: "Cam A" },
    { id: "a1", type: "audio", ref: "media/a.wav", label: "Room" },
    { id: "c1", type: "media_cues", ref: "cues.json", label: "Cues" },
  ],
  takes: [{ id: "take-pref", label: "Preferred", mediaPath: "media/a.mp4" }],
  spine: {
    durationMs: 8000,
    regions: [
      { id: "r1", startMs: 0, endMs: 2000, label: "intro" },
      { id: "r2", startMs: 3000, endMs: 6000, label: "phrase" },
    ],
  },
};

const oscFixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/osc",
);

describe("projectOscBundle", () => {
  it("emits region, track, and preferred_take addresses", () => {
    const msgs = projectOscBundle(sample);
    const addresses = msgs.map((m) => m.address);

    assert.ok(
      addresses.some((a) => a === "/practice-relay/ps-osc/region"),
      "region address",
    );
    assert.ok(
      addresses.some((a) => a === "/practice-relay/ps-osc/track"),
      "track address",
    );
    assert.ok(
      addresses.some((a) => a === "/practice-relay/ps-osc/preferred_take"),
      "preferred_take address",
    );

    const regions = msgs.filter((m) => m.address.endsWith("/region"));
    assert.equal(regions.length, 2);
    assert.equal(regions[0]!.args[0], "r1");

    const tracks = msgs.filter((m) => m.address.endsWith("/track"));
    assert.equal(tracks.length, 3);

    const pref = msgs.find((m) => m.address.endsWith("/preferred_take"));
    assert.ok(pref);
    assert.equal(pref!.args[0], "take-pref");
  });

  it("formatOscUdpPayload produces JSON lines + federation description", () => {
    const msgs = projectOscBundle(sample);
    const payload = formatOscUdpPayload(msgs);
    assert.match(payload.description, /not a runtime/i);
    assert.match(payload.description, /ossia|Max|QLab/i);
    assert.ok(payload.jsonLines.includes("/practice-relay/ps-osc/region"));
    assert.ok(payload.jsonLines.includes("/practice-relay/ps-osc/preferred_take"));
    const lines = payload.jsonLines.split("\n").filter(Boolean);
    assert.equal(lines.length, msgs.length);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      assert.ok(typeof parsed.address === "string");
      assert.ok(Array.isArray(parsed.args));
      assert.ok(typeof parsed.tMs === "number");
    }
  });

  it("re-export from package index matches module", () => {
    assert.equal(reexported(sample).length, projectOscBundle(sample).length);
  });
});

describe("toOssianHint / toMaxDict", () => {
  it("toOssianHint documents receive addresses + cues", () => {
    const hint = toOssianHint(sample);
    assert.equal(hint.kind, "practice-relay-ossia-hint");
    assert.equal(hint.workRecordId, "ps-osc");
    assert.ok(hint.receiveAddresses.length >= 3);
    assert.ok(
      hint.receiveAddresses.some((a) => a.address.endsWith("/region")),
    );
    assert.match(hint.note, /not a|do not replace/i);
    assert.ok(hint.cues.length >= 3);
    assert.equal(reOssian(sample).kind, hint.kind);
  });

  it("toMaxDict documents route tree + dict cues", () => {
    const patch = toMaxDict(sample);
    assert.equal(patch.kind, "practice-relay-max-dict");
    assert.ok(patch.patchObjects.some((p) => /udpreceive/i.test(p.box)));
    assert.ok(patch.routeTree.length >= 3);
    assert.equal(patch.dict.recordId, "ps-osc");
    assert.ok(patch.dict.cues.length >= 3);
    assert.match(patch.note, /not.*runtime|Max/i);
    assert.equal(reMax(sample).kind, patch.kind);
  });

  it("example fixtures under fixtures/osc/ are valid patch shapes", () => {
    const ossia = JSON.parse(
      readFileSync(join(oscFixtures, "ossia-receive-hint.json"), "utf8"),
    );
    const max = JSON.parse(
      readFileSync(join(oscFixtures, "max-dict-patch.json"), "utf8"),
    );
    assert.equal(ossia.kind, "practice-relay-ossia-hint");
    assert.ok(Array.isArray(ossia.receiveAddresses));
    assert.equal(max.kind, "practice-relay-max-dict");
    assert.ok(Array.isArray(max.routeTree));
    assert.ok(max.dict?.cues?.length >= 1);
  });
});
