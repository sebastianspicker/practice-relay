/**
 * MvEI Workbench laban-subset mode: load subset JSON and render a simple column staff.
 * Not Motif-only: multi-staff pedagogical reading (not professional Laban density).
 */
import { parseMovementDocument } from "@practice-relay/movement/browser/parser";

/** @typedef {import("@practice-relay/movement").LabanSubsetDocument} LabanSubsetDocument */

/**
 * @param {string | object} jsonStringOrObject
 * @returns {LabanSubsetDocument}
 */
export function loadLabanSubset(jsonStringOrObject) {
  const doc = parseMovementDocument(jsonStringOrObject);
  if (doc.profile !== "mvei-laban-subset") {
    throw new Error(`Expected laban-subset document, got ${JSON.stringify(doc.profile)}`);
  }
  return /** @type {LabanSubsetDocument} */ (doc);
}

export { renderLabanSubsetStaffHtml } from "./laban-render.mjs";
