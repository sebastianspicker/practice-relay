/**
 * Pedagogical MvEI Motif SVG glyph set; not LabanWriter parity.
 */
export const GLYPH_FONT_STATUS = "mvp-svg" as const;

/** Simple path/shape templates keyed by Motif vocabulary id. */
const GLYPHS: Record<string, { viewBox: string; paths: string[]; label: string }> = {
  walk: {
    viewBox: "0 0 24 24",
    paths: [
      "M8 20 L10 8 L12 14 L14 8 L16 20",
      "M10 8 L14 8",
      "M9 20 L7 22",
      "M15 20 L17 22",
      "M11 4 L13 4",
    ],
    label: "Walk",
  },
  run: {
    viewBox: "0 0 24 24",
    paths: [
      "M6 20 L10 6 L14 16 L18 4",
      "M9 10 L15 8",
      "M5 18 L7 22",
      "M17 6 L20 5",
    ],
    label: "Run",
  },
  turn: {
    viewBox: "0 0 24 24",
    paths: [
      "M12 4 A8 8 0 1 1 11.9 4",
      "M12 4 L15 7 M12 4 L9 7",
      "M12 12 L12 16",
    ],
    label: "Turn",
  },
  stillness: {
    viewBox: "0 0 24 24",
    paths: ["M12 4 L12 20", "M8 12 L16 12", "M9 8 L15 8", "M9 16 L15 16"],
    label: "Stillness",
  },
  gesture_arm: {
    viewBox: "0 0 24 24",
    paths: [
      "M6 18 L12 6 L18 12",
      "M12 6 L12 20",
      "M18 12 L20 10",
      "M6 18 L4 16",
    ],
    label: "Arm gesture",
  },
  gesture_leg: {
    viewBox: "0 0 24 24",
    paths: [
      "M10 4 L10 14 L6 22",
      "M10 14 L16 22",
      "M10 4 L14 6",
      "M6 22 L4 22",
    ],
    label: "Leg gesture",
  },
  travel: {
    viewBox: "0 0 24 24",
    paths: [
      "M4 12 L20 12",
      "M16 8 L20 12 L16 16",
      "M4 10 L4 14",
      "M8 10 L8 14",
    ],
    label: "Travel",
  },
  jump: {
    viewBox: "0 0 24 24",
    paths: [
      "M8 20 L12 6 L16 20",
      "M6 10 L18 10",
      "M10 6 L12 3 L14 6",
      "M9 20 L7 22 M15 20 L17 22",
    ],
    label: "Jump",
  },
  fall: {
    viewBox: "0 0 24 24",
    paths: ["M8 4 L16 4 L12 20 Z", "M6 6 L4 8", "M18 6 L20 8"],
    label: "Fall",
  },
  rise: {
    viewBox: "0 0 24 24",
    paths: ["M8 20 L16 20 L12 4 Z", "M6 18 L4 16", "M18 18 L20 16"],
    label: "Rise",
  },
  twist: {
    viewBox: "0 0 24 24",
    paths: [
      "M8 6 Q12 12 8 18",
      "M16 6 Q12 12 16 18",
      "M10 12 L14 12",
      "M12 4 L12 6",
    ],
    label: "Twist",
  },
  balance: {
    viewBox: "0 0 24 24",
    paths: [
      "M4 18 L20 18",
      "M12 4 L12 18",
      "M8 10 L16 10",
      "M6 18 L6 20 M18 18 L18 20",
    ],
    label: "Balance",
  },
  effort_strong: {
    viewBox: "0 0 24 24",
    paths: [
      "M6 6 L18 6 L18 18 L6 18 Z",
      "M9 9 L15 15 M15 9 L9 15",
      "M8 8 L8 10 M16 8 L16 10",
    ],
    label: "Strong",
  },
  effort_light: {
    viewBox: "0 0 24 24",
    paths: [
      "M12 4 A8 8 0 1 0 12 20 A8 8 0 1 0 12 4",
      "M12 8 A4 4 0 1 0 12 16 A4 4 0 1 0 12 8",
    ],
    label: "Light",
  },
  phrase_begin: {
    viewBox: "0 0 24 24",
    paths: [
      "M6 4 L6 20",
      "M6 4 L14 4",
      "M6 20 L14 20",
      "M8 8 L8 16",
    ],
    label: "Phrase begin",
  },
  phrase_end: {
    viewBox: "0 0 24 24",
    paths: [
      "M18 4 L18 20",
      "M10 4 L18 4",
      "M10 20 L18 20",
      "M16 8 L16 16",
    ],
    label: "Phrase end",
  },
};

/** List the Motif vocabulary identifiers supported by the bundled glyph set. */
export function listGlyphIds(): string[] {
  return Object.keys(GLYPHS);
}

/** Get a bundled glyph or a labelled fallback for an unknown Motif symbol. */
export function getGlyph(symbol: string) {
  return GLYPHS[symbol] ?? {
    viewBox: "0 0 24 24",
    paths: ["M4 4 L20 20 M20 4 L4 20"],
    label: symbol,
  };
}

/** Render one Motif symbol as standalone SVG markup. */
export function renderGlyphSvg(
  symbol: string,
  opts: { size?: number; stroke?: string } = {},
): string {
  const g = getGlyph(symbol);
  const size = safePositiveNumber(opts.size ?? 48, "size");
  const stroke = escapeXml(opts.stroke ?? "#1a1a1a");
  const paths = g.paths
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${g.viewBox}" role="img" aria-label="${escapeXml(g.label)}">${paths}</svg>`;
}

/** Escape a value before inserting it into SVG XML text or an attribute. */
function escapeXml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Ensure dimensions cannot produce invalid SVG geometry. */
function safePositiveNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${name} must be a finite positive number`);
  }
  return value;
}
