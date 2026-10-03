/** Shared process-only secrets for mock-platform integration tests. */
import { randomBytes } from "node:crypto";

process.env.PRACTICE_RELAY_AUTH_SECRET ??= randomBytes(32).toString("base64url");
process.env.PRACTICE_RELAY_LTI_SECRET ??= randomBytes(32).toString("base64url");
process.env.PRACTICE_RELAY_LTI_CLIENT_SECRET ??=
  process.env.PRACTICE_RELAY_LTI_SECRET;
