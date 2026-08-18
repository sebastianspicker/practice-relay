/** Shipped-entry-point scenario runners for the E2E demo facade. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkRecord } from "@practice-relay/work-record-core";
import {
  exportWorkRecordPackage,
  validateRoCrateMetadata,
  WORK_RECORD_PACKAGE_PROFILE_URI,
  RO_CRATE_CONTEXT,
} from "@practice-relay/work-record-package";
import { validateMveiDocument } from "../mvei/packages/validator/src/cli.ts";
import {
  addItem,
  emitMotif,
  loadMotif,
  removeItem,
  reorderItems,
  updateItem,
} from "../mvei/apps/workbench/src/motif.mjs";
import { validateMotifAgainstSchema } from "../mvei/apps/workbench/src/validate-motif.mjs";
import {
  buildMultiAssetAssignmentPayload,
  LTI_ASSIGNMENT_PAYLOAD_STATUS,
  LTI_STATUS,
  validateMultiAssetAssignmentPayload,
} from "../practice-relay/apps/lti/src/index.mjs";
import { readContainedText, writeContainedText } from "./contained-output.mjs";
import { loadMotifJson, MOTIF_PATH, root } from "./e2e-demo-fixtures.ts";
import { buildDemoScoreFromSeed } from "./e2e-demo-record.ts";
import type { DemoStep, Seed } from "./e2e-demo-types.ts";

function failure(id: string, error: unknown): DemoStep {
  return { id, ok: false, detail: error instanceof Error ? error.message : String(error) };
}

/** Build and inspect the complete Practice Relay lifecycle step. */
export function runLifecycle(seed: Seed): { score: WorkRecord; step: DemoStep } | { step: DemoStep } {
  try {
    const score = buildDemoScoreFromSeed(seed);
    const trackTypes = new Set(score.tracks.map((track) => track.type));
    return {
      score,
      step: {
        id: "practice-relay.lifecycle",
        ok:
          score.id === seed.id &&
          trackTypes.size >= 4 &&
          score.preferredTakeId === seed.preferredTakeId &&
          score.usePolicySnapshots.length > 0 &&
          score.comments.some((comment) => comment.id === seed.comment.id && comment.resolved) &&
          score.tracks.some((track) => track.type === "movement_notation"),
        detail: `record ${score.id} tracks=${score.tracks.length} types=${trackTypes.size} preferred=${score.preferredTakeId} comments_resolved=${score.comments.filter((comment) => comment.resolved).length}`,
        data: {
          id: score.id,
          trackTypes: [...trackTypes],
          preferredTakeId: score.preferredTakeId,
          purposes: score.usePolicySnapshots.flatMap((consent) => consent.purposes),
        },
      },
    };
  } catch (error) {
    return { step: failure("practice-relay.lifecycle", error) };
  }
}

/** Export and validate the WorkRecord package plus its RO-Crate projection. */
export function runPackageExport(score: WorkRecord): DemoStep {
  try {
    const { manifest, roCrateMetadata, validated } = exportWorkRecordPackage(score);
    const profileOk =
      typeof manifest.profile === "string" &&
      manifest.profile.length > 0 &&
      manifest.profile === WORK_RECORD_PACKAGE_PROFILE_URI;
    const crateCheck = validateRoCrateMetadata(roCrateMetadata);
    const crateRoot = roCrateMetadata["@graph"].find((node) => node["@id"] === "./") as
      | Record<string, unknown>
      | undefined;
    const crateIdMatch = crateRoot?.["workRecord:workRecordId"] === manifest.workRecordId;
    const crateMveiMatch = crateRoot?.["workRecord:mveiRef"] === manifest.mveiRef;
    return {
      id: "practice-relay.work-record-package-export",
      ok:
        validated === true &&
        profileOk &&
        crateCheck.ok === true &&
        crateIdMatch &&
        roCrateMetadata["@context"] === RO_CRATE_CONTEXT,
      detail: `validated=${validated} profile=${manifest.profile} roCrate=${crateCheck.ok} mveiMatch=${crateMveiMatch}`,
      data: {
        profile: manifest.profile,
        workRecordId: manifest.workRecordId,
        trackCount: manifest.tracks.length,
        preferredTakeId: manifest.preferredTakeId,
        mveiRef: manifest.mveiRef,
        roCrateContext: roCrateMetadata["@context"],
        roCrateWorkRecordId: crateRoot?.["workRecord:workRecordId"],
      },
    };
  } catch (error) {
    return failure("practice-relay.work-record-package-export", error);
  }
}

/** Build and validate the local-mock multi-asset assignment payload. */
export function runMultiAssetAssignment(score: WorkRecord): DemoStep {
  try {
    const payload = buildMultiAssetAssignmentPayload(score);
    const check = validateMultiAssetAssignmentPayload(payload);
    const multi =
      payload.assetMode === "multi-asset" &&
      payload.singleVideoUrl === null &&
      payload.trackTypes.length >= 4 &&
      payload.packageId === score.id &&
      payload.preferredTakeId === score.preferredTakeId &&
      (LTI_STATUS === "local-mock" || LTI_STATUS === "stub") &&
      LTI_ASSIGNMENT_PAYLOAD_STATUS === "ready";
    return {
      id: "practice-relay.multi-asset-assignment",
      ok: check.ok === true && multi,
      detail: `packageId=${payload.packageId} trackTypes=${payload.trackTypes.length} preferred=${payload.preferredTakeId} consentRequired=${payload.consentRequired} handshake=${payload.ltiHandshakeStatus}`,
      data: {
        packageId: payload.packageId,
        trackTypes: payload.trackTypes,
        preferredTakeId: payload.preferredTakeId,
        consentRequired: payload.consentRequired,
        mveiRef: payload.mveiRef,
        assetMode: payload.assetMode,
        singleVideoUrl: payload.singleVideoUrl,
      },
    };
  } catch (error) {
    return failure("practice-relay.multi-asset-assignment", error);
  }
}

/** Validate the contained shared Motif fixture. */
export function runValidMotifValidation(): DemoStep {
  try {
    readContainedText(root, MOTIF_PATH);
    const valid = validateMveiDocument(MOTIF_PATH);
    return {
      id: "mvei.validate_valid",
      ok: valid.ok === true,
      detail: valid.message,
      data: { path: MOTIF_PATH },
    };
  } catch (error) {
    return failure("mvei.validate_valid", error);
  }
}

/** Prove the shipped validator rejects a temporary invalid Motif. */
export function runInvalidMotifValidation(): DemoStep {
  const invalidDir = mkdtempSync(join(tmpdir(), "practice-relay-e2e-invalid-"));
  try {
    const badPath = join(invalidDir, "invalid-empty.json");
    writeContainedText(invalidDir, badPath, "{}\n");
    const invalid = validateMveiDocument(badPath);
    return {
      id: "mvei.validate_invalid",
      ok: invalid.ok === false,
      detail: invalid.ok
        ? "expected reject but validator accepted empty object"
        : `rejected as expected: ${invalid.message}`,
      data: { rejected: !invalid.ok, message: invalid.message },
    };
  } catch (error) {
    return failure("mvei.validate_invalid", error);
  } finally {
    rmSync(invalidDir, { recursive: true, force: true });
  }
}

/** Round-trip the shared Motif through the Workbench entry points. */
export function runWorkbenchLoadEmit(): DemoStep {
  try {
    const raw = loadMotifJson();
    const doc = loadMotif(raw);
    const emitted = emitMotif(doc);
    const round = loadMotif(emitted);
    const schema = validateMotifAgainstSchema(doc);
    return {
      id: "mvei-workbench.load-emit",
      ok:
        doc.profile === "mvei-motif" &&
        doc.items.length > 0 &&
        round.id === doc.id &&
        schema.ok === true,
      detail: `id=${doc.id} items=${doc.items.length} schema=${schema.message} roundTripId=${round.id}`,
      data: {
        id: doc.id,
        completeness: doc.completeness,
        itemCount: doc.items.length,
        schemaOk: schema.ok,
      },
    };
  } catch (error) {
    return failure("mvei-workbench.load-emit", error);
  }
}

/** Exercise Workbench item edit operations and its shared-schema round trip. */
export function runWorkbenchMotifEdit(): DemoStep {
  try {
    let doc = loadMotif(loadMotifJson());
    const originalCount = doc.items.length;
    const firstId = doc.items[0]?.id;
    if (!firstId) throw new Error("demo Motif has no items to edit");

    doc = addItem(doc, { id: "e2e-edit-item", symbol: "e2e-gesture" });
    doc = updateItem(doc, "e2e-edit-item", { symbol: "e2e-gesture-updated" });
    const ids = doc.items.map((item) => item.id);
    // move new item to front
    doc = reorderItems(doc, ["e2e-edit-item", ...ids.filter((id) => id !== "e2e-edit-item")]);
    doc = removeItem(doc, "e2e-edit-item");
    if (doc.items.length !== originalCount) {
      throw new Error(`edit cycle length drift: ${doc.items.length} vs ${originalCount}`);
    }

    const emitted = emitMotif(doc);
    const reloaded = loadMotif(emitted);
    const schema = validateMotifAgainstSchema(reloaded);
    return {
      id: "mvei-workbench.motif-edit",
      ok:
        schema.ok === true &&
        reloaded.profile === "mvei-motif" &&
        reloaded.items.length === originalCount &&
        !reloaded.items.some((item) => item.id === "e2e-edit-item"),
      detail: `items=${reloaded.items.length} schema=${schema.message} firstId=${firstId}`,
      data: {
        id: reloaded.id,
        completeness: reloaded.completeness,
        itemCount: reloaded.items.length,
        schemaOk: schema.ok,
      },
    };
  } catch (error) {
    return failure("mvei-workbench.motif-edit", error);
  }
}
