import fs from 'fs';

function fixFile(path, oldText, newText) {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(oldText, newText);
  fs.writeFileSync(path, content);
  console.log(`Fixed ${path}`);
}

// 1. admin_honorifics/main.ts
fixFile(
  'f/admin_honorifics/main.ts',
  /const rows = await tx\.values<[^>]+>\(query, params\);/,
  'const rows = await tx.unsafe(query, params as readonly unknown[]).values();'
);

// 2. booking_search/main.ts (has two sql.values)
fixFile(
  'f/booking_search/main.ts',
  /const countRows = await sql\.values\(\s*'SELECT COUNT\(\*\) as total FROM bookings b ' \+ whereClause,\s*params\s*\);/,
  "const countRows = await sql.unsafe('SELECT COUNT(*) as total FROM bookings b ' + whereClause, params as readonly unknown[]).values();"
);

fixFile(
  'f/booking_search/main.ts',
  /const bookingRows = await sql\.values\(\s*'SELECT b\.booking_id, b\.start_time, b\.end_time, b\.status, b\.idempotency_key,' \+[\s\S]*?params\.concat\(\[input\.limit, input\.offset\]\)\s*\);/,
  `const bookingRows = await sql.unsafe(
      'SELECT b.booking_id, b.start_time, b.end_time, b.status, b.idempotency_key,' +
      ' b.gcal_sync_status, b.notification_sent, b.created_at,' +
      ' p.name as provider_name, pt.name as client_name, s.name as service_name' +
      ' FROM bookings b' +
      ' JOIN providers p ON p.provider_id = b.provider_id' +
      ' JOIN clients pt ON pt.client_id = b.client_id' +
      ' JOIN services s ON s.service_id = b.service_id' +
      ' ' + whereClause +
      ' ORDER BY b.start_time DESC' +
      ' LIMIT $' + String(paramIdx) + ' OFFSET $' + String(paramIdx + 1),
      params.concat([input.limit, input.offset]) as readonly unknown[]
    ).values();`
);

// 3. web_admin_provider_crud/main.ts
fixFile(
  'f/web_admin_provider_crud/main.ts',
  /const rawRows = await tx\.values<\[string\]\[\]>\(query, params\);/,
  "const rawRows = await tx.unsafe(query, params as readonly unknown[]).values();"
);

// 4. web_patient_bookings/main.ts
fixFile(
  'f/web_patient_bookings/main.ts',
  /const rowsRaw = await tx\.values\(\s*`SELECT b\.booking_id[\s\S]*?LIMIT \$\$\{String\(params\.length \+ 1\)\} OFFSET \$\$\{String\(params\.length \+ 2\)}`,\s*\[\.\.\.params, input\.limit, input\.offset\]\s*\);/,
  `const rowsRaw = await tx.unsafe(
        \`SELECT b.booking_id, b.start_time, b.end_time, b.status,
                b.cancellation_reason,
                p.name AS provider_name, p.specialty AS provider_specialty,
                s.name AS service_name
         FROM bookings b
         INNER JOIN providers p ON b.provider_id = p.provider_id
         INNER JOIN services s ON b.service_id = s.service_id
         \${whereClause}
         ORDER BY b.start_time DESC
         LIMIT \$\${String(params.length + 1)} OFFSET \$\${String(params.length + 2)}\`,
        [...params, input.limit, input.offset] as readonly unknown[]
      ).values();`
);

fixFile(
  'f/web_patient_bookings/main.ts',
  /const countRowsRaw = await tx\.values\(\s*`SELECT COUNT\(\*\) FROM bookings b \$\{whereClause\}`,\s*params\s*\);/,
  "const countRowsRaw = await tx.unsafe(`SELECT COUNT(*) FROM bookings b ${whereClause}`, params as readonly unknown[]).values();"
);

