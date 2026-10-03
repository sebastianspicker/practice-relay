/** Render the local package manifest with DOM nodes instead of parsed HTML. */
import { label } from "../data/workspace-record.mjs";

/** Replace a manifest list with the record's included artifacts in source order. */
export function renderPackageManifest(document, manifest, record) {
  const fragment = document.createDocumentFragment();

  for (const artifact of record.artifacts) {
    if (!record.includedIds.includes(String(artifact.id))) continue;

    const item = document.createElement("li");
    const artifactLabel = document.createElement("span");
    const artifactId = document.createElement("code");

    artifactLabel.textContent = label(artifact, "Evidence item");
    artifactId.textContent = String(artifact.id);
    item.append(artifactLabel, artifactId);
    fragment.append(item);
  }

  manifest.replaceChildren(fragment);
}
