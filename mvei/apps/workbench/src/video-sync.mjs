/**
 * MvEI Workbench video ↔ Motif time-anchor sync helpers.
 */

/**
 * Find Motif item nearest to video time (ms).
 * @param {Array<{ id: string, timeAnchor?: { tMs?: number } }>} items
 * @param {number} tMs
 * @param {number} [windowMs]
 */
export function nearestItemAt(items, tMs, windowMs = 1500) {
  let best = null;
  let bestDist = Infinity;
  for (const item of items ?? []) {
    const at = item.timeAnchor?.tMs;
    if (typeof at !== "number") continue;
    const d = Math.abs(at - tMs);
    if (d < bestDist && d <= windowMs) {
      best = item;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Seek target ms for an item (null if no anchor).
 * @param {{ timeAnchor?: { tMs?: number } }} item
 */
export function seekMsForItem(item) {
  const t = item?.timeAnchor?.tMs;
  return typeof t === "number" ? t : null;
}

/**
 * @param {number} currentMs
 * @param {string | null | undefined} activeId
 * @param {Array<{ id: string, timeAnchor?: { tMs?: number } }>} items
 */
export function shouldUpdateHighlight(currentMs, activeId, items) {
  const n = nearestItemAt(items, currentMs);
  const nextId = n?.id ?? null;
  return nextId !== (activeId ?? null) ? nextId : activeId ?? null;
}
