/** Public type contracts for the work-record package facade. */

/** Options for buildWorkRecordPackageManifest / exportWorkRecordPackage. */
export type BuildWorkRecordPackageOptions = {
  preferredTakeId?: string | null;
  consentAllTagged?: boolean;
  purposes?: string[];
  /**
   * When true (default), refuse export without exportable consent.
   * Demo routes may pass false only if consent is still stamped on the manifest.
   */
  requireConsent?: boolean;
};

/** work-record-package convenience manifest produced for teaching/archive packages. */
export type WorkRecordPackageManifest = {
  schemaVersion: string;
  profile: string;
  workRecordId: string;
  title: string;
  createdAt: string;
  preferredTakeId: string | null;
  tracks: {
    id: string;
    type: string;
    label?: string;
    ref?: string;
  }[];
  takes: { id: string; label?: string; mediaPath?: string }[];
  consentSummary: {
    allTagged: boolean;
    purposes: string[];
    exportFiltered: boolean;
  };
  musicxmlRef: string | null;
  mveiRef: string | null;
  files: { path: string; role: string; sha256?: string }[];
};

/**
 * RO-Crate 1.3 JSON-LD graph covering the same work identity as the work-record package
 * convenience manifest (profile, tracks, takes, consent, mvei/music refs).
 */
export type RoCrateMetadata = {
  "@context": string;
  "@graph": Record<string, unknown>[];
};

/** Optional binary file to embed in the package zip. */
export type PackageFileEntry = {
  path: string;
  bytes: Buffer;
};

/** Full package produced by exportWorkRecordPackage. */
export type WorkRecordPackageExport = {
  manifest: WorkRecordPackageManifest;
  /** RO-Crate 1.3 metadata file body (`ro-crate-metadata.json`). */
  roCrateMetadata: RoCrateMetadata;
  validated: true;
  /** ZIP bytes when requested via exportWorkRecordPackageZip / includeZip. */
  zipBytes?: Buffer;
};
