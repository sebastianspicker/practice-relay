/**
 * TypeScript-AST checks for the repository code-quality guard.
 *
 * Why: parser-backed checks keep callable contracts and maintainability limits
 * deterministic while the filesystem traversal remains small and reviewable.
 */
import ts from "typescript";

/** Maximum declared parameters permitted on a callable. */
export const MAX_FUNCTION_ARGS = 4;

/** Maximum decision complexity permitted within one callable implementation. */
export const MAX_FUNCTION_COMPLEXITY = 50;

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

const COMPLEXITY_NODE_GUARDS = [
  ts.isIfStatement,
  ts.isForStatement,
  ts.isForInStatement,
  ts.isForOfStatement,
  ts.isWhileStatement,
  ts.isDoStatement,
  ts.isCatchClause,
  ts.isConditionalExpression,
  ts.isCaseClause,
];
const LOGICAL_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
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

function parseSource(source, filePath) {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
}

function callableName(node, sourceFile) {
  if (node.name) return node.name.getText(sourceFile);
  if (ts.isVariableDeclaration(node.parent)) return node.parent.name.getText(sourceFile);
  if (ts.isPropertyAssignment(node.parent)) return node.parent.name.getText(sourceFile);
  return "anonymous";
}

function exported(node) {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      ),
  );
}

function declarationName(node, sourceFile) {
  return node.name?.getText(sourceFile) ?? "default";
}

function documented(node, sourceFile) {
  return ts.getJSDocCommentsAndTags(node).some(
    (comment) =>
      comment.kind === ts.SyntaxKind.JSDoc &&
      !/^\s*(?:#![^\n]*\n)?\s*$/.test(sourceFile.text.slice(0, comment.pos)),
  );
}

function documentedExports(sourceFile, filePath) {
  const violations = [];
  const reported = new Set();
  const addViolation = (node, kind, name = declarationName(node, sourceFile)) => {
    if (reported.has(node)) return;
    reported.add(node);
    if (documented(node, sourceFile)) return;
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    violations.push({
      filePath,
      line: position.line + 1,
      name,
      kind,
    });
  };
  const localCallables = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      localCallables.set(statement.name.text, { kind: "function", node: statement });
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer;
        if (
          ts.isIdentifier(declaration.name) &&
          initializer &&
          (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
        ) {
          localCallables.set(declaration.name.text, {
            kind: "callable const",
            node: declaration,
          });
        }
      }
    }
    if (!exported(statement)) continue;
    if (ts.isFunctionDeclaration(statement)) {
      addViolation(statement, "function");
      continue;
    }
    if (
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      addViolation(statement, "type");
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const callable = localCallables.get(declaration.name.getText(sourceFile));
      if (callable) addViolation(callable.node, callable.kind);
    }
  }
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier) {
      for (const element of statement.exportClause?.elements ?? []) {
        const localName = (element.propertyName ?? element.name).text;
        const callable = localCallables.get(localName);
        if (callable) addViolation(callable.node, callable.kind);
      }
      continue;
    }
    if (
      ts.isExportAssignment(statement) &&
      (ts.isArrowFunction(statement.expression) ||
        ts.isFunctionExpression(statement.expression))
    ) {
      addViolation(statement.expression, "callable default", "default");
      continue;
    }
    const expression = ts.isExpressionStatement(statement) && statement.expression;
    if (
      expression &&
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(expression.left) &&
      expression.left.expression.getText(sourceFile) === "module" &&
      expression.left.name.text === "exports" &&
      (ts.isArrowFunction(expression.right) || ts.isFunctionExpression(expression.right))
    ) {
      addViolation(expression.right, "commonjs callable", "module.exports");
    }
  }
  return violations;
}

function fileHasModuleComment(sourceFile) {
  const firstStatement = sourceFile.statements[0];
  if (!firstStatement) return true;
  return Boolean(
    ts.getLeadingCommentRanges(sourceFile.text, firstStatement.getFullStart())?.length,
  );
}

/** Find source-header and direct-export JSDoc violations in one AST code file. */
export function findAstDocumentationViolations(source, filePath = "source.ts") {
  const sourceFile = parseSource(source, filePath);
  return {
    module: fileHasModuleComment(sourceFile)
      ? []
      : [{ filePath, line: 1, kind: "module" }],
    exports: documentedExports(sourceFile, filePath),
  };
}

/** Find callables whose declared parameter count exceeds the repository cap. */
export function findArityViolations(source, filePath = "source.ts") {
  const sourceFile = parseSource(source, filePath);
  const violations = [];
  const visit = (node) => {
    if (
      ts.isFunctionLike(node) &&
      node.parameters &&
      node.parameters.length > MAX_FUNCTION_ARGS
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      violations.push({
        filePath,
        line: position.line + 1,
        name: callableName(node, sourceFile),
        args: node.parameters.length,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

/** Find parser errors so the repository lint gate rejects malformed JS/TS. */
export function findSyntaxViolations(source, filePath = "source.ts") {
  const sourceFile = parseSource(source, filePath);
  return (sourceFile.parseDiagnostics ?? []).map((diagnostic) => {
    const position = sourceFile.getLineAndCharacterOfPosition(
      diagnostic.start ?? 0,
    );
    return {
      filePath,
      line: position.line + 1,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
    };
  });
}

function addsComplexity(node) {
  return (
    COMPLEXITY_NODE_GUARDS.some((isComplexityNode) => isComplexityNode(node)) ||
    (ts.isBinaryExpression(node) && LOGICAL_OPERATORS.has(node.operatorToken.kind))
  );
}

function callableComplexity(callable) {
  let complexity = 1;
  const visit = (node) => {
    if (node !== callable && ts.isFunctionLike(node)) return;
    if (addsComplexity(node)) complexity += 1;
    ts.forEachChild(node, visit);
  };
  if (callable.body) visit(callable.body);
  return complexity;
}

/** Find callable implementations with too many independent decision paths. */
export function findComplexityViolations(source, filePath = "source.ts") {
  const sourceFile = parseSource(source, filePath);
  const violations = [];
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node.body) {
      const complexity = callableComplexity(node);
      if (complexity > MAX_FUNCTION_COMPLEXITY) {
        const position = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        violations.push({
          filePath,
          line: position.line + 1,
          name: callableName(node, sourceFile),
          complexity,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

/** Extract inline ES modules so generated HTML cannot bypass AST quality checks. */
export function extractModuleScripts(source, filePath) {
  const modules = [];
  const moduleScript = /<script\b(?=[^>]*\btype\s*=\s*["']module["'])[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const match of source.matchAll(moduleScript)) {
    modules.push({ filePath: `${filePath}#module`, source: match[1] });
  }
  return modules;
}
