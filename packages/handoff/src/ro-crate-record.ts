/**
 * Minimal RO-Crate 1.3 read/write transport for complete WorkRecord documents.
 *
 * The domain owns WorkRecord validation. This handoff boundary owns only the
 * file layout and RO-Crate serialization required for portable transport.
 */
import { parseWorkRecord, type WorkRecord } from "@practice-relay/work-record";

/** Complete in-memory RO-Crate file map for one WorkRecord. */
export interface RoCratePackage {
  files: Record<string, string>;
}

/** Write a complete WorkRecord with its RO-Crate 1.3 descriptor. */
export function writeRoCrate13(record: WorkRecord): RoCratePackage {
  const canonical = parseWorkRecord(record);
  const descriptor = {
    "@id": "ro-crate-metadata.json",
    "@type": "CreativeWork",
    conformsTo: "https://w3id.org/ro/crate/1.3",
    about: { "@id": "./" },
  };
  const root = {
    "@id": "./",
    "@type": "Dataset",
    name: canonical.title,
    conformsTo: "https://w3id.org/ro/crate/1.3",
    mainEntity: { "@id": "work-record.json" },
  };
  return {
    files: {
      "work-record.json": JSON.stringify(canonical, null, 2),
      "ro-crate-metadata.json": JSON.stringify(
        {
          "@context": "https://w3id.org/ro/crate/1.3/context",
          "@graph": [descriptor, root],
        },
        null,
        2,
      ),
    },
  };
}

/** Read and structurally validate the complete WorkRecord transport package. */
export function readRoCrate13(pkg: RoCratePackage): WorkRecord {
  const metadata = parseJson(pkg.files["ro-crate-metadata.json"], "ro-crate-metadata.json") as {
    "@graph"?: Array<Record<string, unknown>>;
  };
  const graph = metadata["@graph"];
  const hasDescriptor =
    Array.isArray(graph) &&
    graph.some(
      (node) =>
        node["@id"] === "ro-crate-metadata.json" &&
        node.conformsTo === "https://w3id.org/ro/crate/1.3",
    );
  const hasRoot =
    Array.isArray(graph) &&
    graph.some(
      (node) =>
        node["@id"] === "./" &&
        node.conformsTo === "https://w3id.org/ro/crate/1.3" &&
        (node.mainEntity as { "@id"?: unknown } | undefined)?.["@id"] ===
          "work-record.json",
    );
  if (!hasDescriptor || !hasRoot) {
    throw new Error("RO-Crate 1.3 metadata descriptor is missing");
  }
  return parseWorkRecord(parseJson(pkg.files["work-record.json"], "work-record.json"));
}

function parseJson(value: string | undefined, path: string): unknown {
  if (typeof value !== "string") throw new Error(`${path} is missing`);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${path} is not valid JSON`);
  }
}
