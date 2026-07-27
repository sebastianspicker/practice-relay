/** Type surface for the contained fixture-generator I/O boundary. */

/** Read a contained text input after rejecting every symlink component. */
export function readContainedText(root: string, candidate: string): string;

/** Return whether a fixed input exists and satisfies the complete read boundary. */
export function hasContainedPath(root: string, candidate: string): boolean;

/** Create or reuse one contained output directory after validating its parents. */
export function ensureContainedOutputDirectory(
  root: string,
  candidate: string,
): string;

/** Write one contained text file after validating its directory and target. */
export function writeContainedText(
  root: string,
  candidate: string,
  contents: string,
): string;
