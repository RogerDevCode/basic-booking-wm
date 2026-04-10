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
  content = content.replace(/z\.string\(\)\.uuid\(\)/g, "z.uuid()");
  content = content.replace(/z\.string\(\)\.email\(\)/g, "z.email()");
  content = content.replace(/z\.unknown\(\) \| unknown/g, "z.unknown()");
  
  // also fix some basic floating promises in mail/tests by adding void?
  // Not strictly ESLint warnings, they are errors. Let's just focus on warnings.
  
  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log(`Replaced string().uuid to z.uuid() in ${file}`);
  }
}
