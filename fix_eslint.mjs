import fs from 'fs';
import path from 'path';

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // 1. z.uuid() -> z.string().uuid()
  content = content.replace(/\bz\.uuid\(\)/g, "z.string().uuid()");
  
  // 2. z.email() -> z.string().email()
  content = content.replace(/\bz\.email\(\)/g, "z.string().email()");
  
  // 3. .substring( -> .slice(
  content = content.replace(/\.substring\(/g, ".slice(");
  
  // 4. postgres.TransactionSql -> postgres.Sql
  content = content.replace(/postgres\.TransactionSql/g, "postgres.Sql");
  
  // 5. Replace `const rows = await sql.values<...>`...`;` with Zod validation syntax
  // Also handle `const [txErr, result] = await ...` ? No, values are usually assigned directly.
  const valuesRegex = /const\s+([a-zA-Z0-9_]+)\s*=\s*await\s+(sql|tx|client)\.values<\[(.*?)\]\[\]>`([\s\S]*?)`/g;
  
  content = content.replace(valuesRegex, (match, varName, clientName, typesInner, queryInner) => {
    // Generate Zod schema from typescript tuple list
    const types = typesInner.split(',').map(t => t.trim());
    const zodTypes = types.map(t => {
      let base = t.replace(' | null', '');
      let zType = 'z.unknown()';
      if (base === 'string') zType = 'z.string()';
      if (base === 'number') zType = 'z.coerce.number()'; // Use coerce for safety with DB numbers returned as strings
      if (base === 'boolean') zType = 'z.boolean()';
      if (base === 'Date') zType = 'z.date()';
      
      if (t.includes('| null')) {
        return `${zType}.nullable()`;
      }
      return zType;
    });
    
    const zodSchema = `z.array(z.tuple([${zodTypes.join(', ')}]))`;
    
    // Add z import if missing? We will check if 'zod' is imported later, but most files use it locally or we can use eslint --fix if we just use `z`.
    // Wait, some files might not import `zod`. We should add `import { z } from 'zod';` if it's missing.
    
    return `const _${varName}_raw = await ${clientName}\`${queryInner}\`.values();
  const _${varName}_parsed = ${zodSchema}.safeParse(_${varName}_raw);
  if (!_${varName}_parsed.success) return [new Error(\`schema_error: \${_${varName}_parsed.error.message}\`), null];
  const ${varName} = _${varName}_parsed.data`;
  });
  
  // Add z import if it was used and not present
  if (content !== originalContent && content.includes('z.array(') && !content.includes('from \'zod\'') && !content.includes('from \"zod\"')) {
    content = "import { z } from 'zod';\n" + content;
  }

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed ${filePath}`);
  }
}

const eslintReport = JSON.parse(fs.readFileSync('eslint_report.json', 'utf8'));
const filesToFix = eslintReport.filter(r => r.warningCount > 0 || r.errorCount > 0).map(r => r.filePath);

for (const f of new Set(filesToFix)) {
  if (fs.existsSync(f)) {
    fixFile(f);
  }
}
