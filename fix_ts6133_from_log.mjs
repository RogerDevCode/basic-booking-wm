import fs from 'fs';

const log = fs.readFileSync('tsc.log', 'utf8');
const filesToFix = new Set();
const lines = log.split('\\n');

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
