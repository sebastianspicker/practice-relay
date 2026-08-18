/**
 * Bounded ELAN EAF importer for Practice Relay regions and comments.
 * Why: lossy federation input stays isolated from export serialization.
 */
import {
  inputLimitError,
  pushWarning,
  type ImportWarning,
} from "./import-warnings.js";

const KNOWN_EAF_TIERS = new Set(["regions", "comments"]);
const MAX_EAF_TIME_SLOTS = 20_000;
const MAX_EAF_ANNOTATIONS = 10_000;
const MAX_EAF_TIERS = 256;

/** Region/comment projection returned by EAF import. */
export interface ImportRegionsResult {
  regions: Array<{
    id: string;
    startMs: number;
    endMs: number;
    label?: string;
  }>;
  comments: Array<{
    id: string;
    regionId: string;
    authorId: string;
    body: string;
    resolved: boolean;
  }>;
  warnings: ImportWarning[];
}

/** Parse region/comment tier ids from EAF for smoke checks. */
export function parseEafTierIds(eafXml: string): string[] {
  const ids: string[] = [];
  const tierPattern = /TIER_ID="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = tierPattern.exec(eafXml))) ids.push(match[1]!);
  return ids;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

type ParsedAnnotation = {
  id: string;
  startMs: number;
  endMs: number;
  value: string;
};

function tierParser(context: {
  eafXml: string;
  slots: Map<string, number>;
  warnings: ImportWarning[];
  annotationCount: { value: number };
}) {
  return (tierId: string): ParsedAnnotation[] => {
    const tierMatch = context.eafXml.match(
      new RegExp(
        `<TIER[^>]*TIER_ID="${tierId}"[^>]*>([\\s\\S]*?)</TIER>`,
        "i",
      ),
    );
    if (!tierMatch) return [];
    const annotations: ParsedAnnotation[] = [];
    const pattern =
      /<ALIGNABLE_ANNOTATION\s+ANNOTATION_ID="([^"]+)"\s+TIME_SLOT_REF1="([^"]+)"\s+TIME_SLOT_REF2="([^"]+)"[^>]*>\s*<ANNOTATION_VALUE>([\s\S]*?)<\/ANNOTATION_VALUE>/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(tierMatch[1]!))) {
      annotations.push(parseTierAnnotation(match, tierId, context));
    }
    return annotations;
  };
}

/** Parse one aligned annotation while retaining importer limit and warning semantics. */
function parseTierAnnotation(match: RegExpExecArray, tierId: string, context: { slots: Map<string, number>; warnings: ImportWarning[]; annotationCount: { value: number } }): ParsedAnnotation {
  context.annotationCount.value += 1;
  if (context.annotationCount.value > MAX_EAF_ANNOTATIONS) throw inputLimitError("EAF", `annotations (${MAX_EAF_ANNOTATIONS})`);
  const [id, firstSlot, secondSlot] = [match[1]!, match[2]!, match[3]!];
  const value = decodeXml(match[4]!);
  if (!context.slots.has(firstSlot) || !context.slots.has(secondSlot)) pushWarning(context.warnings, "MISSING_TIME_SLOT", "annotation references unknown TIME_SLOT", id);
  if (!value.trim()) pushWarning(context.warnings, "EMPTY_ANNOTATION", `empty annotation value on tier "${tierId}"`, id);
  return { id, startMs: context.slots.get(firstSlot) ?? 0, endMs: context.slots.get(secondSlot) ?? 0, value };
}

function collectEafPreflight(
  eafXml: string,
  warnings: ImportWarning[],
): Map<string, number> {
  const slots = new Map<string, number>();
  const slotPattern =
    /<TIME_SLOT\s+TIME_SLOT_ID="([^"]+)"\s+TIME_VALUE="(\d+)"/g;
  let match: RegExpExecArray | null;
  let slotCount = 0;
  while ((match = slotPattern.exec(eafXml))) {
    slotCount += 1;
    if (slotCount > MAX_EAF_TIME_SLOTS) {
      throw inputLimitError("EAF", `time slots (${MAX_EAF_TIME_SLOTS})`);
    }
    slots.set(match[1]!, Number(match[2]));
  }

  const tierPattern = /TIER_ID="([^"]+)"/g;
  let tierCount = 0;
  while ((match = tierPattern.exec(eafXml))) {
    tierCount += 1;
    if (tierCount > MAX_EAF_TIERS) {
      throw inputLimitError("EAF", `tiers (${MAX_EAF_TIERS})`);
    }
    const tierId = match[1]!;
    if (!KNOWN_EAF_TIERS.has(tierId)) {
      pushWarning(
        warnings,
        "UNKNOWN_TIER",
        `unknown tier ignored: ${tierId} (only regions/comments are imported)`,
        tierId,
      );
    }
  }

  const mediaFileMatch = eafXml.match(/MEDIA_FILE="([^"]*)"/);
  const hasMediaDescriptor = /<MEDIA_DESCRIPTOR\b/i.test(eafXml);
  if (!(mediaFileMatch?.[1] ?? "") && !hasMediaDescriptor) {
    pushWarning(
      warnings,
      "MISSING_MEDIA",
      "missing media: no MEDIA_FILE or MEDIA_DESCRIPTOR in HEADER",
    );
  }
  return slots;
}

type IndexedRegion = {
  region: ImportRegionsResult["regions"][number];
  index: number;
};

type IndexedComment = { comment: ParsedAnnotation; index: number };

type EndSearch = {
  ends: number[];
  treeSize: number;
  tree: number[];
  endIndex: Map<number, number>;
};

function createEndSearch(regions: ImportRegionsResult["regions"]): EndSearch {
  const ends = [...new Set(regions.map((region) => region.endMs))].sort(
    (left, right) => left - right,
  );
  const treeSize = 1 << Math.ceil(Math.log2(Math.max(1, ends.length)));
  return {
    ends,
    treeSize,
    tree: new Array<number>(treeSize * 2).fill(Infinity),
    endIndex: new Map(ends.map((end, index) => [end, index])),
  };
}

function orderRegionsByStart(
  regions: ImportRegionsResult["regions"],
): IndexedRegion[] {
  return regions
    .map((region, index) => ({ region, index }))
    .sort(
      (left, right) =>
        left.region.startMs - right.region.startMs || left.index - right.index,
    );
}

function orderCommentsByStart(comments: ParsedAnnotation[]): IndexedComment[] {
  return comments
    .map((comment, index) => ({ comment, index }))
    .sort(
      (left, right) =>
        left.comment.startMs - right.comment.startMs || left.index - right.index,
    );
}

function lowerBound(values: number[], value: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle]! < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function updateEndSearch(search: EndSearch, end: number, index: number): void {
  let position = search.treeSize + search.endIndex.get(end)!;
  search.tree[position] = Math.min(search.tree[position]!, index);
  while (position > 1) {
    position = Math.floor(position / 2);
    search.tree[position] = Math.min(
      search.tree[position * 2]!,
      search.tree[position * 2 + 1]!,
    );
  }
}

function firstEndingAtOrAfter(search: EndSearch, end: number): number | undefined {
  let left = search.treeSize + lowerBound(search.ends, end);
  let right = search.treeSize + search.ends.length;
  let first = Infinity;
  while (left < right) {
    if (left % 2 === 1) first = Math.min(first, search.tree[left++]!);
    if (right % 2 === 1) first = Math.min(first, search.tree[--right]!);
    left = Math.floor(left / 2);
    right = Math.floor(right / 2);
  }
  return Number.isFinite(first) ? first : undefined;
}

function activateRegionsThrough(
  regions: IndexedRegion[],
  cursor: number,
  commentStartMs: number,
  search: EndSearch,
): number {
  while (
    cursor < regions.length &&
    regions[cursor]!.region.startMs <= commentStartMs
  ) {
    const next = regions[cursor++]!;
    updateEndSearch(search, next.region.endMs, next.index);
  }
  return cursor;
}

function overlappingRegionIndexes(
  regions: ImportRegionsResult["regions"],
  comments: ParsedAnnotation[],
): Map<number, number> {
  const search = createEndSearch(regions);
  const regionsByStart = orderRegionsByStart(regions);
  const commentsByStart = orderCommentsByStart(comments);
  const result = new Map<number, number>();
  let regionCursor = 0;
  for (const { comment, index } of commentsByStart) {
    regionCursor = activateRegionsThrough(
      regionsByStart,
      regionCursor,
      comment.startMs,
      search,
    );
    const match = firstEndingAtOrAfter(search, comment.endMs);
    if (match !== undefined) result.set(index, match);
  }
  return result;
}

function parseCommentValue(value: string): { authorId: string; body: string } {
  const colon = value.indexOf(":");
  const authorId =
    colon >= 0 ? value.slice(0, colon).trim() || "imported" : "imported";
  return {
    authorId,
    body: colon >= 0 ? value.slice(colon + 1).trim() : value,
  };
}

function projectEafComments(
  commentAnnotations: ParsedAnnotation[],
  regions: ImportRegionsResult["regions"],
  warnings: ImportWarning[],
): ImportRegionsResult["comments"] {
  const exactRegions = new Map<string, (typeof regions)[number]>();
  for (const region of regions) {
    const interval = `${region.startMs}:${region.endMs}`;
    if (!exactRegions.has(interval)) exactRegions.set(interval, region);
  }
  const overlaps = overlappingRegionIndexes(regions, commentAnnotations);
  return commentAnnotations
    .filter((comment) => comment.value.trim())
    .map((comment, index) => {
      const { authorId, body } = parseCommentValue(comment.value);
      const exact = exactRegions.get(`${comment.startMs}:${comment.endMs}`);
      const region = exact ?? regions[overlaps.get(index) ?? -1];
      if (!region) {
        pushWarning(
          warnings,
          "ORPHAN_COMMENT",
          "comment has no matching region; bound to synthetic region id",
          comment.id,
        );
      }
      return {
        id: comment.id,
        regionId: region?.id ?? `r-import-${index}`,
        authorId,
        body,
        resolved: false,
      };
    });
}

/** Import ELAN-like EAF into bounded regions, comments, and stable warnings. */
export function importEafToRecordParts(eafXml: string): ImportRegionsResult {
  const warnings: ImportWarning[] = [];
  const slots = collectEafPreflight(eafXml, warnings);

  const parseTier = tierParser({
    eafXml,
    slots,
    warnings,
    annotationCount: { value: 0 },
  });
  const regionAnnotations = parseTier("regions");
  const regions = regionAnnotations
    .filter((region) => region.value.trim())
    .map((region) => ({
      id: region.id.replace(/^a-reg-/, "r-") || region.id,
      startMs: region.startMs,
      endMs: region.endMs,
      label: region.value,
    }));
  const commentAnnotations = parseTier("comments");
  const comments = projectEafComments(commentAnnotations, regions, warnings);
  if (regions.length === 0 && comments.length === 0) {
    pushWarning(
      warnings,
      "EMPTY_DOCUMENT",
      "EAF produced no regions or comments after import",
    );
  }
  return { regions, comments, warnings };
}
