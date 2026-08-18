/**
 * @practice-relay/work-record-package - public package facade.
 *
 * The package entrypoint remains intentionally stable while implementation
 * concerns are kept in focused internal modules.
 */

export {
  RO_CRATE_CONFORMS_TO,
  RO_CRATE_CONTEXT,
  RO_CRATE_METADATA_PATH,
  WORK_RECORD_PACKAGE_PROFILE_URI,
} from "./package-constants.ts";
export {
  buildWorkRecordPackageManifest,
} from "./manifest.ts";
export {
  validateWorkRecordPackageManifest,
} from "./manifest-validation.ts";
export {
  buildRoCrateMetadata,
  validateRoCrateMetadata,
} from "./ro-crate.ts";
export {
  exportWorkRecordPackage,
  exportWorkRecordPackageZip,
} from "./package-export.ts";
export type {
  BuildWorkRecordPackageOptions,
  PackageFileEntry,
  RoCrateMetadata,
  WorkRecordPackageExport,
  WorkRecordPackageManifest,
} from "./package-types.ts";
export { buildStoreZip } from "./zip.ts";
