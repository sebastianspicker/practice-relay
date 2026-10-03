/** HTTP authorization coverage for a student-owned record handoff. */
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { test } from "node:test";
import { handleRequestWithRuntime } from "./router.ts";
import { createApiRuntime } from "./runtime.ts";
import { mockReq, mockRes } from "./test-support/http-mocks.ts";

test("a student creator can invite faculty and submit without escalating roles", async () => {
  const runtime = createApiRuntime();
  const studentSession = (await runtime.auth.login("student-1", "learn"));
  const facultySession = (await runtime.auth.login("teacher-1", "teach"));
  assert.ok(studentSession);
  assert.ok(facultySession);

  const request = async (
    pathname: string,
    method: string,
    token: string,
    body?: unknown,
  ) => {
    const response = mockRes();
    await handleRequestWithRuntime(
      runtime,
      mockReq(pathname, method, body, { authorization: `Bearer ${token}` }),
      response as unknown as ServerResponse,
    );
    return response;
  };

  const created = await request(
    "/work-records",
    "POST",
    studentSession.token,
    { id: "student-handoff", title: "Student handoff" },
  );
  assert.equal(created.statusCode, 201);

  const escalation = await request(
    "/work-records/student-handoff/members",
    "POST",
    studentSession.token,
    { userId: "student-1", role: "faculty" },
  );
  assert.equal(escalation.statusCode, 403);

  const invitation = await request(
    "/work-records/student-handoff/members",
    "POST",
    studentSession.token,
    { userId: "teacher-1", role: "faculty" },
  );
  assert.equal(invitation.statusCode, 200);

  const facultyRead = await request(
    "/work-records/student-handoff",
    "GET",
    facultySession.token,
  );
  assert.equal(facultyRead.statusCode, 200);

  const submitted = await request(
    "/work-records/student-handoff/submit",
    "POST",
    studentSession.token,
    { name: "student-submission" },
  );
  assert.equal(submitted.statusCode, 200);
  const submittedRecord = JSON.parse(submitted.body) as {
    versions: { name: string }[];
  };
  assert.equal(submittedRecord.versions[0]?.name, "student-submission");
});
