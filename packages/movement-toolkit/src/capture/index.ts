/**
 * Capture consume bridge - landmark JSON → movement_annotation events.
 * Does not rebuild FreeMoCap/OpenCap; consumes exported landmarks only.
 */

/** One timestamped set of capture-space landmark coordinates. */
export interface LandmarkFrame {
  tMs: number;
  points: Array<{ name: string; x: number; y: number; z?: number; conf?: number }>;
}

/** Imported landmark sequence kept separate from symbolic MvEI authoring data. */
export interface LandmarkDocument {
  schemaVersion: "0.2.0-landmarks";
  source: "opencap" | "mediapipe" | "pose2sim" | "other";
  id: string;
  frames: LandmarkFrame[];
}

/** Shape compatible with movement-annotation-v0.schema.json */
export interface AnnotationV0Like {
  schemaVersion: "0.1.0";
  kind: "movement_annotation";
  events: Array<{
    id: string;
    regionId: string;
    label: string;
    source: "plugin_pose";
    quality: "sketch";
    notes?: string;
    bodySegment?: string;
  }>;
}

/**
 * Downsample landmark frames into coarse movement_annotation events.
 */
export function landmarksToAnnotation(
  doc: LandmarkDocument,
): AnnotationV0Like {
  const events: AnnotationV0Like["events"] = [];
  const regionCounts = new Map<string, number>();
  for (let i = 1; i < doc.frames.length; i++) {
    const prev = doc.frames[i - 1]!;
    const cur = doc.frames[i]!;
    const curByName = new Map(cur.points.map((point) => [point.name, point]));
    let dist = 0;
    let n = 0;
    for (const a of prev.points) {
      const b = curByName.get(a.name);
      if (!b || ![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue;
      dist += Math.hypot(b.x - a.x, b.y - a.y);
      n++;
    }
    const mean = n ? dist / n : 0;
    const label = mean > 0.05 ? "travel" : "stillness";
    const regionBase = `reg-t${cur.tMs}`;
    const regionCount = (regionCounts.get(regionBase) ?? 0) + 1;
    regionCounts.set(regionBase, regionCount);
    events.push({
      id: `ev-${i}`,
      regionId: regionCount === 1 ? regionBase : `${regionBase}-${regionCount}`,
      label,
      source: "plugin_pose",
      quality: "sketch",
      notes: `auto from ${doc.source} landmarks tMs=${cur.tMs} meanΔ=${mean.toFixed(4)}`,
      bodySegment: "full",
    });
  }

  return {
    schemaVersion: "0.1.0",
    kind: "movement_annotation",
    events,
  };
}

/** Suggest Motif sketch symbols from annotation labels. */
export function annotationToMotifSketch(ann: AnnotationV0Like): {
  profile: "mvei-motif";
  schemaVersion: "0.2.0";
  id: string;
  completeness: "sketch";
  items: Array<{
    id: string;
    symbol: string;
    order: number;
  }>;
} {
  const map: Record<string, string> = {
    travel: "travel",
    stillness: "stillness",
    walk: "walk",
  };
  return {
    profile: "mvei-motif",
    schemaVersion: "0.2.0",
    id: `motif-from-capture`,
    completeness: "sketch",
    items: ann.events.map((e, order) => ({
      id: e.id,
      symbol: map[e.label] ?? "stillness",
      order,
    })),
  };
}
