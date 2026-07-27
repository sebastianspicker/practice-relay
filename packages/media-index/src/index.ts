/**
 * @practice-relay/media-index - take and media identity for Practice Relay and WorkRecord packages.
 *
 * Why: process archive needs multiple takes plus a preferred take, separate
 * from the UI player. The schema lives under ./schemas for Practice Relay and MvEI consumers.
 */

export const PACKAGE = "@practice-relay/media-index";
export const SCHEMA_VERSION = "0.1.0";

/**
 * One media take (e.g. studio run). `consentId` links purpose-tagged consent
 * when export filtering is applied.
 */
export interface Take {
  id: string;
  label?: string;
  mediaPath?: string;
  recordedAt?: string;
  consentId?: string;
}

/**
 * Construct a take with required id; merge optional fields from opts.
 * `id` always wins over opts.id so callers cannot accidentally diverge.
 */
export function createTake(id: string, opts?: Partial<Take>): Take {
  return { ...opts, id };
}
