/** Deterministic GitHub Pages static-demo contract proof. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fallbackRecords } from "../src/data/fallback-records.mjs";
import { isGitHubPagesHostname } from "../src/demo-mode.mjs";

const indexPath = fileURLToPath(new URL("../src/index.html", import.meta.url));

function verifyFallbackInventory() {
  const ids = fallbackRecords.map((record) => record.id);
  const profiles = new Set(fallbackRecords.map((record) => record.profile));

  assert.ok(fallbackRecords.length >= 4, "static demo supplies a substantive record inventory");
  assert.equal(new Set(ids).size, fallbackRecords.length, "fallback IDs are distinct");
  for (const profile of ["Field study", "Design studio", "Performing arts"]) {
    assert.ok(profiles.has(profile), `fallback inventory includes ${profile}`);
  }
  for (const record of fallbackRecords) {
    assert.ok(record.artifacts.length > 0, `${record.id} retains evidence artifacts`);
    assert.ok(record.members.length > 0, `${record.id} names synthetic record members`);
    assert.ok(record.representedSubjects.length > 0, `${record.id} retains represented subjects`);
    assert.ok(record.representedSubjects.every((subject) => ["Person", "Group", "Place", "Other"].includes(subject.type)), `${record.id} uses canonical represented-subject types`);
    assert.ok(record.usePolicies.length > 0, `${record.id} retains use policies`);
    assert.ok(record.versions.length > 0, `${record.id} retains version history`);
    assert.match(record.provenance.sourceSystem, /synthetic/i, `${record.id} is clearly synthetic`);
  }
  assert.ok(fallbackRecords.some((record) => record.snapshots.length === 0), "one record awaits evidence selection");
  assert.ok(fallbackRecords.some((record) => record.snapshots.some((snapshot) => snapshot.artifactIds.length < record.artifacts.length)), "one record demonstrates a bounded evidence selection");
}

function verifyHostedModeDetector() {
  assert.equal(isGitHubPagesHostname("practice-relay.github.io"), true);
  assert.equal(isGitHubPagesHostname("ORG.GITHUB.IO"), true);
  assert.equal(isGitHubPagesHostname("preview.practice-relay.example"), false);
  assert.equal(isGitHubPagesHostname(undefined), false);
}

async function verifyPublishedDependencyGraph() {
  const index = await readFile(indexPath, "utf8");

  assert.match(index, /href="\.\/assets\/practice-relay-mark\.svg"/);
  assert.match(index, /href="\.\/app\.css"/);
  assert.match(index, /<script type="module" src="\.\/practice-relay-app\.mjs"><\/script>/);
  assert.doesNotMatch(index, /(?:screenshot|tour|capture)/i);
}

verifyFallbackInventory();
verifyHostedModeDetector();
await verifyPublishedDependencyGraph();
