import fs from 'fs';
import path from 'path';

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Un-invert the uuid/email replacements
  content = content.replace(/z\.string\(\)\.uuid\(\)/g, "z.uuid()");
  content = content.replace(/z\.string\(\)\.email\(\)/g, "z.email()");
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`Re-Fixed ${filePath}`);
  }
}

const eslintReport = JSON.parse(fs.readFileSync('eslint_report.json', 'utf8'));
const filesToFix = eslintReport.filter(r => r.warningCount > 0 || r.errorCount > 0).map(r => r.filePath);

for (const f of new Set(filesToFix)) {
  if (fs.existsSync(f)) {
    fixFile(f);
  }
}
