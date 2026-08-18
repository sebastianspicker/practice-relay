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
      !/^\s*(?:#![^\n]*\n)?\s*$/.test(sourceFile.text.slice(0, comment.pos)),
  );
}

/** Return whether source begins with a comment before its first statement. */
export function fileHasModuleComment(sourceFile) {
  const firstStatement = sourceFile.statements[0];
  if (!firstStatement) return true;
  return Boolean(
    ts.getLeadingCommentRanges(sourceFile.text, firstStatement.getFullStart())?.length,
  );
}
