/** Bundled movement examples and canonical profile metadata. */
import labanSubsetSchema from "../schemas/mvei-laban-subset.schema.json" with { type: "json" };
import motifSchema from "../schemas/mvei-motif.schema.json" with { type: "json" };
import movementAnnotationSchema from "../schemas/movement-annotation-v0.schema.json" with { type: "json" };
import labanSubsetCorpus from "../fixtures/corpus/laban-subset-04.json" with { type: "json" };
import motifPartialCorpus from "../fixtures/corpus/motif-partial-02.json" with { type: "json" };
import motifSketchCorpus from "../fixtures/corpus/motif-sketch-01.json" with { type: "json" };
import workbenchDemoCorpus from "../fixtures/corpus/workbench-demo.json" with { type: "json" };
import corpusIndex from "../fixtures/corpus/index.json" with { type: "json" };
/**
 * Curated browser parser examples. The full corpus catalogue is
 * MOVEMENT_CORPUS_INDEX below and remains authored only in index.json.
 */
export const MOVEMENT_CORPUS = Object.freeze({
  motifSketch: motifSketchCorpus,
  motifPartial: motifPartialCorpus,
  workbenchDemo: workbenchDemoCorpus,
  labanSubset04: labanSubsetCorpus,
});

/** The packaged corpus catalogue, sourced from fixtures/corpus/index.json. */
export const MOVEMENT_CORPUS_INDEX = Object.freeze(corpusIndex);

/** Browser-readable profile metadata derived from the canonical schemas. */
export const MOVEMENT_PROFILE_SUMMARIES = Object.freeze([
  summarizeProfile(motifSchema, "profile"),
  summarizeProfile(labanSubsetSchema, "profile"),
  summarizeProfile(movementAnnotationSchema, "kind"),
]);

function summarizeProfile(schema, identifierProperty) {
  const versionSchema = schema.properties?.schemaVersion;
  return Object.freeze({
    id: schema.properties?.[identifierProperty]?.const,
    status: versionSchema?.const ?? versionSchema?.enum?.at(-1) ?? "unversioned",
    description: schema.description ?? schema.title,
  });
}

