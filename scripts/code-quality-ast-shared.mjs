/** Shared TypeScript-AST parsing and source-location helpers. */
import ts from "typescript";

const AST_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

/** Return whether a path uses a JavaScript or TypeScript parser. */
export function isAstFile(filePath) {
  return AST_EXTENSIONS.has(filePath.slice(filePath.lastIndexOf(".")));
}

function scriptKindFor(filePath) {
  if (/\.tsx$/i.test(filePath)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(filePath)) return ts.ScriptKind.JSX;
  if (/\.(ts|mts|cts)$/i.test(filePath)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/** Parse source with the matching JavaScript or TypeScript script kind. */
export function parseSource(source, filePath) {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
}

/** Return a stable human-readable name for a callable AST node. */
export function callableName(node, sourceFile) {
  if (node.name) return node.name.getText(sourceFile);
  if (ts.isVariableDeclaration(node.parent)) return node.parent.name.getText(sourceFile);
  if (ts.isPropertyAssignment(node.parent)) return node.parent.name.getText(sourceFile);
  return "anonymous";
}

/** Return whether a node has a meaningful leading JSDoc comment. */
export function documented(node, sourceFile) {
  return ts.getJSDocCommentsAndTags(node).some(
    (comment) =>
      comment.kind === ts.SyntaxKind.JSDoc &&
      !isWhitespaceOrTerminatedShebang(sourceFile.text.slice(0, comment.pos)),
  );
}

function isWhitespaceOrTerminatedShebang(prefix) {
  if (hasOnlyWhitespace(prefix, 0, prefix.length)) return true;

  const shebangStart = prefix.indexOf("#!");
  if (shebangStart === -1 || !hasOnlyWhitespace(prefix, 0, shebangStart)) return false;

  const lineEnd = prefix.indexOf("\n", shebangStart + 2);
  return lineEnd !== -1 && hasOnlyWhitespace(prefix, lineEnd + 1, prefix.length);
}

function hasOnlyWhitespace(text, start, end) {
  for (let index = start; index < end; index += 1) {
    if (text.at(index).trim().length !== 0) return false;
  }
  return true;
}

/** Return whether source begins with a comment before its first statement. */
export function fileHasModuleComment(sourceFile) {
  const firstStatement = sourceFile.statements[0];
  if (!firstStatement) return true;
  return Boolean(
    ts.getLeadingCommentRanges(sourceFile.text, firstStatement.getFullStart())?.length,
  );
}
