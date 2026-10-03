/** Bounded asynchronous scrypt work, shared by all auth services in a process. */
import { scrypt } from "node:crypto";

const MAX_ACTIVE = 4;
const MAX_QUEUED = 64;
let active = 0;
const waiting: Array<() => void> = [];

/** Raised when the process has exhausted its bounded password-work queue. */
export class AuthenticationBusyError extends Error {
  constructor() { super("authentication capacity exhausted"); }
}

/** Derive the existing scrypt-v1 key without blocking the JavaScript thread. */
export async function derivePasswordKeyAsync(password: string, salt: Buffer): Promise<Buffer> {
  if (active >= MAX_ACTIVE) {
    if (waiting.length >= MAX_QUEUED) throw new AuthenticationBusyError();
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    active += 1;
  }
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 32, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
        if (error) reject(error);
        else resolve(key);
      });
    });
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }
}
