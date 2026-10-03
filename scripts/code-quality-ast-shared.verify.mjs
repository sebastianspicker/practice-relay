/** Deterministic verification for AST JSDoc source-prefix handling. */
import ts from "typescript";
import {
  documented,
  parseSource,
} from "./code-quality-ast-shared.mjs";

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function firstCallable(source) {
  const sourceFile = parseSource(source, "fixture.ts");
  const callable = sourceFile.statements.find(ts.isFunctionDeclaration);
  if (!callable) throw new Error("fixture must contain a function declaration");
  return { callable, sourceFile };
}

function documentedForPrefix(prefix) {
  const { callable } = firstCallable("/** documented */\nfunction subject() {}");
  const [comment] = ts.getJSDocCommentsAndTags(callable);
  if (!comment) throw new Error("fixture must attach a JSDoc comment");
  const originalPos = comment.pos;
  comment.pos = prefix.length;
  try {
    return documented(callable, { text: `${prefix}/** documented */` });
  } finally {
    comment.pos = originalPos;
  }
}

function verifyWhitespaceAndShebangPrefixes() {
  for (const prefix of ["", " \t\n", "\r\n", "\uFEFF\u2003\t"]) {
    requireEqual(documentedForPrefix(prefix), false, `whitespace prefix ${JSON.stringify(prefix)}`);
  }
  requireEqual(
    documentedForPrefix(" \t#!/usr/bin/env node\n\u2003"),
    false,
    "terminated shebang prefix",
  );
  requireEqual(
    documentedForPrefix("#!/usr/bin/env node"),
    true,
    "unterminated shebang remains meaningful",
  );
  requireEqual(
    documentedForPrefix("const before = true;\n"),
    true,
    "non-whitespace code prefix",
  );
}

function verifyCallableJSDocBehavior() {
  const source = [
    "/** first callable */",
    "function first() {}",
    "/** second callable */",
    "function second() {}",
  ].join("\n");
  const sourceFile = parseSource(source, "callables.ts");
  requireEqual(documented(sourceFile.statements[0], sourceFile), false, "first callable JSDoc");
  requireEqual(documented(sourceFile.statements[1], sourceFile), true, "second callable JSDoc");
}

function verifySourceEncodingAndLengthBoundaries() {
  const crlf = firstCallable("\r\n/** CRLF */\r\nfunction crlf() {}");
  requireEqual(documented(crlf.callable, crlf.sourceFile), false, "CRLF whitespace prefix");

  const unicode = firstCallable("\uFEFF\u2003/** Unicode */\nfunction unicode() {}");
  requireEqual(documented(unicode.callable, unicode.sourceFile), false, "BOM and Unicode whitespace");

  requireEqual(
    documentedForPrefix("\u2003".repeat(250_000)),
    false,
    "long whitespace prefix",
  );
  requireEqual(
    documentedForPrefix(`${" ".repeat(250_000)}#!unterminated`),
    true,
    "long malformed shebang prefix",
  );
}

function verifyAstSharedHelpers() {
  verifyWhitespaceAndShebangPrefixes();
  verifyCallableJSDocBehavior();
  verifySourceEncodingAndLengthBoundaries();
  return true;
}

export const verificationComplete = verifyAstSharedHelpers();
