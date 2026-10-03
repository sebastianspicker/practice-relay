/**
 * Practice Relay status and action copy constants.
 * Why residual: maturity gates and Quiet Dossier surfaces require exact phrases
 * that must not drift across render paths or product renames.
 */

/** Primary package/export action label required by web-shell maturity gates. */
export const PREPARE_EXPORT = "Prepare export";

/** Empty-collection copy; substring "No work records" is required by maturity gates. */
export const NO_WORK_RECORDS = "No work records match this filter.";

/** Empty service response when the record collection is reachable but vacant. */
export const NO_WORK_RECORDS_YET = "No work records yet. Refresh when the record service is reachable.";

/** Explicit local-demo status phrase required by maturity gates. */
export const LOCAL_EXAMPLE = "Showing an explicit local example";

/** Compact local-fallback note used when the API fails mid-load. */
export const LOCAL_EXAMPLE_NO_REMOTE = "Local example · no remote record changed.";

/** Initial loading status for the work-record index. */
export const LOADING = "Loading work records…";

/** Quiet Dossier primary hold action before seal. */
export const REVIEW_CONDITION = "Review condition";

/** Package review CTA used on the handoff panel. */
export const REVIEW_PACKAGE = "Review package";

/** Assessment destination line shared by header and relay path. */
export const DESTINATION = "Faculty assessment · Studio Practice 2";

/** Quiet Dossier footnote: source systems remain authoritative. */
export const SOURCE_SYSTEMS_FOOTNOTE =
  "Source systems stay authoritative. This record only carries selection, version, and permitted uses.";

/** Alpha-scope note for local-only snapshot/export/review controls. */
export const ALPHA_LOCAL_ONLY =
  "Snapshot, export, and review controls remain local-only in this alpha.";

/** Generic local-inspection status when no remote change is made. */
export const LOCAL_INSPECTION_ONLY = "Local inspection only · no remote record changed.";
