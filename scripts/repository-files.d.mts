/** Type declarations for contained repository file access in TypeScript scripts. */

/** Resolved repository path metadata. */
export interface ResolvedRepositoryPath {
  absolute: string;
  info: import("node:fs").Stats;
}

/** Resolve an existing repository path without crossing protected or symlink boundaries. */
export function resolveExistingRepositoryPath(
  root: string,
  candidate: string,
): ResolvedRepositoryPath;

/** Return whether a repository path exists and passes the no-read boundary. */
export function hasSafeRepositoryPath(root: string, candidate: string): boolean;

/** Read one contained regular text file after validating its complete path. */
export function readRepositoryText(root: string, candidate: string): string;
