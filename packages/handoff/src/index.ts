/**
 * @practice-relay/handoff - portable WorkRecord handoff facade.
 *
 * Use ./package for integrity-preserving package construction and
 * ./projections for explicitly lossy interoperability projections.
 */
export {
  buildWorkRecordPackageManifest,
  exportWorkRecordPackage,
  exportWorkRecordPackageZip,
  validateWorkRecordPackageManifest,
} from "./integrity/index.ts";
export {
  describeExport,
  exportRecord,
  importEafToRecordParts,
  importOtioToRecordParts,
} from "./projections/index.ts";
export {
  readRoCrate13,
  writeEvidenceRoCrate13,
  writeRoCrate13,
} from "./ro-crate.ts";
export type {
  ExportFormat,
  ExportLoss,
  ExportLossCode,
  ExportOmittedField,
  ExportRequest,
  ExportResult,
} from "./projections/index.ts";
export type {
  BuildWorkRecordPackageOptions,
  WorkRecordPackageExport,
  WorkRecordPackageManifest,
} from "./integrity/index.ts";
export type { RoCratePackage } from "./ro-crate.ts";
