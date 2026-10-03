/** Characterization tests for the public track validation boundary. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertTrack } from "../src/index.ts";

test("assertTrack accepts ordinary and null-prototype track records", () => {
  assert.doesNotThrow(() => assertTrack({ id: "track-1", type: "video" }));

  const nullPrototypeTrack = Object.assign(Object.create(null), {
    id: "track-2",
    type: "audio",
    label: "Room mic",
    ref: "media/room.wav",
  });
  assert.doesNotThrow(() => assertTrack(nullPrototypeTrack));
});

test("assertTrack rejects values that are not plain track records", () => {
  class TrackPayload {}

  for (const value of [null, undefined, 1, "track", true, [], new TrackPayload()]) {
    assert.throws(
      () => assertTrack(value),
      { message: "track must be a plain object" },
    );
  }
});

test("assertTrack rejects inherited required fields", () => {
  const inheritedFields: ReadonlyArray<readonly ["id" | "type", object, string]> = [
    ["id", { type: "video" }, "track id must be a valid resource id"],
    ["type", { id: "track-2" }, "track type must be supported"],
  ];

  for (const [field, track, message] of inheritedFields) {
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, field);
    try {
      Object.defineProperty(Object.prototype, field, {
        configurable: true,
        value: field === "id" ? "track-1" : "video",
      });
      assert.throws(() => assertTrack(track), { message });
    } finally {
      if (previous) Object.defineProperty(Object.prototype, field, previous);
      else Reflect.deleteProperty(Object.prototype, field);
    }
  }
});

test("assertTrack rejects every own accessor without invoking it", () => {
  const accessorFields: ReadonlyArray<readonly [string, string]> = [
    ["id", "track id must be a valid resource id"],
    ["type", "track type must be supported"],
    ["label", "track label must be a string of at most 500 characters"],
    ["ref", "track ref must be a string of at most 4096 characters"],
  ];

  for (const [field, message] of accessorFields) {
    let getterReads = 0;
    const accessorTrack = {
      id: "track-1",
      type: "video",
      label: "Camera A",
      ref: "media/camera-a.mp4",
    };
    Object.defineProperty(accessorTrack, field, {
      configurable: true,
      get() {
        getterReads += 1;
        throw new Error("accessor must not run");
      },
    });

    assert.throws(() => assertTrack(accessorTrack), { message });
    assert.equal(getterReads, 0);
  }
});

test("assertTrack preserves kind, ref, and label validation messages", () => {
  assert.throws(
    () => assertTrack({ id: "track-1", type: "unsupported" }),
    { message: "track type must be supported" },
  );
  assert.throws(
    () => assertTrack({ id: "track-1", type: "video", ref: 1 }),
    { message: "track ref must be a string of at most 4096 characters" },
  );
  assert.throws(
    () => assertTrack({ id: "track-1", type: "video", label: 1 }),
    { message: "track label must be a string of at most 500 characters" },
  );
});
