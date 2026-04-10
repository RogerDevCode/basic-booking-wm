import fs from 'fs';
import path from 'path';

function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walkDir(file));
    } else if (file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const allFiles = walkDir('f/');
for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  content = content.replace(/postgres\.TransactionSql/g, 'postgres.Sql');
  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log(`Replaced TransactionSql in ${file}`);
  }
}
