/** Focused protocol and recovery checks for real Relay studio operations. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  addPolicy,
  attachMovement,
  exportEvidence,
} from "../src/data/studio-operations.mjs";
import { toWorkspaceRecord } from "../src/data/workspace-record.mjs";
import { createWorkspaceState } from "../src/data/workspace-state.mjs";

function baseRecord() {
  return {
    id: "record-1",
    title: "Studio record",
    revision: 1,
    artifacts: [],
    takes: [],
    tracks: [],
    representedSubjects: [{ id: "performer-1", label: "Performer", type: "Person" }],
    usePolicies: [],
  };
}

function fakeController({ failArtifactOnce = false } = {}) {
  let canonical = baseRecord();
  let shouldFailArtifact = failArtifactOnce;
  const calls = [];
  const controller = {
    apiBase: "https://relay.test/api/ignored",
    state: { selected: toWorkspaceRecord(canonical) },
    async refresh() {
      this.accept(canonical);
      return canonical;
    },
    accept(record) {
      canonical = record;
      this.state.selected = toWorkspaceRecord(record);
      return this.state.selected;
    },
    async request(path, options = {}) {
      calls.push({ path, options });
      if (path.endsWith("/exports")) {
        return { decision: { allowed: true }, roCrate: { "@graph": [] } };
      }
      if (path.endsWith("/policies")) {
        return { ...canonical, revision: canonical.revision + 1, usePolicies: [...canonical.usePolicies, options.body] };
      }
      if (path.includes("/takes/") && path.endsWith("/media")) {
        const match = path.match(/\/takes\/([^/]+)\/media$/u);
        const takeId = decodeURIComponent(match[1]);
        const bytes = new TextEncoder().encode(options.rawBody);
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
        const media = {
          takeId,
          storageKey: `record-1/${takeId}-stored.bin`,
          sha256,
          contentType: "application/octet-stream",
          byteSize: bytes.length,
        };
        canonical = { ...canonical, revision: canonical.revision + 1, takes: [...canonical.takes, { id: takeId, ...media }] };
        return { record: canonical, media };
      }
      if (path.endsWith("/artifacts")) {
        if (shouldFailArtifact) {
          shouldFailArtifact = false;
          throw Object.assign(new Error("artifact temporarily unavailable"), { status: 503 });
        }
        canonical = { ...canonical, revision: canonical.revision + 1, artifacts: [...canonical.artifacts, options.body] };
        return canonical;
      }
      if (path.endsWith("/mvei")) {
        canonical = {
          ...canonical,
          revision: canonical.revision + 1,
          tracks: [...canonical.tracks, { ...options.body, type: "movement_notation" }],
        };
        return canonical;
      }
      throw new Error(`Unexpected request: ${path}`);
    },
  };
  return { controller, calls, record: () => canonical };
}

test("policy and export operations use selected canonical identity and fresh revision", async () => {
  const { controller, calls } = fakeController();
  const exported = await exportEvidence(controller, { purpose: "assessment", destination: "lms" });
  assert.equal(exported.decision.allowed, true);
  assert.deepEqual(calls[0].options.body, { purpose: "assessment", destination: "lms" });

  const policy = {
    id: "policy-1",
    representedSubjectId: "performer-1",
    purpose: "assessment",
    destination: "lms",
    state: "granted",
  };
  const added = await addPolicy(controller, policy);
  assert.equal(calls.at(-1).options.headers["If-Match"], "1");
  assert.equal(added.workspace.raw.usePolicies[0].id, "policy-1");
});

test("movement attachment uploads exact JSON, registers owned evidence, and adds MvEI", async () => {
  const { controller, calls } = fakeController();
  const text = "{\n  \"type\": \"Motif\", \"items\": []\n}";
  const result = await attachMovement(controller, {
    document: text,
    subjectIds: ["performer-1"],
    filename: "phrase-a.json",
  });

  assert.equal(result.stage, "complete");
  assert.match(result.contentUrl, /^https:\/\/relay\.test\/media\/record-1\//u);
  assert.equal(calls[0].options.rawBody, text);
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.equal(calls[0].options.headers["If-Match"], "1");
  assert.deepEqual(calls[1].options.body.representedSubjectIds, ["performer-1"]);
  assert.equal(calls[1].options.body.contentUrl, result.contentUrl);
  assert.equal(calls[1].options.body.sha256, result.sha256);
  assert.equal(calls[1].options.body.preservationRequired, true);
  assert.equal(calls[1].options.headers["If-Match"], "2");
  assert.deepEqual(calls[2].options.body, {
    id: result.trackId,
    ref: result.contentUrl,
    label: "phrase-a.json",
  });
  assert.equal(calls[2].options.headers["If-Match"], "3");
  assert.equal(result.workspace.motion.type, "movement_notation");
  assert.equal(result.workspace.takes.length, 1);

  const beforeRetry = calls.length;
  const retry = await attachMovement(controller, {
    document: text,
    subjectIds: ["performer-1"],
    filename: "phrase-a.json",
  });
  assert.equal(retry.sha256, result.sha256);
  assert.equal(calls.length, beforeRetry, "completed hash-derived stages are not repeated");
});

test("movement attachment reports a recoverable stage and resumes without re-upload", async () => {
  const { controller, calls } = fakeController({ failArtifactOnce: true });
  const input = {
    document: { type: "Motif", items: [{ id: "step-1" }] },
    subjectIds: ["performer-1"],
    filename: "recover.json",
  };
  await assert.rejects(attachMovement(controller, input), (error) => {
    assert.equal(error.pending.stage, "artifact");
    assert.match(error.pending.sha256, /^[a-f0-9]{64}$/u);
    return true;
  });
  await attachMovement(controller, input);
  assert.equal(calls.filter((call) => call.path.endsWith("/media")).length, 1);
  assert.equal(calls.filter((call) => call.path.endsWith("/artifacts")).length, 2);
  assert.equal(calls.filter((call) => call.path.endsWith("/mvei")).length, 1);
});

test("movement attachment requires explicit known represented subjects before mutation", async () => {
  for (const subjectIds of [[], ["missing"], ["performer-1", "performer-1"]]) {
    const { controller, calls } = fakeController();
    await assert.rejects(attachMovement(controller, {
      document: { type: "Motif", items: [] },
      subjectIds,
      filename: "invalid.json",
    }), /subject/i);
    assert.equal(calls.length, 0);
  }
});

test("movement stages remain on their original record after a selection switch", async () => {
  const first = baseRecord();
  const second = { ...baseRecord(), id: "record-2", title: "Second record" };
  const mutationPaths = [];
  let current = first;
  let controller;
  const request = async (_base, path, options = {}) => {
    if (path === "/auth/login") {
      return { token: "test", userId: "member", expiresAt: new Date(Date.now() + 60_000).toISOString() };
    }
    if (path === "/work-records/record-1") return current;
    if (path === "/work-records/record-2") return second;
    mutationPaths.push(path);
    if (path.endsWith("/media")) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(options.rawBody));
      const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const takeId = decodeURIComponent(path.match(/\/takes\/([^/]+)\/media$/u)[1]);
      const media = { takeId, storageKey: `record-1/${takeId}-stored.bin`, sha256: hash };
      current = { ...current, revision: 2, takes: [{ id: takeId, ...media }] };
      await controller.select(second);
      return { record: current, media };
    }
    if (path.endsWith("/artifacts")) {
      current = { ...current, revision: 3, artifacts: [options.body] };
      return current;
    }
    if (path.endsWith("/mvei")) {
      current = { ...current, revision: 4, tracks: [{ ...options.body, type: "movement_notation" }] };
      return current;
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  controller = createWorkspaceState("https://relay.test", { request });
  await controller.login("member", "secret");
  await controller.select(first);
  await attachMovement(controller, {
    document: { type: "Motif", items: [] },
    subjectIds: ["performer-1"],
    filename: "switch.json",
  });
  assert.ok(mutationPaths.every((path) => path.startsWith("/work-records/record-1/")));
  assert.equal(controller.state.selected.id, "record-2");
  controller.logout();
});

test("workspace adapter retains canonical takes and prefers MvEI motion", () => {
  const raw = {
    ...baseRecord(),
    takes: [{ id: "take-1" }],
    tracks: [
      { id: "annotation", type: "movement_annotation" },
      { id: "notation", type: "movement_notation" },
    ],
  };
  const workspace = toWorkspaceRecord(raw);
  assert.equal(workspace.raw, raw);
  assert.equal(workspace.takes[0].id, "take-1");
  assert.equal(workspace.motion.id, "notation");
});
