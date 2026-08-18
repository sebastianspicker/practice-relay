/** Domain-only WorkRecord construction for the E2E demo fixture. */
import {
  addComment,
  addMember,
  addRegion,
  addTake,
  addTrack,
  attachUsePolicySnapshot,
  attachMveiMotifTrack,
  createEmptyRecord,
  resolveComment,
  setPreferredTake,
  submitVersion,
  type WorkRecord,
} from "@practice-relay/work-record-core";
import { join } from "node:path";
import { loadSeed, root } from "./e2e-demo-fixtures.ts";
import type { Seed } from "./e2e-demo-types.ts";

/** Build a WorkRecord from the demo seed via domain constructors only. */
export function buildDemoScoreFromSeed(seed: Seed = loadSeed()): WorkRecord {
  let score = createEmptyRecord(seed.id, seed.title);

  for (const m of seed.members) {
    score = addMember(score, m);
  }
  for (const t of seed.tracks) {
    score = addTrack(score, t);
  }
  for (const take of seed.takes) {
    score = addTake(score, take);
  }
  score = setPreferredTake(score, seed.preferredTakeId);
  score = addRegion(score, seed.region);
  score = addComment(score, {
    id: seed.comment.id,
    regionId: seed.comment.regionId,
    trackId: seed.comment.trackId,
    authorId: seed.comment.authorId,
    body: seed.comment.body,
    resolved: seed.comment.resolved ?? false,
  });
  score = attachUsePolicySnapshot(score, {
    id: seed.consent.id,
    subjectId: seed.consent.subjectId,
    purposes: seed.consent.purposes,
    exportAllowed: seed.consent.exportAllowed ?? true,
    createdAt: new Date().toISOString(),
  });
  // Motif ref is relative to monorepo root - real path, not a "mock" string
  const motifRef = seed.motif.ref.startsWith("/")
    ? seed.motif.ref
    : join(root, seed.motif.ref);
  score = attachMveiMotifTrack(score, {
    id: seed.motif.trackId,
    label: seed.motif.label,
    ref: motifRef,
  });
  score = resolveComment(score, seed.comment.id);
  return submitVersion(score, seed.submitTag);
}
