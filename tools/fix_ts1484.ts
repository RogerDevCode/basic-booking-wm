import { Project } from 'ts-morph';

const project = new Project({ tsConfigFilePath: "tsconfig.strict.json" });
const diagnostics = project.getPreEmitDiagnostics();

let fixedCount = 0;
for (const d of diagnostics) {
  if (d.getCode() === 1484) {
      const msg = d.getMessageText();
      const match = typeof msg === 'string' ? msg.match(/'([^']+)' is a type/) : undefined;
      if (match) {
         const name = match[1];
         const file = d.getSourceFile();
         if (file) {
             const imports = file.getImportDeclarations();
             for (const imp of imports) {
                 const ni = imp.getNamedImports().find(n => n.getName() === name);
                 if (ni) {
                     ni.setIsTypeOnly(true);
                     fixedCount++;
                 }
             }
         }
      }
  }
}
project.saveSync();
console.log(`Fixed ${fixedCount} TS1484 errors.`);
