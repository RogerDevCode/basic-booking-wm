import fs from 'fs';
import { execSync } from 'child_process';

console.log('Running tsc to find TS6133 postgres errors...');
try {
  execSync('npx tsc --noEmit');
} catch (error) {
  const output = error.stdout.toString() + '\\n' + error.stderr.toString();
  const lines = output.split('\\n');
  const filesToFix = new Set();
  
  for (const line of lines) {
    if (line.includes("error TS6133: 'postgres' is declared but its value is never read")) {
      const match = line.split('(')[0].trim();
      if (match && match.startsWith('f/')) {
        filesToFix.add(match);
      }
    }
  }

  for (const file of filesToFix) {
    if (fs.existsSync(file)) {
      console.log(`Deleting unused postgres import in ${file}`);
      let content = fs.readFileSync(file, 'utf8');
      content = content.replace(/import\\s+postgres\\s+from\\s+['"]postgres['"];?\\r?\\n?/g, '');
      content = content.replace(/import\\s+type\\s+postgres\\s+from\\s+['"]postgres['"];?\\r?\\n?/g, '');
      fs.writeFileSync(file, content);
    }
  }
}
