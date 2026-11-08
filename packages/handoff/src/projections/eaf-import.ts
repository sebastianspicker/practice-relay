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

const XML_ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };

/** Single-pass entity decode so `&amp;lt;` stays `&lt;`; invalid code points stay literal. */
function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (match, name: string) => {
    if (name[0] !== "#") return Object.hasOwn(XML_ENTITIES, name) ? XML_ENTITIES[name]! : match;
    const codePoint = name[1] === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    const valid = codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff);
    return valid ? String.fromCodePoint(codePoint) : match;
  });
}

/** Decode entities and CDATA sections (CDATA content is literal); linear via indexOf. */
function decodeXml(value: string): string {
  let out = "";
  let cursor = 0;
  while (cursor < value.length) {
    const open = value.indexOf("<![CDATA[", cursor);
    const close = open === -1 ? -1 : value.indexOf("]]>", open + 9);
    if (close === -1) return out + decodeEntities(value.slice(cursor));
    out += decodeEntities(value.slice(cursor, open)) + value.slice(open + 9, close);
    cursor = close + 3;
  }
  return out;
}

type ParsedAnnotation = {
  id: string;
  startMs: number;
  endMs: number;
  value: string;
};

type TierParseContext = {
  eafXml: string;
  slots: Map<string, number>;
  warnings: ImportWarning[];
  annotationCount: { value: number };
};

function asciiTokenAt(value: string, token: string, start: number): boolean {
  if (start + token.length > value.length) return false;
  for (let offset = 0; offset < token.length; offset += 1) {
    const codeUnit = value.charCodeAt(start + offset);
    const folded = codeUnit >= 0x41 && codeUnit <= 0x5a ? codeUnit + 0x20 : codeUnit;
    if (folded !== token.charCodeAt(offset)) return false;
  }
  return true;
}

function findAsciiToken(value: string, token: string, start: number): number {
  for (let cursor = start; cursor + token.length <= value.length; cursor += 1) {
    if (asciiTokenAt(value, token, cursor)) return cursor;
  }
  return -1;
}

/** Match `tier_id="<id>"` as a whole attribute (whitespace before it) with an exact-case value. */
function hasExactTierId(openingTag: string, attribute: string): boolean {
  const valueStart = attribute.indexOf('"') + 1;
  for (let at = findAsciiToken(openingTag, attribute, 0); at !== -1; at = findAsciiToken(openingTag, attribute, at + 1)) {
    const boundary = at === 0 || /\s/u.test(openingTag[at - 1]!);
    if (boundary && openingTag.slice(at + valueStart, at + attribute.length) === attribute.slice(valueStart)) return true;
  }
  return false;
}

/** Find one named tier without rescanning suffixes of malformed opening tags. */
function findTierContent(eafXml: string, tierId: "regions" | "comments"): string | undefined {
  const attribute = `tier_id="${tierId}"`;
  let cursor = 0;
  while (cursor < eafXml.length) {
    const start = findAsciiToken(eafXml, "<tier", cursor);
    if (start === -1) return undefined;
    const boundary = eafXml.at(start + 5);
    if (boundary !== undefined && boundary !== ">" && !/\s/u.test(boundary)) {
      cursor = start + 5;
      continue;
    }
    let openingEnd = start + 5;
    while (
      openingEnd < eafXml.length &&
      eafXml.at(openingEnd) !== "<" &&
      eafXml.at(openingEnd) !== ">"
    ) {
      openingEnd += 1;
    }
    if (eafXml.at(openingEnd) !== ">") {
      cursor = openingEnd;
      continue;
    }
    const openingTag = eafXml.slice(start + 5, openingEnd);
    if (hasExactTierId(openingTag, attribute)) {
      if (eafXml[openingEnd - 1] === "/") return "";
      const closingStart = findAsciiToken(eafXml, "</tier>", openingEnd + 1);
      if (closingStart === -1) return undefined;
      return eafXml.slice(openingEnd + 1, closingStart);
    }
    cursor = openingEnd + 1;
  }
  return undefined;
}

/** Parse one aligned annotation while retaining importer limit and warning semantics. */
function parseTierAnnotation(
  match: RegExpExecArray,
  rawValue: string,
  tierId: string,
  context: TierParseContext,
): ParsedAnnotation {
  context.annotationCount.value += 1;
  if (context.annotationCount.value > MAX_EAF_ANNOTATIONS) {
    throw inputLimitError("EAF", `annotations (${MAX_EAF_ANNOTATIONS})`);
  }
  const [id, firstSlot, secondSlot] = [match[1]!, match[2]!, match[3]!];
  const value = decodeXml(rawValue);
  if (!context.slots.has(firstSlot) || !context.slots.has(secondSlot)) {
    pushWarning(
      context.warnings,
      "MISSING_TIME_SLOT",
      "annotation references unknown TIME_SLOT",
      id,
    );
  }
  if (!value.trim()) {
    pushWarning(
      context.warnings,
      "EMPTY_ANNOTATION",
      `empty annotation value on tier "${tierId}"`,
      id,
    );
  }
  return {
    id,
    startMs: context.slots.get(firstSlot) ?? 0,
    endMs: context.slots.get(secondSlot) ?? 0,
    value,
  };
}

function tierParser(context: TierParseContext) {
  return (tierId: "regions" | "comments"): ParsedAnnotation[] => {
    const tierContent = findTierContent(context.eafXml, tierId);
    if (tierContent === undefined) return [];
    const annotations: ParsedAnnotation[] = [];
    const closing = "</ANNOTATION_VALUE>";
    // Bounded quantifiers: an unclosed tag must not rescan the rest of the tier from every start.
    const annotationPattern =
      /<ALIGNABLE_ANNOTATION\s+ANNOTATION_ID="([^"]{1,256})"\s+TIME_SLOT_REF1="([^"]{1,256})"\s+TIME_SLOT_REF2="([^"]{1,256})"[^>]{0,1024}>\s*<ANNOTATION_VALUE>/g;
    let match: RegExpExecArray | null;
    while ((match = annotationPattern.exec(tierContent))) {
      // indexOf keeps unclosed openings linear (a lazy regex rescans to the end each time).
      // shortcut: a CDATA section whose text contains the closing tag ends the value early; ELAN escapes
      // values instead of using CDATA, so upgrade only if a partner exports CDATA-wrapped markup.
      const close = tierContent.indexOf(closing, annotationPattern.lastIndex);
      if (close === -1) {
        pushWarning(context.warnings, "MALFORMED_ANNOTATION", `unclosed ANNOTATION_VALUE on tier "${tierId}"; remaining annotations skipped`, match[1]);
        break;
      }
      const rawValue = tierContent.slice(annotationPattern.lastIndex, close);
      annotationPattern.lastIndex = close + closing.length;
      annotations.push(parseTierAnnotation(match, rawValue, tierId, context));
    }
    return annotations;
  };
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
  tree: Map<number, number>;
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
    tree: new Map(),
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
    if (values.at(middle)! < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function updateEndSearch(search: EndSearch, end: number, index: number): void {
  let position = search.treeSize + search.endIndex.get(end)!;
  search.tree.set(position, Math.min(search.tree.get(position) ?? Infinity, index));
  while (position > 1) {
    position = Math.floor(position / 2);
    search.tree.set(
      position,
      Math.min(
        search.tree.get(position * 2) ?? Infinity,
        search.tree.get(position * 2 + 1) ?? Infinity,
      ),
    );
  }
}

function firstEndingAtOrAfter(search: EndSearch, end: number): number | undefined {
  let left = search.treeSize + lowerBound(search.ends, end);
  let right = search.treeSize + search.ends.length;
  let first = Infinity;
  while (left < right) {
    if (left % 2 === 1) {
      first = Math.min(first, search.tree.get(left++) ?? Infinity);
    }
    if (right % 2 === 1) {
      first = Math.min(first, search.tree.get(--right) ?? Infinity);
    }
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
  let next = regions.at(cursor);
  while (next && next.region.startMs <= commentStartMs) {
    updateEndSearch(search, next.region.endMs, next.index);
    cursor += 1;
    next = regions.at(cursor);
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
  return commentAnnotations.flatMap((comment, originalIndex) => {
    if (!comment.value.trim()) return [];
    const { authorId, body } = parseCommentValue(comment.value);
    const exact = exactRegions.get(`${comment.startMs}:${comment.endMs}`);
    const overlapIndex = overlaps.get(originalIndex);
    const region = exact ?? (overlapIndex === undefined ? undefined : regions.at(overlapIndex));
    if (!region) {
      pushWarning(warnings, "ORPHAN_COMMENT", "comment has no matching region; comment dropped", comment.id);
      return [];
    }
    return [{ id: comment.id, regionId: region.id, authorId, body, resolved: false }];
  });
}

/** Keep non-empty, positive-length regions with unique ids; drop and warn otherwise. */
function projectEafRegions(
  annotations: ParsedAnnotation[],
  warnings: ImportWarning[],
): ImportRegionsResult["regions"] {
  const rawIds = new Set(annotations.map((annotation) => annotation.id));
  const used = new Set<string>();
  const regions: ImportRegionsResult["regions"] = [];
  for (const annotation of annotations) {
    if (!annotation.value.trim()) continue;
    if (annotation.endMs <= annotation.startMs) {
      pushWarning(warnings, "REGION_DROPPED", "region dropped: end time is not after start time", annotation.id);
      continue;
    }
    const rewritten = annotation.id.replace(/^a-reg-/, "r-") || annotation.id;
    const id = rawIds.has(rewritten) ? annotation.id : rewritten;
    if (used.has(id)) {
      pushWarning(warnings, "REGION_DROPPED", `region dropped: duplicate region id "${id}"`, annotation.id);
      continue;
    }
    used.add(id);
    regions.push({ id, startMs: annotation.startMs, endMs: annotation.endMs, label: annotation.value });
  }
  return regions;
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
  const regions = projectEafRegions(parseTier("regions"), warnings);
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
