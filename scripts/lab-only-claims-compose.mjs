/** Compose-specific local-only and fail-closed hardening assertions. */
import { readRepositoryText } from "./repository-files.mjs";

function assertRequiredMarkers({ relPath, text, markers, markerType, errors }) {
  for (const marker of markers) {
    if (!text.includes(marker)) errors.push(`${relPath} missing ${markerType}: ${marker}`);
  }
}

function assertLoopbackPorts({ relPath, text, ports, errors }) {
  for (const port of ports) {
    if (new RegExp(`^[\\t ]*- ["']?${port}:${port}["']?\\s*$`, "m").test(text)) {
      errors.push(`${relPath} publishes ${port} on all host interfaces`);
    }
  }
}

function assertCampusLabHardening({ repositoryRoot, errors, hardening }) {
  const { relPath, required, ports, forbidden } = hardening;
  const text = readRepositoryText(repositoryRoot, relPath);
  assertRequiredMarkers({
    relPath,
    text,
    markers: required,
    markerType: "campus-lab hardening marker",
    errors,
  });
  assertLoopbackPorts({ relPath, text, ports, errors });
  for (const marker of forbidden) {
    if (text.includes(marker)) errors.push(`${relPath} retains a fixed or fallback credential: ${marker}`);
  }
  if (!/entrypoint:\s*\["\/bin\/sh",\s*"-ec"\]\s*\n\s*command:\s*\n\s*- \|/.test(text)) {
    errors.push(`${relPath} must pass the guarded MinIO script as one argv item`);
  }
}

function assertProductionLabHardening({ repositoryRoot, errors, hardening }) {
  const { relPath, required, ports } = hardening;
  const text = readRepositoryText(repositoryRoot, relPath);
  assertRequiredMarkers({
    relPath,
    text,
    markers: required,
    markerType: "production-lab hardening marker",
    errors,
  });
  assertLoopbackPorts({ relPath, text, ports, errors });
  const placeholderGuards = text.match(/refusing placeholder or default production-lab/g)?.length ?? 0;
  if (placeholderGuards < 2) {
    errors.push(`${relPath} must guard MinIO server and bucket initialization secrets`);
  }
  const singleCommandArrays = text.match(/entrypoint:\s*\["\/bin\/sh",\s*"-ec"\]\s*\n\s*command:\s*\n\s*- \|/g)?.length ?? 0;
  if (singleCommandArrays < 2) {
    errors.push(`${relPath} must pass both guarded shell scripts as one argv item`);
  }
}

/** Assert all compose-specific hardening policies in their original order. */
export function assertLabComposeHardening({ repositoryRoot, errors, campusHardening, productionHardening }) {
  assertCampusLabHardening({ repositoryRoot, errors, hardening: campusHardening });
  assertProductionLabHardening({ repositoryRoot, errors, hardening: productionHardening });
}
