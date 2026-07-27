/**
 * MvEI Workbench package entry re-exports (shell + Motif + validate).
 * package.json "dev" prints scaffoldBanner when run as CLI.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export {
  BRAND,
  STANDARD,
  MVEI_WORKBENCH_STATUS,
  scaffoldBanner,
  loadCorpusSketch,
  loadDemoMotif,
  roundTrip,
  renderShellHtml,
  CORPUS_SKETCH_PATH,
  CORPUS_PARTIAL_PATH,
  DEMO_MOTIF_PATH,
} from "./shell.mjs";

export {
  loadMotif,
  emitMotif,
  createSketchMotif,
  addItem,
  updateItem,
  removeItem,
  reorderItems,
} from "./motif.mjs";

export {
  validateMotifAgainstSchema,
  MOTIF_SCHEMA_PATH,
} from "./validate-motif.mjs";

export {
  SESSION_KEY,
  saveSession,
  loadSession,
  clearSession,
  serializeSession,
  deserializeSession,
  createMemoryStorage,
} from "./session-store.mjs";

export {
  loadLabanSubset,
  loadCorpusLabanSubset,
  renderLabanSubsetStaffHtml,
  addLabanSymbol,
  removeLabanSymbol,
  LABAN_SUBSET_CORPUS_PATH,
} from "./laban-subset.mjs";

export {
  MOTIF_PALETTE,
  addFromPalette,
  addFromPaletteKeyboard,
  tileAriaLabel,
  renderPaletteButtonHtml,
  renderTileHtml,
  renderCanvasTilesHtml,
  FOCUS_STYLES,
  setEditorMode,
  modeAnnouncement,
} from "./canvas.mjs";

export {
  createSessionSync,
  createMemoryChannel,
  createYjsChannel,
  openSyncChannel,
  resolveSyncMode,
  SYNC_CHANNEL,
  SYNC_MODES,
} from "./session-sync.mjs";

export {
  renderAriaLiveRegion,
  announceToLiveRegion,
} from "./shell.mjs";

export { createHistory } from "./history.mjs";

import { scaffoldBanner } from "./shell.mjs";

const entryHref = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entryHref) {
  console.log(scaffoldBanner());
}
