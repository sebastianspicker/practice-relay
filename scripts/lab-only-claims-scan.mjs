/** Bounded no-symlink traversal and shipped-claim scanning. */
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readRepositoryText } from "./repository-files.mjs";

const FRAMING_LINE_PATTERN = /\b(not|no|never|without|nor|neither|non-goal|nonclaim|out of scope|do not|don't|must not|does not|isn't|is not|deferred|later)\b|forbidden|banned|never claim|kill-switch|assert-lab-only|assertnoforbidden|disclaimer|local-mock|lab-only|path a|preflight|environment-dependent|mock platform|not canvas|checklist only|honesty|non-?goals?/;
const EXEMPT_LINE_PATTERNS = [
  /^\|/,
  /^\s*[-*]\s+["“'\x60]/,
  /^\s*[-*]\s+\*\*(?=.*(?:not|never|non-goal))/i,
  /^\s*["'\x60]/,
  /^\s*(?:\/\/|\*)/,
];

function skipScanEntry(entry) {
  return entry.isSymbolicLink() || entry.name === "node_modules" || entry.name.startsWith(".");
}

function collectChildFile({ dirRel, entry, acc, repositoryRoot, errors }) {
  const rel = join(dirRel, entry.name);
  if (entry.isDirectory()) {
    collectClaimFiles({ dirRel: rel, acc, repositoryRoot, errors });
  } else if (entry.isFile() && /\.(mjs|js|ts|tsx|html|md|json)$/.test(entry.name)) {
    acc.push(rel);
  }
}

/** Collect bounded claim surfaces without following symlinks. */
export function collectClaimFiles({ dirRel, acc, repositoryRoot, errors }) {
  const abs = join(repositoryRoot, dirRel);
  if (!existsSync(abs)) {
    errors.push(`missing scan root: ${dirRel}`);
    return acc;
  }
  const st = lstatSync(abs);
  if (st.isSymbolicLink()) return acc;
  if (st.isFile()) {
    acc.push(dirRel);
    return acc;
  }
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (!skipScanEntry(entry)) {
      collectChildFile({ dirRel, entry, acc, repositoryRoot, errors });
    }
  }
  return acc;
}

function isBanListHeading(line) {
  const lower = line.toLowerCase();
  return /^#{1,6}\s+/.test(line) && /(non-goal|nonclaim|not in |out of scope|never claim|do not use|do not claim|forbidden|kill-switch|explicit non|decision guide|path a|path b|acceptance criteria|lock pack)/.test(lower);
}

function entersBanContext(line) {
  const lower = line.toLowerCase().trim();
  return isBanListHeading(line) || /^\*\*not\b/.test(lower) || /^do \*\*not\*\* use|^do not use|^never claim|^not claimed|^out of scope/.test(lower) || /choose path a when|do \*\*not\*\* claim|do not claim/.test(lower) || /\bnon-?goals?\b/.test(lower) || /\blocal-mock only\b/.test(lower);
}

function nextBanContext(line, banContext) {
  const resetsContext = /^#{1,2}\s+/.test(line) && !isBanListHeading(line);
  return entersBanContext(line) || (!resetsContext && banContext);
}

function isExemptLine(line, banContext) {
  if (banContext) return true;
  const trimmed = line.trim();
  return EXEMPT_LINE_PATTERNS.some((pattern) => pattern.test(trimmed)) || FRAMING_LINE_PATTERN.test(trimmed.toLowerCase());
}

function testAssertionLine(relPath, line) {
  return relPath.includes(".test.") && /assert|forbidden|doesnot|not\.|match\(/.test(line);
}

function matchingClaims(lower, forbiddenClaims) {
  return forbiddenClaims.flatMap((claim) => claim.patterns
    .filter((pattern) => lower.includes(pattern))
    .map((pattern) => ({ claim, pattern })));
}

function reportClaimMatches({ relPath, line, lineNumber, errors, forbiddenClaims }) {
  const lower = line.toLowerCase();
  for (const { claim, pattern } of matchingClaims(lower, forbiddenClaims)) {
    if (!testAssertionLine(relPath, lower)) {
      errors.push(`${relPath}:${lineNumber}: shipped claim "${claim.id}" (${pattern}): ${line.trim().slice(0, 140)}`);
    }
  }
}

/** Scan an approved surface while retaining established exemptions and reporting order. */
export function scanClaimFile({ relPath, repositoryRoot, errors, forbiddenClaims }) {
  const lines = readRepositoryText(repositoryRoot, relPath).split(/\r?\n/);
  let banContext = false;
  for (const [index, line] of lines.entries()) {
    banContext = nextBanContext(line, banContext);
    if (!isExemptLine(line, banContext)) {
      reportClaimMatches({ relPath, line, lineNumber: index + 1, errors, forbiddenClaims });
    }
  }
}
