import fs from 'fs';

function replaceValues(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/await\s+tx\.values\s*\(\s*(.*?)\s*\)/gs, 'await tx.unsafe($1 as readonly unknown[]).values()');
  content = content.replace(/await\s+sql\.values\s*\(\s*(.*?)\s*\)/gs, 'await sql.unsafe($1 as readonly unknown[]).values()');
  fs.writeFileSync(file, content);
  console.log(`Fixed ${file}`);
}

replaceValues('f/admin_honorifics/main.ts');
replaceValues('f/booking_search/main.ts');
replaceValues('f/web_admin_provider_crud/main.ts');
replaceValues('f/web_patient_bookings/main.ts');
