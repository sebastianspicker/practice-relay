/**
 * TypeScript-AST checks for the repository code-quality guard.
 *
 * Why: parser-backed checks keep callable contracts and maintainability limits
 * deterministic while the filesystem traversal remains small and reviewable.
 */
export {
  findAstDocumentationViolations,
} from "./code-quality-ast-documentation.mjs";
export {
  MAX_FUNCTION_ARGS,
  MAX_FUNCTION_COMPLEXITY,
  findArityViolations,
  findComplexityViolations,
  findSyntaxViolations,
} from "./code-quality-ast-metrics.mjs";
export { isAstFile } from "./code-quality-ast-shared.mjs";

/** Extract inline ES modules so generated HTML cannot bypass AST quality checks. */
export function extractModuleScripts(source, filePath) {
  const modules = [];
  const moduleScript = /<script\b(?=[^>]*\btype\s*=\s*["']module["'])[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const match of source.matchAll(moduleScript)) {
    modules.push({ filePath: `${filePath}#module`, source: match[1] });
  }
  return modules;
}
