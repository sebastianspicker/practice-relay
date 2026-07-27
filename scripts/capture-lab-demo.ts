/**
 * Synthetic capture-bridge demo.
 * Why: exercises landmarks-to-MvEI conversion without presenting fixture data
 * as a participant capture or implemented browser workflow.
 */
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  landmarksToAnnotation,
  annotationToMotifSketch,
  type LandmarkDocument,
  type AnnotationV0Like,
} from "../mvei/packages/capture-bridge/src/index.ts";
import {
  ensureContainedOutputDirectory,
  readContainedText,
  writeContainedText,
} from "./contained-output.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXTERNAL_LANDMARKS_SOURCE = "external landmarks input";

/** Label a landmarks input without exposing an absolute local filesystem path. */
function landmarksSourceLabel(landmarksPath: string): string {
  const relativePath = relative(repoRoot, resolve(landmarksPath));
  if (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath)
  ) {
    return relativePath.replaceAll("\\", "/");
  }
  return EXTERNAL_LANDMARKS_SOURCE;
}

/** Outputs from the synthetic capture-to-MvEI fixture conversion. */
export type CaptureLabResult = {
  annotation: AnnotationV0Like;
  motifSketch: ReturnType<typeof annotationToMotifSketch>;
  outDir: string;
  files: string[];
};

/**
 * Convert a landmarks document and write inspectable synthetic demo artifacts.
 */
export function runCaptureLabDemo(opts: {
  landmarksPath?: string;
  outDir?: string;
} = {}): CaptureLabResult {
  const landmarksPath =
    opts.landmarksPath ??
    join(
      repoRoot,
      "mvei/packages/capture-bridge/fixtures/landmarks-sample.json",
    );
  const requestedOutDir =
    opts.outDir ??
    join(repoRoot, "test-results/generated-fixtures/capture-lab");

  const doc = JSON.parse(
    readContainedText(repoRoot, landmarksPath),
  ) as LandmarkDocument;

  const annotation = landmarksToAnnotation(doc);
  const motifSketch = annotationToMotifSketch(annotation);

  const outDir = ensureContainedOutputDirectory(repoRoot, requestedOutDir);

  const packageNotes = {
    schemaVersion: "0.2.0",
    kind: "capture-lab-package-notes",
    workRecordHint: "ps-demo-week6-duet",
    technicalGuide: "docs/pilot-pack/capture-lab.md",
    studyGuide: "docs/pilot-pack/README.md",
    steps: [
      "Associate the synthetic media and annotation references with a WorkRecord through the domain or API path.",
      "Treat movement_annotation.json as sketch-quality derived analysis.",
      "Open motif-sketch.json in MvEI Workbench for human review.",
      "Exercise purpose-bound export through the API and package tests; the browser controls do not submit it.",
    ],
    residualHonesty:
      "External capture input only. Motif output is sketch quality, not full Labanotation. Products stay separate.",
    fixtureNotes: {
      purpose: "Synthetic conversion artifacts for repository validation; not participant or pilot evidence",
      files: [
        "movement_annotation.json",
        "motif-sketch.json",
        "package-notes.json",
      ],
      attachOrder: [
        "synthetic media reference",
        "movement_annotation peer",
        "MvEI Workbench Motif reference",
        "purpose-bound package export through tested code paths",
      ],
    },
    sources: {
      landmarks: landmarksSourceLabel(landmarksPath),
      captureBridge: "@practice-relay/mvei-capture-bridge",
    },
  };

  const files = [
    "movement_annotation.json",
    "motif-sketch.json",
    "package-notes.json",
  ] as const;

  writeContainedText(
    repoRoot,
    join(outDir, "movement_annotation.json"),
    JSON.stringify(annotation, null, 2) + "\n",
  );
  writeContainedText(
    repoRoot,
    join(outDir, "motif-sketch.json"),
    JSON.stringify(motifSketch, null, 2) + "\n",
  );
  writeContainedText(
    repoRoot,
    join(outDir, "package-notes.json"),
    JSON.stringify(packageNotes, null, 2) + "\n",
  );

  return {
    annotation,
    motifSketch,
    outDir,
    files: [...files],
  };
}

function parseOutArg(argv: string[]): string | undefined {
  const i = argv.indexOf("--out");
  if (i >= 0 && argv[i + 1]) return resolve(argv[i + 1]!);
  return undefined;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = runCaptureLabDemo({ outDir: parseOutArg(process.argv) });
  console.log(
    JSON.stringify(
      {
        ok: true,
        outDir: result.outDir,
        files: result.files,
        events: result.annotation.events.length,
        motifItems: result.motifSketch.items.length,
        annotationKind: result.annotation.kind,
        motifProfile: result.motifSketch.profile,
      },
      null,
      2,
    ),
  );
}
