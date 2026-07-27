/**
 * Undo/redo history for MvEI Workbench Motif documents (pure stack).
 */

/**
 * @template T
 * @param {T} initial
 */
export function createHistory(initial) {
  /** @type {T[]} */
  let past = [];
  /** @type {T} */
  let present = structuredClone
    ? structuredClone(initial)
    : JSON.parse(JSON.stringify(initial));
  /** @type {T[]} */
  let future = [];

  return {
    get() {
      return present;
    },
    /**
     * @param {T} next
     */
    push(next) {
      past.push(present);
      present = structuredClone
        ? structuredClone(next)
        : JSON.parse(JSON.stringify(next));
      future = [];
      return present;
    },
    canUndo() {
      return past.length > 0;
    },
    canRedo() {
      return future.length > 0;
    },
    undo() {
      if (!past.length) return present;
      future.unshift(present);
      present = past.pop();
      return present;
    },
    redo() {
      if (!future.length) return present;
      past.push(present);
      present = future.shift();
      return present;
    },
    /**
     * Replace present without stacking (e.g. load file).
     * @param {T} next
     */
    reset(next) {
      past = [];
      future = [];
      present = structuredClone
        ? structuredClone(next)
        : JSON.parse(JSON.stringify(next));
      return present;
    },
  };
}
