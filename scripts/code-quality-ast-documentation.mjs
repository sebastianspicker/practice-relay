/** Direct, indirect, default, and CommonJS export documentation checks. */
import ts from "typescript";
import {
  documented,
  fileHasModuleComment,
  parseSource,
} from "./code-quality-ast-shared.mjs";

function declarationName(node, sourceFile) {
  return node.name?.getText(sourceFile) ?? "default";
}

function isExported(node) {
  if (!ts.canHaveModifiers(node)) return false;
  return ts.getModifiers(node)?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  ) ?? false;
}

function isCallableExpression(node) {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function callableFromDeclaration(declaration) {
  if (!ts.isIdentifier(declaration.name)) return undefined;
  if (!declaration.initializer || !isCallableExpression(declaration.initializer)) {
    return undefined;
  }
  return { kind: "callable const", node: declaration };
}

function collectLocalCallables(statement, localCallables) {
  if (ts.isFunctionDeclaration(statement) && statement.name) {
    localCallables.set(statement.name.text, { kind: "function", node: statement });
    return;
  }
  if (!ts.isVariableStatement(statement)) return;
  for (const declaration of statement.declarationList.declarations) {
    const callable = callableFromDeclaration(declaration);
    if (callable) localCallables.set(declaration.name.text, callable);
  }
}

function isExportedTypeDeclaration(statement) {
  return (
    ts.isClassDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement)
  );
}

function directExportCandidates(statement, localCallables, sourceFile) {
  if (!isExported(statement)) return [];
  if (ts.isFunctionDeclaration(statement)) return [{ kind: "function", node: statement }];
  if (isExportedTypeDeclaration(statement)) return [{ kind: "type", node: statement }];
  if (!ts.isVariableStatement(statement)) return [];
  return statement.declarationList.declarations.flatMap((declaration) => {
    const callable = localCallables.get(declaration.name.getText(sourceFile));
    return callable ? [callable] : [];
  });
}

function indirectExportCandidates(statement, localCallables) {
  if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier) return [];
  return (statement.exportClause?.elements ?? []).flatMap((element) => {
    const localName = (element.propertyName ?? element.name).text;
    const callable = localCallables.get(localName);
    return callable ? [callable] : [];
  });
}

function defaultExportCandidate(statement) {
  if (!ts.isExportAssignment(statement) || !isCallableExpression(statement.expression)) {
    return undefined;
  }
  return { kind: "callable default", name: "default", node: statement.expression };
}

function commonJsExportCandidate(statement, sourceFile) {
  if (!ts.isExpressionStatement(statement)) return undefined;
  const expression = statement.expression;
  if (!ts.isBinaryExpression(expression)) return undefined;
  if (expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return undefined;
  if (!ts.isPropertyAccessExpression(expression.left)) return undefined;
  if (expression.left.expression.getText(sourceFile) !== "module") return undefined;
  if (expression.left.name.text !== "exports") return undefined;
  if (!isCallableExpression(expression.right)) return undefined;
  return { kind: "commonjs callable", name: "module.exports", node: expression.right };
}

function createViolationReporter(sourceFile, filePath, violations) {
  const reported = new Set();
  return (candidate) => {
    const { node, kind, name = declarationName(node, sourceFile) } = candidate;
    if (reported.has(node) || documented(node, sourceFile)) return;
    reported.add(node);
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    violations.push({ filePath, line: position.line + 1, name, kind });
  };
}

function documentedExports(sourceFile, filePath) {
  const violations = [];
  const localCallables = new Map();
  const report = createViolationReporter(sourceFile, filePath, violations);
  for (const statement of sourceFile.statements) {
    collectLocalCallables(statement, localCallables);
    for (const candidate of directExportCandidates(
      statement,
      localCallables,
      sourceFile,
    )) report(candidate);
  }
  for (const statement of sourceFile.statements) {
    for (const candidate of indirectExportCandidates(statement, localCallables)) {
      report(candidate);
    }
    const defaultCandidate = defaultExportCandidate(statement);
    if (defaultCandidate) report(defaultCandidate);
    const commonJsCandidate = commonJsExportCandidate(statement, sourceFile);
    if (commonJsCandidate) report(commonJsCandidate);
  }
  return violations;
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
