/**
 * Generate a versioned scrypt password hash for configured Practice Relay users.
 * Why: configured-user files require a `passwordHash`, and operators need a
 * supported way to produce `scrypt-v1` values without a separate toolchain.
 *
 * Usage: pnpm hash-password "correct horse battery staple"
 *        pnpm hash-password            # prompts on stderr and reads stdin
 */
import { createInterface } from "node:readline/promises";
import process from "node:process";
import { createScryptPasswordHash } from "../src/index.ts";

async function resolvePassword() {
  const supplied = process.argv[2];
  if (supplied !== undefined) return supplied;
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await prompt.question("Password: ");
  } finally {
    prompt.close();
  }
}

const password = await resolvePassword();
if (typeof password !== "string" || password.length === 0) {
  console.error("usage: pnpm hash-password <password>");
  process.exitCode = 2;
} else {
  console.log(createScryptPasswordHash(password));
}
