/**
 * Shared boundary for Workbench documents that arrive as JSON or records.
 *
 * Validation remains document-specific: callers provide identity and required
 * field checks so their field reads, error text, and evaluation order stay
 * owned by the document module.
 */

/**
 * Parse a JSON string or retain an object input, then run its validators.
 * @param {string | object} jsonStringOrObject
 * @param {{ objectErrorMessage: string, validateIdentity: (doc: object) => void, validateRequiredFields: (doc: object) => void }} options
 * @returns {object}
 */
export function loadValidatedDocument(
  jsonStringOrObject,
  { objectErrorMessage, validateIdentity, validateRequiredFields },
) {
  const doc =
    typeof jsonStringOrObject === "string"
      ? JSON.parse(jsonStringOrObject)
      : jsonStringOrObject;
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new TypeError(objectErrorMessage);
  }
  validateIdentity(doc);
  validateRequiredFields(doc);
  return doc;
}
