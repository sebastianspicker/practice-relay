/** Deterministic manifest DOM security regression proof. */
import assert from "node:assert/strict";
import { renderPackageManifest } from "../src/render/package-manifest.mjs";
import { renderRecord } from "../src/render/record.mjs";
import { renderRecordIndexHtml } from "../src/render/record-index.mjs";
import { pathStages } from "../src/render/path.mjs";
import { toWorkspaceRecord } from "../src/data/workspace-record.mjs";

class FakeNode {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.textContent = "";
    this.attributes = [];
  }

  append(...nodes) {
    this.children.push(...nodes);
  }
}

class FakeFragment extends FakeNode {
  constructor() {
    super("#fragment");
  }
}

class FakeManifest extends FakeNode {
  constructor() {
    super("UL");
    this.replaceChildrenCalls = 0;
  }

  replaceChildren(...nodes) {
    this.replaceChildrenCalls += 1;
    this.children = nodes.flatMap((node) =>
      node instanceof FakeFragment ? node.children : [node],
    );
  }
}

function createFakeDocument() {
  return {
    createDocumentFragment() {
      return new FakeFragment();
    },
    createElement(tagName) {
      return new FakeNode(tagName.toUpperCase());
    },
  };
}

function allNodes(node) {
  return [node, ...node.children.flatMap(allNodes)];
}

function verifyRenderingSecurity() {
  const orderedManifest = new FakeManifest();
  const orderedRecord = {
    artifacts: [
      { id: 2, name: "Second" },
      { id: "skip", name: "Excluded" },
      { id: 1, label: "First" },
    ],
    includedIds: ["1", "2"],
  };

  renderPackageManifest(createFakeDocument(), orderedManifest, orderedRecord);

  assert.equal(orderedManifest.replaceChildrenCalls, 1);
  assert.deepEqual(
    orderedManifest.children.map((item) => [
      item.tagName,
      item.children.map((child) => child.tagName),
      item.children.map((child) => child.textContent),
    ]),
    [
      ["LI", ["SPAN", "CODE"], ["Second", "2"]],
      ["LI", ["SPAN", "CODE"], ["First", "1"]],
    ],
  );

  const hostileManifest = new FakeManifest();
  const hostileName = '<img src=x onerror="globalThis.compromised=true">';
  const hostileId = '"><svg onload="globalThis.compromised=true">';

  renderPackageManifest(createFakeDocument(), hostileManifest, {
    artifacts: [{ id: hostileId, name: hostileName }, {}],
    includedIds: [hostileId, "undefined"],
  });

  assert.equal(hostileManifest.replaceChildrenCalls, 1);
  assert.equal(hostileManifest.children[0].children[0].textContent, hostileName);
  assert.equal(hostileManifest.children[0].children[1].textContent, hostileId);
  assert.equal(hostileManifest.children[1].children[0].textContent, "Evidence item");
  assert.equal(hostileManifest.children[1].children[1].textContent, "undefined");
  assert.deepEqual(
    allNodes(hostileManifest).map((node) => node.tagName),
    ["UL", "LI", "SPAN", "CODE", "LI", "SPAN", "CODE"],
  );
  assert.ok(allNodes(hostileManifest).every((node) => node.attributes.length === 0));

  const hostile = '<img src=x onerror="globalThis.compromised=true">';
  const record = {
    id: hostile,
    title: hostile,
    profile: hostile,
    revision: 3,
    submitted: "2026-07-18",
    snapshotLabel: hostile,
    provenance: { sourceSystem: hostile },
    versions: [{ name: hostile }],
    snapshots: [{ id: "snapshot-03" }],
    artifacts: [{ id: "artifact", name: hostile, mediaType: "text/markdown", detail: hostile }],
    includedIds: ["artifact"],
    members: [{ label: hostile, role: hostile }],
    subjects: [{ id: "subject", label: hostile }],
    policies: [
      { id: "grant", label: hostile, representedSubjectId: "subject", destination: hostile, state: "granted", createdAt: "2026-07-18" },
      { id: "deny", label: hostile, representedSubjectId: "subject", destination: hostile, state: "denied", createdAt: "2026-07-18" },
      { id: "withdraw", label: hostile, representedSubjectId: "subject", destination: hostile, state: "withdrawn", createdAt: "2026-07-18" },
    ],
  };
  const renderedRecord = renderRecord(record);
  assert.ok(renderedRecord.includes("Use decisions"));
  assert.ok(renderedRecord.includes("Participants"));
  assert.ok(renderedRecord.includes("Role labels do not grant record access."));
  assert.ok(renderedRecord.includes("state-pill granted"));
  assert.ok(renderedRecord.includes("state-pill denied"));
  assert.ok(renderedRecord.includes("state-pill withdrawn"));
  assert.ok(renderedRecord.includes("&lt;img src=x onerror=&quot;globalThis.compromised=true&quot;&gt;"));
  assert.equal(renderedRecord.includes(hostile), false);

  const adaptedHostile = toWorkspaceRecord({
    id: hostile,
    title: hostile,
    artifacts: record.artifacts,
    members: record.members,
    representedSubjects: record.subjects,
    usePolicies: record.policies,
    snapshots: [{ id: "snapshot-03", artifactIds: ["artifact"], createdAt: "2026-07-18" }],
    versions: record.versions,
    provenance: record.provenance,
  });
  assert.equal(adaptedHostile.policies[2].state, "withdrawn");
  assert.equal(adaptedHostile.subjects[0].label, hostile);
  assert.equal(renderRecord(adaptedHostile).includes(hostile), false);

  const canonicalMember = renderRecord({ ...record, members: [{ userId: "ada-m", role: "student" }] });
  assert.ok(canonicalMember.includes("ada-m"));

  const readyRecord = {
    ...record,
    id: "safe-id",
    title: "Safe record",
    policies: [
      { purpose: "assessment", state: "granted" },
      { purpose: "repository", state: "granted" },
    ],
  };
  assert.match(renderRecordIndexHtml([readyRecord], "safe-id"), /dot ok[^>]*><\/span>Ready/);
  assert.match(renderRecordIndexHtml([record], hostile), /dot hold[^>]*><\/span>Hold/);
  assert.deepEqual(pathStages(readyRecord).map((stage) => stage.name), ["Version", "Evidence", "Conditions", "Recipient", "Seal"]);
  assert.equal(pathStages(readyRecord).at(-1).className, "now");
  const incompleteRecord = { ...readyRecord, versions: [], snapshots: [] };
  assert.equal(pathStages(incompleteRecord)[0].className, "now");
  assert.equal(pathStages(incompleteRecord)[2].className, "");
  return true;
}

export const verificationComplete = verifyRenderingSecurity();
