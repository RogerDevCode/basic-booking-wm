import { Project, SyntaxKind, SourceFile, VariableDeclarationKind } from 'ts-morph';
import path from 'path';

async function main() {
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error("Usage: npx tsx tools/monolith_splitter.ts <folder>");
        process.exit(1);
    }
    const folder = args[0];

    const project = new Project({
        tsConfigFilePath: "tsconfig.strict.json",
    });

    const mainFilePath = path.join(folder, 'main.ts');
    const mainFile = project.getSourceFile(mainFilePath);

    if (!mainFile) {
        console.error(`Could not find ${mainFilePath}`);
        process.exit(1);
    }

    console.log(`Analyzing ${mainFilePath}...`);

    // Extract all imports to copy to generated files
    const imports = mainFile.getImportDeclarations().map(i => i.getText());

    const typesFile = project.createSourceFile(path.join(folder, 'types.ts'), imports.join('\n') + '\n\n', { overwrite: true });

    // Types, Interfaces, Enums, and Zod schemas
    const typeAliases = mainFile.getTypeAliases();
    const interfaces = mainFile.getInterfaces();
    const enums = mainFile.getEnums();
    
    // Zod schemas usually defined as: const InputSchema = z.object(...)
    const varDecls = mainFile.getVariableDeclarations();
    const zodSchemas = varDecls.filter(v => {
        const init = v.getInitializer();
        return init && init.getText().startsWith('z.');
    });

    const exportedTypeNames = new Set<string>();

    for (const t of typeAliases) {
        t.setIsExported(true);
        typesFile.addTypeAlias(t.getStructure());
        exportedTypeNames.add(t.getName());
        t.remove();
    }
    for (const i of interfaces) {
        i.setIsExported(true);
        typesFile.addInterface(i.getStructure());
        exportedTypeNames.add(i.getName());
        i.remove();
    }
    for (const e of enums) {
        e.setIsExported(true);
        typesFile.addEnum(e.getStructure());
        exportedTypeNames.add(e.getName());
        e.remove();
    }
    for (const zSchema of zodSchemas) {
        const stmt = zSchema.getVariableStatement();
        if (stmt) {
            stmt.setIsExported(true);
            typesFile.addVariableStatement(stmt.getStructure() as any);
            exportedTypeNames.add(zSchema.getName());
            stmt.remove();
        }
    }

    typesFile.organizeImports();

    // Functions
    const functions = mainFile.getFunctions().filter(f => f.getName() !== 'main');
    const functionNames = new Set<string>();
    
    for (const f of functions) {
        const fName = f.getName() || 'anonymous';
        functionNames.add(fName);
        console.log(`Extracting function ${fName}...`);
        
        const fFile = project.createSourceFile(path.join(folder, `${fName}.ts`), imports.join('\n') + '\n\n', { overwrite: true });
        
        // Import types from types.ts if any were exported
        if (exportedTypeNames.size > 0) {
            fFile.addImportDeclaration({
                moduleSpecifier: './types',
                namedImports: Array.from(exportedTypeNames)
            });
        }

        f.setIsExported(true);
        fFile.addFunction(f.getStructure() as any);
        
        f.remove();
    }

    // Now update main.ts to import the extracted elements
    if (exportedTypeNames.size > 0) {
        mainFile.addImportDeclaration({
            moduleSpecifier: './types',
            namedImports: Array.from(exportedTypeNames)
        });
    }

    for (const fName of functionNames) {
        mainFile.addImportDeclaration({
            moduleSpecifier: `./${fName}`,
            namedImports: [fName]
        });
    }

    // Since functions might depend on each other, let's inject function imports into each other
    for (const fName1 of functionNames) {
        const fFile = project.getSourceFile(path.join(folder, `${fName1}.ts`));
        if (!fFile) continue;
        for (const fName2 of functionNames) {
            if (fName1 !== fName2) {
                // If the file uses fName2
                const sourceText = fFile.getText();
                // Naive but effective check
                if (new RegExp(`(?:^|\\W)${fName2}(?:\\W|$)`).test(sourceText)) {
                    fFile.addImportDeclaration({
                        moduleSpecifier: `./${fName2}`,
                        namedImports: [fName2]
                    });
                }
            }
        }
        fFile.organizeImports();
    }

    mainFile.organizeImports();

    await project.save();
    console.log(`Done refactoring ${folder}.`);
}

main().catch(console.error);
