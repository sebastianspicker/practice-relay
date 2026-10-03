/** Focused direct-route coverage for core record resource and member patching. */
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";
import { createAuthService } from "@practice-relay/auth";
import { createMemoryRecordStore } from "@practice-relay/record-store";
import {
  addMember,
  createEmptyRecord,
} from "@practice-relay/work-record";
import type { RequestContext, RouteResult } from "./request-context.ts";
import type { RecordRouteParams } from "./record-route-types.ts";
import { handleRecordCoreRoute } from "./routes-record-core.ts";
import { createApiRuntime, type ApiRuntime } from "./runtime.ts";
import { mockReq, mockRes, type MockRes } from "./test-support/http-mocks.ts";

type CoreHarness = {
  authorization: string;
  id: string;
  runtime: ApiRuntime;
  store: Awaited<ReturnType<typeof createMemoryRecordStore>>;
};

type DispatchResult = {
  request: IncomingMessage;
  response: MockRes;
  result: RouteResult;
};

async function coreHarness(actor = "teacher-1", password = "teach"): Promise<CoreHarness> {
  const auth = createAuthService("record-core-route-test-secret");
  const session = (await auth.login(actor, password));
  assert.ok(session);
  const id = "record-core";
  const store = createMemoryRecordStore();
  (await store.create(addMember(createEmptyRecord(id, "Core route"), {
    userId: "teacher-1",
    role: "faculty",
  })));
  return {
    authorization: `Bearer ${session.token}`,
    id,
    runtime: createApiRuntime({ auth, recordStore: store }),
    store,
  };
}

async function dispatch(
  harness: CoreHarness,
  method: string,
  action: string | undefined,
  options: { body?: unknown; authenticated?: boolean } = {},
): Promise<DispatchResult> {
  const response = mockRes();
  const request = mockReq("/direct-record-core", method, options.body, options.authenticated !== false
    ? { authorization: harness.authorization }
    : undefined);
  const ctx: RequestContext = {
    runtime: harness.runtime,
    req: request,
    res: response as unknown as ServerResponse,
    method,
    pathname: "/direct-record-core",
    requestId: "record-core-test",
  };
  return {
    request,
    response,
    result: await handleRecordCoreRoute(ctx, {
      recordId: harness.id,
      action,
    } satisfies RecordRouteParams),
  };
}

function detail(response: MockRes): string {
  return (JSON.parse(response.body) as { detail: string }).detail;
}

async function revision(harness: CoreHarness): Promise<number> {
  return (await harness.store.get(harness.id))?.revision ?? -1;
}

async function assertUnchanged(harness: CoreHarness): Promise<void> {
  assert.equal((await revision(harness)), 0);
  assert.deepEqual((await harness.store.get(harness.id))?.members, [
    { userId: "teacher-1", role: "faculty" },
  ]);
}

async function assertEmptyBodyPatch(
  harness: CoreHarness,
  response: DispatchResult,
): Promise<void> {
  const body = JSON.parse(response.response.body);
  assert.equal(response.result, "handled");
  assert.equal(response.response.statusCode, 200);
  assert.equal(body.id, harness.id);
  assert.equal(body.title, "Core route");
  assert.deepEqual(body.members, [{ userId: "teacher-1", role: "faculty" }]);
  assert.equal(body.revision, 1);
  assert.equal((await revision(harness)), 1);
  assert.equal((await harness.store.get(harness.id))?.title, "Core route");
  assert.deepEqual((await harness.store.get(harness.id))?.members, [
    { userId: "teacher-1", role: "faculty" },
  ]);
}

function restorePrototypeDescriptor(
  key: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
  else Reflect.deleteProperty(Object.prototype, key);
}

test("member patches reject hostile configured-user values without persistence", async () => {
  const hostileMembers: readonly unknown[] = [
    null,
    42,
    [],
    { role: "faculty" },
    { userId: "not-configured", role: "faculty" },
  ];

  for (const member of hostileMembers) {
    const harness = (await coreHarness());
    const response = await dispatch(harness, "PATCH", undefined, {
      body: { members: [member] },
    });

    assert.equal(response.result, "handled");
    assert.equal(response.response.statusCode, 400);
    assert.equal(detail(response.response), "every member must identify a configured user");
    assert.equal((await revision(harness)), 0);
  }
});

test("record patches reject prototype data and accessors without reading them", async () => {
  const priorUserId = Object.getOwnPropertyDescriptor(Object.prototype, "userId");
  const priorRole = Object.getOwnPropertyDescriptor(Object.prototype, "role");
  const priorTitle = Object.getOwnPropertyDescriptor(Object.prototype, "title");
  const priorMembers = Object.getOwnPropertyDescriptor(Object.prototype, "members");
  let userIdGetterReads = 0;
  let roleGetterReads = 0;
  let titleGetterReads = 0;
  let membersGetterReads = 0;
  try {
    const ordinaryEmptyBody = (await coreHarness());
    const ordinaryEmptyResponse = await dispatch(ordinaryEmptyBody, "PATCH", undefined, {
      body: {},
    });
    (await assertEmptyBodyPatch(ordinaryEmptyBody, ordinaryEmptyResponse));

    const missingPostRole = (await coreHarness());
    const missingPostRoleResponse = await dispatch(missingPostRole, "POST", "members", {
      body: { userId: "teacher-1" },
    });
    assert.equal(missingPostRoleResponse.response.statusCode, 400);
    assert.equal(detail(missingPostRoleResponse.response), "role must be a supported record role");
    (await assertUnchanged(missingPostRole));

    Object.defineProperty(Object.prototype, "userId", {
      configurable: true,
      enumerable: false,
      value: "teacher-1",
    });
    Object.defineProperty(Object.prototype, "role", {
      configurable: true,
      enumerable: false,
      value: "faculty",
    });
    Object.defineProperty(Object.prototype, "title", {
      configurable: true,
      enumerable: false,
      value: "Inherited title",
    });
    Object.defineProperty(Object.prototype, "members", {
      configurable: true,
      enumerable: false,
      value: [
        { userId: "teacher-1", role: "faculty" },
        { userId: "student-1", role: "student" },
      ],
    });
    const inheritedTopLevel = (await coreHarness());
    const inheritedTopLevelResponse = await dispatch(inheritedTopLevel, "PATCH", undefined, {
      body: {},
    });
    (await assertEmptyBodyPatch(inheritedTopLevel, inheritedTopLevelResponse));

    const inheritedUserId = (await coreHarness());
    const inheritedUserIdResponse = await dispatch(inheritedUserId, "PATCH", undefined, {
      body: { members: [{}] },
    });
    assert.equal(inheritedUserIdResponse.response.statusCode, 400);
    assert.equal(detail(inheritedUserIdResponse.response), "every member must identify a configured user");
    (await assertUnchanged(inheritedUserId));

    const inheritedRole = (await coreHarness());
    const inheritedRoleResponse = await dispatch(inheritedRole, "PATCH", undefined, {
      body: { members: [{ userId: "teacher-1" }] },
    });
    assert.equal(inheritedRoleResponse.response.statusCode, 400);
    assert.equal(detail(inheritedRoleResponse.response), "role must be a supported record role");
    (await assertUnchanged(inheritedRole));

    const inheritedPostUserId = (await coreHarness());
    const inheritedPostUserIdResponse = await dispatch(inheritedPostUserId, "POST", "members", {
      body: {},
    });
    assert.equal(inheritedPostUserIdResponse.response.statusCode, 400);
    assert.equal(detail(inheritedPostUserIdResponse.response), "member must identify a configured user");
    (await assertUnchanged(inheritedPostUserId));

    const inheritedPostRole = (await coreHarness());
    const inheritedPostRoleResponse = await dispatch(inheritedPostRole, "POST", "members", {
      body: { userId: "teacher-1" },
    });
    assert.equal(inheritedPostRoleResponse.response.statusCode, 400);
    assert.equal(detail(inheritedPostRoleResponse.response), "role must be a supported record role");
    (await assertUnchanged(inheritedPostRole));

    const validPost = (await coreHarness());
    const validPostResponse = await dispatch(validPost, "POST", "members", {
      body: { userId: "student-1", role: "student" },
    });
    assert.equal(validPostResponse.result, "handled");
    assert.equal(validPostResponse.response.statusCode, 200);
    assert.equal((await revision(validPost)), 1);
    assert.deepEqual((await validPost.store.get(validPost.id))?.members, [
      { userId: "teacher-1", role: "faculty" },
      { userId: "student-1", role: "student" },
    ]);

    const nonAdminPost = (await coreHarness());
    const nonAdminPostResponse = await dispatch(nonAdminPost, "POST", "members", {
      body: { userId: "ops-1", role: "admin" },
    });
    assert.equal(nonAdminPostResponse.response.statusCode, 403);
    assert.equal(detail(nonAdminPostResponse.response), "only an operations admin may assign admin");
    (await assertUnchanged(nonAdminPost));

    Object.defineProperty(Object.prototype, "userId", {
      configurable: true,
      enumerable: false,
      get() {
        userIdGetterReads += 1;
        throw new Error("prototype userId getter read");
      },
    });
    Object.defineProperty(Object.prototype, "role", {
      configurable: true,
      enumerable: false,
      get() {
        roleGetterReads += 1;
        throw new Error("prototype role getter read");
      },
    });
    Object.defineProperty(Object.prototype, "title", {
      configurable: true,
      enumerable: false,
      get() {
        titleGetterReads += 1;
        throw new Error("prototype title getter read");
      },
    });
    Object.defineProperty(Object.prototype, "members", {
      configurable: true,
      enumerable: false,
      get() {
        membersGetterReads += 1;
        throw new Error("prototype members getter read");
      },
    });
    const accessorTopLevel = (await coreHarness());
    const accessorTopLevelResponse = await dispatch(accessorTopLevel, "PATCH", undefined, {
      body: {},
    });
    (await assertEmptyBodyPatch(accessorTopLevel, accessorTopLevelResponse));

    const accessorUserId = (await coreHarness());
    const accessorUserIdResponse = await dispatch(accessorUserId, "PATCH", undefined, {
      body: { members: [{}] },
    });
    assert.equal(accessorUserIdResponse.response.statusCode, 400);
    assert.equal(detail(accessorUserIdResponse.response), "every member must identify a configured user");
    (await assertUnchanged(accessorUserId));

    const accessorRole = (await coreHarness());
    const accessorRoleResponse = await dispatch(accessorRole, "PATCH", undefined, {
      body: { members: [{ userId: "teacher-1" }] },
    });
    assert.equal(accessorRoleResponse.response.statusCode, 400);
    assert.equal(detail(accessorRoleResponse.response), "role must be a supported record role");
    (await assertUnchanged(accessorRole));

    const accessorPostUserId = (await coreHarness());
    const accessorPostUserIdResponse = await dispatch(accessorPostUserId, "POST", "members", {
      body: {},
    });
    assert.equal(accessorPostUserIdResponse.response.statusCode, 400);
    assert.equal(detail(accessorPostUserIdResponse.response), "member must identify a configured user");
    (await assertUnchanged(accessorPostUserId));

    const accessorPostRole = (await coreHarness());
    const accessorPostRoleResponse = await dispatch(accessorPostRole, "POST", "members", {
      body: { userId: "teacher-1" },
    });
    assert.equal(accessorPostRoleResponse.response.statusCode, 400);
    assert.equal(detail(accessorPostRoleResponse.response), "role must be a supported record role");
    (await assertUnchanged(accessorPostRole));
    assert.equal(userIdGetterReads, 0);
    assert.equal(roleGetterReads, 0);
    assert.equal(titleGetterReads, 0);
    assert.equal(membersGetterReads, 0);
  } finally {
    restorePrototypeDescriptor("userId", priorUserId);
    restorePrototypeDescriptor("role", priorRole);
    restorePrototypeDescriptor("title", priorTitle);
    restorePrototypeDescriptor("members", priorMembers);
  }
});

test("member patches retain authorization and domain-validation order", async () => {
  const unauthorized = (await coreHarness());
  const unauthorizedResponse = await dispatch(
    unauthorized,
    "PATCH",
    undefined,
    {
      body: { title: 1, members: [{ userId: "not-configured", role: "admin" }] },
      authenticated: false,
    },
  );
  assert.equal(unauthorizedResponse.response.statusCode, 401);
  assert.equal(detail(unauthorizedResponse.response), "valid bearer session required");
  assert.equal(unauthorizedResponse.request.readableEnded, false);
  assert.equal((await revision(unauthorized)), 0);

  const nonAdmin = (await coreHarness());
  const adminResponse = await dispatch(nonAdmin, "PATCH", undefined, {
    body: { members: [{ userId: "ops-1", role: "admin" }] },
  });
  assert.equal(adminResponse.response.statusCode, 403);
  assert.equal(detail(adminResponse.response), "only an operations admin may assign admin");
  assert.equal((await revision(nonAdmin)), 0);

  const missingFaculty = (await coreHarness());
  const missingFacultyResponse = await dispatch(missingFaculty, "PATCH", undefined, {
    body: { members: [{ userId: "student-1", role: "student" }] },
  });
  assert.equal(missingFacultyResponse.response.statusCode, 400);
  assert.equal(detail(missingFacultyResponse.response), "members must retain a faculty or admin member");
  assert.equal((await revision(missingFaculty)), 0);
});

test("member patches defer supported-role checks until after admin assignment", async () => {
  for (const role of [null, {}, "director"] as const) {
    const invalidRole = (await coreHarness());
    const invalidRoleResponse = await dispatch(invalidRole, "PATCH", undefined, {
      body: { members: [{ userId: "teacher-1", role }] },
    });
    assert.equal(invalidRoleResponse.response.statusCode, 400);
    assert.equal(detail(invalidRoleResponse.response), "role must be a supported record role");
    assert.equal((await revision(invalidRole)), 0);
  }

  const nonAdmin = (await coreHarness());
  const orderedResponse = await dispatch(nonAdmin, "PATCH", undefined, {
    body: {
      members: [
        { userId: "ops-1", role: "admin" },
        { userId: "teacher-1", role: "director" },
      ],
    },
  });
  assert.equal(orderedResponse.response.statusCode, 403);
  assert.equal(detail(orderedResponse.response), "only an operations admin may assign admin");
  assert.equal((await revision(nonAdmin)), 0);
});

test("undefined and empty actions select the direct GET and PATCH routes", async () => {
  const getUndefined = (await coreHarness());
  const getEmpty = (await coreHarness());
  const undefinedGet = await dispatch(getUndefined, "GET", undefined);
  const emptyGet = await dispatch(getEmpty, "GET", "");
  assert.equal(undefinedGet.result, "handled");
  assert.equal(emptyGet.result, "handled");
  assert.equal(undefinedGet.response.statusCode, 200);
  assert.equal(emptyGet.response.statusCode, 200);
  const undefinedGetBody = JSON.parse(undefinedGet.response.body);
  const emptyGetBody = JSON.parse(emptyGet.response.body);
  assert.equal(undefinedGetBody.id, getUndefined.id);
  assert.equal(emptyGetBody.id, getEmpty.id);
  assert.equal(undefinedGetBody.title, "Core route");
  assert.equal(emptyGetBody.title, "Core route");
  assert.deepEqual(undefinedGetBody.members, [{ userId: "teacher-1", role: "faculty" }]);
  assert.deepEqual(emptyGetBody.members, [{ userId: "teacher-1", role: "faculty" }]);
  assert.equal(undefinedGetBody.revision, 0);
  assert.equal(emptyGetBody.revision, 0);

  const patchUndefined = (await coreHarness());
  const patchEmpty = (await coreHarness());
  const undefinedPatch = await dispatch(patchUndefined, "PATCH", undefined, {
    body: { title: "  Updated core route  " },
  });
  const emptyPatch = await dispatch(patchEmpty, "PATCH", "", {
    body: { title: "  Updated core route  " },
  });
  assert.equal(undefinedPatch.result, "handled");
  assert.equal(emptyPatch.result, "handled");
  assert.equal(undefinedPatch.response.statusCode, 200);
  assert.equal(emptyPatch.response.statusCode, 200);
  const undefinedPatchBody = JSON.parse(undefinedPatch.response.body);
  const emptyPatchBody = JSON.parse(emptyPatch.response.body);
  assert.equal(undefinedPatchBody.id, patchUndefined.id);
  assert.equal(emptyPatchBody.id, patchEmpty.id);
  assert.equal(undefinedPatchBody.title, "Updated core route");
  assert.equal(emptyPatchBody.title, "Updated core route");
  assert.equal(undefinedPatchBody.revision, 1);
  assert.equal(emptyPatchBody.revision, 1);
  assert.equal((await patchUndefined.store.get(patchUndefined.id))?.title, "Updated core route");
  assert.equal((await patchEmpty.store.get(patchEmpty.id))?.title, "Updated core route");
  assert.equal((await revision(patchUndefined)), 1);
  assert.equal((await revision(patchEmpty)), 1);
});

test("unknown actions stay unmatched and a valid patch persists one revision", async () => {
  const unmatched = (await coreHarness());
  const unmatchedResponse = await dispatch(unmatched, "PATCH", "unknown", {
    body: { title: "ignored" },
  });
  assert.equal(unmatchedResponse.result, "unmatched");
  assert.equal(unmatchedResponse.response.statusCode, 0);
  assert.equal(unmatchedResponse.request.readableEnded, false);
  assert.equal((await revision(unmatched)), 0);

  const successful = (await coreHarness());
  const successfulResponse = await dispatch(successful, "PATCH", undefined, {
    body: {
      title: "  Persisted core route  ",
      members: [
        { userId: "teacher-1", role: "faculty" },
        { userId: "student-1", role: "student" },
      ],
    },
  });
  assert.equal(successfulResponse.result, "handled");
  assert.equal(successfulResponse.response.statusCode, 200);
  assert.equal((await revision(successful)), 1);
  assert.equal((await successful.store.get(successful.id))?.title, "Persisted core route");
  assert.deepEqual((await successful.store.get(successful.id))?.members, [
    { userId: "teacher-1", role: "faculty" },
    { userId: "student-1", role: "student" },
  ]);
});
