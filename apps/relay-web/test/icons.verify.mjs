/** Deterministic regression proof for the icon-name allowlist boundary. */
import { icon } from "../src/ui/icons.mjs";

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function verifyIconAllowlist() {
  const fileIcon = icon("file");

  requireEqual(icon("missing"), fileIcon, "unknown icon fallback");
  requireEqual(icon("constructor"), fileIcon, "constructor icon fallback");
  requireEqual(icon("__proto__"), fileIcon, "__proto__ icon fallback");
  requireEqual(icon("toString"), fileIcon, "inherited icon fallback");
  requireEqual(
    icon("check", "status-icon"),
    icon("check").replace('class="icon"', 'class="status-icon"'),
    "known icon and class preservation",
  );
  return true;
}

export const verificationComplete = verifyIconAllowlist();
