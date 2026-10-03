/** Documented lossiness of Motif → laban-subset map (literacy ladder). */
export const MOTIF_TO_SUBSET_LOSSINESS = [
    "Effort symbols (effort_strong/light) collapse to level high/low without full Effort graph",
    "Phrase markers become stillness on body column - no phrasing barline model",
    "Locomotion walk/run alternate support columns; travel maps to path (shape still simplified)",
    "No floor plan / stage geography",
    "Multi-limb simultaneity approximated via simultaneousGroup + column; not full Laban staff density",
    "Not professional Labanotation density; not LabanWriter visual parity",
];
function mapMotifSymbol(symbol, options = {}) {
    const fixed = motifFixedMapping(symbol);
    if (fixed)
        return fixed;
    if (symbol.startsWith("gesture"))
        return gestureMotifMapping(symbol);
    if (["jump", "fall", "rise"].includes(symbol))
        return levelChangeMotifMapping(symbol);
    if (symbol === "travel")
        return travelMotifMapping();
    return locomotionMotifMapping(symbol, options.supportIndex);
}
/** Map a gesture token to its pedagogical limb column. */
function gestureMotifMapping(symbol) {
    const warnings = [];
    return { kind: "gesture", column: symbol.includes("leg") ? "leg_right" : "arm_right", direction: "place", level: "middle", warnings };
}
/** Map vertical-level support tokens and retain their documented loss warning. */
function levelChangeMotifMapping(symbol) {
    return { kind: "support", column: "support_right", direction: "place", level: symbol === "fall" ? "low" : "high", warnings: [`${symbol} → support level change only`] };
}
/** Map travel to the lossy forward path representation. */
function travelMotifMapping() {
    return { kind: "path", column: "body", direction: "forward", level: "middle", warnings: ["travel → path/forward (detailed path shape discarded)"] };
}
/** Map walk/run/default tokens while alternating support columns. */
function locomotionMotifMapping(symbol, supportIndex = 0) {
    const supportColumn = supportIndex % 2 === 0 ? "support_right" : "support_left";
    return {
        kind: "support",
        column: supportColumn,
        direction: "forward",
        level: "middle",
        warnings: symbol === "run" ? [`${symbol} → support/forward (path discarded)`] : [],
    };
}
/** Map Motif tokens whose result is independent of alternating support state. */
function motifFixedMapping(symbol) {
    const mappings = new Map([
        ["effort_strong", { kind: "level", column: "body", direction: "place", level: "high", warnings: ["effort_strong → level high (lossy)"] }],
        ["effort_light", { kind: "level", column: "body", direction: "place", level: "low", warnings: ["effort_light → level low (lossy)"] }],
        ["phrase_begin", { kind: "stillness", column: "body", direction: "place", level: "middle", warnings: ["phrase_begin → stillness (no phrasing barline)"] }],
        ["phrase_end", { kind: "stillness", column: "body", direction: "place", level: "middle", warnings: ["phrase_end → stillness (no phrasing barline)"] }],
        ["turn", { kind: "turn", column: "body", direction: "right", level: "middle", warnings: [] }],
        ["twist", { kind: "turn", column: "body", direction: "left", level: "middle", warnings: [] }],
        ["stillness", { kind: "stillness", column: "body", direction: "place", level: "middle", warnings: [] }],
        ["balance", { kind: "stillness", column: "body", direction: "place", level: "middle", warnings: [] }],
    ]);
    return mappings.get(symbol);
}
/**
 * Best-effort Motif → laban-subset map (literacy ladder; lossy by design).
 * See MOTIF_TO_SUBSET_LOSSINESS and migrationProvenance.warnings.
 *
 * Items that land in the same measure share a `simultaneousGroup` so multi-column
 * reading is possible without claiming professional Laban density.
 */
export function motifToLabanSubset(doc) {
    const measureCount = Math.max(1, Math.ceil(doc.items.length / 2));
    const measures = Array.from({ length: measureCount }, (_, index) => ({
        id: `m${index}`,
        index,
        beats: 4,
    }));
    const allWarnings = [...MOTIF_TO_SUBSET_LOSSINESS];
    let supportIndex = 0;
    const symbols = doc.items.map((item, i) => {
        const measureIndex = Math.min(Math.floor(i / 2), measures.length - 1);
        const measureId = measures[measureIndex].id;
        const isSupportLike = item.symbol === "walk" ||
            item.symbol === "run" ||
            item.symbol === "jump" ||
            item.symbol === "fall" ||
            item.symbol === "rise";
        const mapped = mapMotifSymbol(item.symbol, {
            supportIndex: isSupportLike ? supportIndex++ : undefined,
        });
        allWarnings.push(...mapped.warnings.map((w) => `${item.id}: ${w}`));
        const beatOffset = (i % 2) * 2;
        return {
            id: item.id,
            kind: mapped.kind,
            column: mapped.column,
            measureId,
            direction: mapped.direction,
            level: mapped.level,
            durationBeats: 2,
            beatOffset,
            simultaneousGroup: `g-m${measureIndex}`,
            motifSymbol: item.symbol,
            timeAnchor: item.timeAnchor,
        };
    });
    const columns = [
        ...new Set([
            "support_left",
            "support_right",
            "leg_right",
            "arm_right",
            "body",
            ...symbols.map((s) => s.column),
        ]),
    ];
    return {
        schemaVersion: "0.2.0",
        profile: "mvei-laban-subset",
        id: `${doc.id}-laban-subset`,
        title: doc.title ? `${doc.title} (laban-subset)` : undefined,
        completeness: doc.completeness === "complete" ? "partial" : doc.completeness,
        staff: { columns },
        measures,
        symbols,
        annotationLinks: doc.annotationLinks,
        musicCoTimeline: doc.musicCoTimeline,
        migrationProvenance: {
            source: "motif-map",
            warnings: [...new Set(allWarnings)],
        },
    };
}
