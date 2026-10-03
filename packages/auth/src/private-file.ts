/** Read configured credentials only from a stable, private regular file. */
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  type Stats,
} from "node:fs";

const privateFileError = "configured auth users file must be a private regular file";

function assertPrivateRegularFile(stats: Stats): void {
  if (
    stats.isSymbolicLink() ||
    !stats.isFile() ||
    stats.nlink !== 1 ||
    (stats.mode & 0o077) !== 0
  ) {
    throw new Error(privateFileError);
  }
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

/** Reject symlinks, hardlinks, permissive modes, and replacement races. */
export function readPrivateRegularFile(filePath: string): string {
  const expected = lstatSync(filePath);
  assertPrivateRegularFile(expected);
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  const descriptor = openSync(filePath, constants.O_RDONLY | noFollow);
  try {
    const opened = fstatSync(descriptor);
    assertPrivateRegularFile(opened);
    const current = lstatSync(filePath);
    assertPrivateRegularFile(current);
    if (!sameFile(expected, opened) || !sameFile(opened, current)) {
      throw new Error("configured auth users file changed while opening");
    }
    return readFileSync(descriptor, "utf8");
  } finally {
    closeSync(descriptor);
  }
}
