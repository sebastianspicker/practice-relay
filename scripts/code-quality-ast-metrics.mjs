/** Callable arity, syntax, and complexity checks for parsed source modules. */
import ts from "typescript";
import { callableName, parseSource } from "./code-quality-ast-shared.mjs";

/** Maximum declared parameters permitted on a callable. */
export const MAX_FUNCTION_ARGS = 4;

/** Maximum decision complexity permitted within one callable implementation. */
export const MAX_FUNCTION_COMPLEXITY = 50;

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

function nodeLine(node, sourceFile) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/** Find callables whose declared parameter count exceeds the repository cap. */
export function findArityViolations(source, filePath = "source.ts") {
  const sourceFile = parseSource(source, filePath);
  const violations = [];
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node.parameters?.length > MAX_FUNCTION_ARGS) {
      violations.push({
        filePath,
        line: nodeLine(node, sourceFile),
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
        violations.push({
          filePath,
          line: nodeLine(node, sourceFile),
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
