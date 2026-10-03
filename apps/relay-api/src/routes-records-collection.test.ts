/** Focused request-boundary coverage for WorkRecord collection creation. */
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { test } from "node:test";
import { createAuthService } from "@practice-relay/auth";
import { createMemoryRecordStore } from "@practice-relay/record-store";
import { handleRequestWithRuntime } from "./router.ts";
import { createApiRuntime, type ApiRuntime } from "./runtime.ts";
import { mockReq, mockRes } from "./test-support/http-mocks.ts";

const INVALID_VALUES: readonly unknown[] = [null, false, 42, [], {}];
const TITLE_ERROR = "record title must be a non-empty string of at most 500 characters";

type CollectionHarness = {
  runtime: ApiRuntime;
  store: Awaited<ReturnType<typeof createMemoryRecordStore>>;
  authorization: string;
};

async function collectionHarness(userId = "teacher-1", password = "teach"): Promise<CollectionHarness> {
  const store = createMemoryRecordStore();
  const auth = createAuthService("records-collection-test-secret");
  const session = (await auth.login(userId, password));
  assert.ok(session);
  return {
    runtime: createApiRuntime({ auth, recordStore: store }),
    store,
    authorization: `Bearer ${session.token}`,
  };
}

async function createRecord(
  runtime: ApiRuntime,
  body: unknown,
  authorization?: string,
) {
  const response = mockRes();
  const headers = authorization === undefined ? undefined : { authorization };
  await handleRequestWithRuntime(
    runtime,
    mockReq("/work-records", "POST", body, headers),
    response as unknown as ServerResponse,
  );
  return response;
}

function problemDetail(response: Awaited<ReturnType<typeof mockRes>>): string {
  return (JSON.parse(response.body) as { detail: string }).detail;
}

test("record collection creation validates unknown scalars and preserves creation order", async () => {
  const defaults = (await collectionHarness());
  const omitted = await createRecord(defaults.runtime, {}, defaults.authorization);
  assert.equal(omitted.statusCode, 201);
  const omittedRecord = JSON.parse(omitted.body) as { id: string; title: string };
  assert.match(omittedRecord.id, /^wr-/);
  assert.equal(omittedRecord.title, "Untitled");
  assert.equal((await defaults.store.get(omittedRecord.id))?.title, "Untitled");

  const blank = (await collectionHarness());
  const blankResponse = await createRecord(
    blank.runtime,
    { id: "   ", title: "\t \n" },
    blank.authorization,
  );
  assert.equal(blankResponse.statusCode, 201);
  const blankRecord = JSON.parse(blankResponse.body) as { id: string; title: string };
  assert.match(blankRecord.id, /^wr-/);
  assert.equal(blankRecord.title, "Untitled");

  const trimmed = (await collectionHarness());
  const trimmedResponse = await createRecord(
    trimmed.runtime,
    { id: "  trimmed-record  ", title: "  Trimmed title  " },
    trimmed.authorization,
  );
  assert.equal(trimmedResponse.statusCode, 201);
  const trimmedRecord = JSON.parse(trimmedResponse.body) as {
    id: string;
    title: string;
    members: unknown[];
  };
  assert.equal(trimmedRecord.id, "trimmed-record");
  assert.equal(trimmedRecord.title, "Trimmed title");
  assert.deepEqual(trimmedRecord.members, [{ userId: "teacher-1", role: "faculty" }]);
  assert.deepEqual((await trimmed.store.get("trimmed-record")), trimmedRecord);

  for (const field of ["id", "title"] as const) {
    for (const value of INVALID_VALUES) {
      const invalid = (await collectionHarness());
      const response = await createRecord(
        invalid.runtime,
        { id: "valid-record", title: "Valid title", [field]: value },
        invalid.authorization,
      );
      assert.equal(response.statusCode, 400);
      assert.equal(
        problemDetail(response),
        field === "id" ? "invalid record id" : TITLE_ERROR,
      );
      assert.equal((await invalid.store.list()).length, 0);
    }
  }

  const unauthenticated = (await collectionHarness());
  const unauthenticatedResponse = await createRecord(
    unauthenticated.runtime,
    { id: null, title: null },
  );
  assert.equal(unauthenticatedResponse.statusCode, 401);
  assert.equal(problemDetail(unauthenticatedResponse), "valid bearer session required");
  assert.equal((await unauthenticated.store.list()).length, 0);

  const membersFirst = (await collectionHarness());
  const membersResponse = await createRecord(
    membersFirst.runtime,
    { id: null, title: null, members: [] },
    membersFirst.authorization,
  );
  assert.equal(membersResponse.statusCode, 400);
  assert.equal(problemDetail(membersResponse), "members cannot be set during record creation");
  assert.equal((await membersFirst.store.list()).length, 0);

  const invalidId = (await collectionHarness());
  const invalidIdResponse = await createRecord(
    invalidId.runtime,
    { id: "../invalid", title: "Valid title" },
    invalidId.authorization,
  );
  assert.equal(invalidIdResponse.statusCode, 400);
  assert.equal(problemDetail(invalidIdResponse), "invalid record id");

  const duplicate = (await collectionHarness());
  assert.equal(
    (await createRecord(
      duplicate.runtime,
      { id: "duplicate-record", title: "First" },
      duplicate.authorization,
    )).statusCode,
    201,
  );
  const duplicateResponse = await createRecord(
    duplicate.runtime,
    { id: "duplicate-record", title: "Second" },
    duplicate.authorization,
  );
  assert.equal(duplicateResponse.statusCode, 409);
  assert.equal(problemDetail(duplicateResponse), "record duplicate-record already exists");

  const disallowed = (await collectionHarness("examiner-1", "jury"));
  const disallowedResponse = await createRecord(
    disallowed.runtime,
    { id: "examiner-record", title: "Examiner title" },
    disallowed.authorization,
  );
  assert.equal(disallowedResponse.statusCode, 403);
  assert.equal(problemDetail(disallowedResponse), "this account role cannot create records");

  const oversized = (await collectionHarness());
  const oversizedResponse = await createRecord(
    oversized.runtime,
    { id: "oversized-record", title: "x".repeat(501) },
    oversized.authorization,
  );
  assert.equal(oversizedResponse.statusCode, 400);
  assert.equal(problemDetail(oversizedResponse), TITLE_ERROR);
  assert.equal((await oversized.store.list()).length, 0);
});
