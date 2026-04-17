import { Project, SyntaxKind } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs';

const project = new Project({ tsConfigFilePath: "tsconfig.strict.json" });

const violations: Record<string, string[]> = {};

function addViolation(file: string, reason: string) {
  if (!violations[file]) violations[file] = [];
  violations[file].push(reason);
}

const sourceFiles = project.getSourceFiles("f/**/main.ts");

for (const sf of sourceFiles) {
  const filePath = sf.getFilePath();
  const relPath = path.relative(process.cwd(), filePath);
  
  // 1. Check for nested functions
  const funcs = sf.getFunctions();
  for (const fn of funcs) {
    if (fn.getName() !== 'main') {
      addViolation(relPath, `Contains helper function: ${fn.getName() || 'anonymous'}`);
    }
  }

  // 2. Check for types/interfaces/enums
  if (sf.getTypeAliases().length > 0) addViolation(relPath, `Contains ${sf.getTypeAliases().length} inline TypeAliases`);
  if (sf.getInterfaces().length > 0) addViolation(relPath, `Contains ${sf.getInterfaces().length} inline Interfaces`);
  if (sf.getEnums().length > 0) addViolation(relPath, `Contains ${sf.getEnums().length} inline Enums`);

  // 3. Check for Zod Schemas declared locally
  const varDecls = sf.getVariableDeclarations();
  for (const vd of varDecls) {
    const init = vd.getInitializer();
    if (init && init.getText().startsWith('z.')) {
      addViolation(relPath, `Contains local Zod schema: ${vd.getName()}`);
    }
  }

  // 4. Check for nested classes
  if (sf.getClasses().length > 0) addViolation(relPath, `Contains inline Classes`);

  // 5. Check for massive Switch statements (Router violation)
  const switches = sf.getDescendantsOfKind(SyntaxKind.SwitchStatement);
  for (const sw of switches) {
    const clauses = sw.getCaseBlock().getClauses();
    if (clauses.length > 5) {
      addViolation(relPath, `Monolithic switch statement detected (${clauses.length} cases). Needs Atomic Router.`);
    }
  }

  // 6. Check length
  if (sf.getEndLineNumber() > 150) {
      // Exclude tests or files that might purely be massive amounts of setup but usually >150 means bloated setup
      addViolation(relPath, `File exceeds 150 lines (Total: ${sf.getEndLineNumber()}). Possible logic bloat in main().`);
  }
}

const report = Object.entries(violations).map(([f, issues]) => `[FAILED] ${f}:\n  - ${issues.join('\n  - ')}`).join('\n\n');

if (Object.keys(violations).length > 0) {
  console.log("RED TEAM AUDIT: VIOLATIONS FOUND\n");
  console.log(report);
} else {
  console.log("RED TEAM AUDIT: CLEAN. 0 VIOLATIONS.");
}
