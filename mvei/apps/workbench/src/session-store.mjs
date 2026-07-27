/**
 * Persistent MvEI Workbench Motif sessions: pure localStorage helpers (no DOM required).
 *
 * Storage is injected so Node tests can use a Map-backed mock.
 */
import { emitMotif, loadMotif } from "./motif.mjs";

/** Default localStorage key for the Motif document session. */
export const SESSION_KEY = "mvei.workbench.motif.session.v1";

/**
 * @param {import("./motif.mjs").MotifDocument} doc
 * @returns {string}
 */
export function serializeSession(doc) {
  return emitMotif(doc);
}

/**
 * @param {string} raw
 * @returns {import("./motif.mjs").MotifDocument}
 */
export function deserializeSession(raw) {
  return loadMotif(raw);
}

/**
 * @typedef {{ getItem: (k: string) => string | null, setItem: (k: string, v: string) => void, removeItem?: (k: string) => void }} StorageLike
 */

/**
 * Save Motif document to storage.
 * @param {StorageLike} storage
 * @param {import("./motif.mjs").MotifDocument} doc
 * @param {string} [key]
 */
export function saveSession(storage, doc, key = SESSION_KEY) {
  if (!storage || typeof storage.setItem !== "function") {
    throw new TypeError("storage with setItem required");
  }
  storage.setItem(key, serializeSession(doc));
  return key;
}

/**
 * Load Motif document from storage, or null if missing.
 * @param {StorageLike} storage
 * @param {string} [key]
 * @returns {import("./motif.mjs").MotifDocument | null}
 */
export function loadSession(storage, key = SESSION_KEY) {
  if (!storage || typeof storage.getItem !== "function") {
    throw new TypeError("storage with getItem required");
  }
  const raw = storage.getItem(key);
  if (raw == null || raw === "") return null;
  return deserializeSession(raw);
}

/**
 * Clear session key.
 * @param {StorageLike} storage
 * @param {string} [key]
 */
export function clearSession(storage, key = SESSION_KEY) {
  if (typeof storage.removeItem === "function") {
    storage.removeItem(key);
  } else {
    storage.setItem(key, "");
  }
}

/**
 * In-memory Storage-like for tests.
 * @returns {StorageLike & { _data: Map<string, string> }}
 */
export function createMemoryStorage() {
  const data = new Map();
  return {
    _data: data,
    getItem(k) {
      return data.has(k) ? data.get(k) : null;
    },
    setItem(k, v) {
      data.set(k, String(v));
    },
    removeItem(k) {
      data.delete(k);
    },
  };
}
