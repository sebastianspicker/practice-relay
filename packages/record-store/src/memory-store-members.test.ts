/** Public memory-store membership compatibility contracts. */
import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyRecord } from "@practice-relay/work-record";
import { createMemoryRecordStore } from "./index.ts";

test("memory store lists matching members in insertion order", async () => {
  const store = createMemoryRecordStore();

  (await store.create(createEmptyRecord("empty-members", "Empty members")));
  (await store.create({
    ...createEmptyRecord("first-match", "First match"),
    members: [{ userId: "member-1", role: "faculty" }],
  }));
  (await store.create({
    ...createEmptyRecord("nonmatch", "Nonmatching member"),
    members: [{ userId: "member-2", role: "student" }],
  }));
  (await store.create({
    ...createEmptyRecord("second-match", "Second match"),
    members: [{ userId: "member-1", role: "faculty" }],
  }));

  assert.deepEqual(
    (await store.listByMember("member-1")).map((record) => record.id),
    ["first-match", "second-match"],
  );
  assert.deepEqual((await store.listByMember("absent-member")), []);
});

test("memory store rejects malformed member values before retaining them", async () => {
  const store = createMemoryRecordStore();
  const malformedMembers = createEmptyRecord("malformed-members", "Malformed members");
  Reflect.set(malformedMembers, "members", {});
  await assert.rejects(async () => (await store.create(malformedMembers)), /invalid WorkRecord.*members/i);
  assert.equal((await store.get("malformed-members")), undefined);
  assert.deepEqual((await store.listAllEvents()), []);
});

test("memory store deeply detaches create, get, list, and update values", async () => {
  const store = createMemoryRecordStore();
  const input = {
    ...createEmptyRecord("detached", "Original"),
    members: [{ userId: "member-1", role: "faculty" as const }],
  };
  const created = (await store.create(input));
  input.title = "Mutated input";
  input.members[0]!.userId = "mutated-input";
  created.title = "Mutated create result";
  created.members[0]!.userId = "mutated-create";
  assert.equal((await store.get("detached"))?.title, "Original");
  assert.equal((await store.get("detached"))?.members[0]?.userId, "member-1");

  const listed = (await store.list());
  listed[0]!.members[0]!.userId = "mutated-list";
  assert.equal((await store.get("detached"))?.members[0]?.userId, "member-1");

  const updateInput = (await store.get("detached"))!;
  updateInput.title = "Updated";
  const updated = (await store.update("detached", updateInput));
  updateInput.title = "Mutated update input";
  updated.members[0]!.userId = "mutated-update";
  assert.equal((await store.get("detached"))?.title, "Updated");
  assert.equal((await store.get("detached"))?.members[0]?.userId, "member-1");
});
