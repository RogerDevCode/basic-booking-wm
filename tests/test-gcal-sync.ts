#!/usr/bin/env tsx
/*
 * Test GCal sync for the booking we just created
 */

const BOOKING_ID = 'bee36574-fbd0-42e0-aa83-c34677d0f0b2';
const DB_URL = process.env['DATABASE_URL'] ?? '';
const GCAL_ACCESS_TOKEN = process.env['GCAL_ACCESS_TOKEN'] ?? '';
const GCAL_PROVIDER_CALENDAR_ID = process.env['GCAL_PROVIDER_CALENDAR_ID'] ?? '';

if (!DB_URL) {
  console.error('ERROR: DATABASE_URL not set');
  process.exit(1);
}

async function main() {
  console.log('📅 Testing GCal sync for booking:', BOOKING_ID);
  console.log('━'.repeat(50));
  
  // Step 1: Fetch booking details
  const { default: postgres } = await import('postgres');
  const sql = postgres(DB_URL);
  
  const bookingRows = await sql<{
    booking_id: string;
    provider_id: string;
    client_id: string;
    start_time: string;
    end_time: string;
    status: string;
    gcal_sync_status: string;
    gcal_provider_event_id: string | null;
  }[]>`
    SELECT booking_id, provider_id, client_id, start_time, end_time, status, gcal_sync_status, gcal_provider_event_id
    FROM bookings
    WHERE booking_id = ${BOOKING_ID}::uuid
  `;
  
  const booking = bookingRows[0];
  if (!booking) {
    console.log('❌ Booking not found');
    await sql.end();
    return;
  }
  
  console.log('✅ Booking found:');
  console.log(`   Start: ${new Date(booking.start_time).toISOString()}`);
  console.log(`   End: ${new Date(booking.end_time).toISOString()}`);
  console.log(`   Status: ${booking.status}`);
  console.log(`   GCal Status: ${booking.gcal_sync_status}`);
  
  // Step 2: Check GCal credentials
  if (!GCAL_ACCESS_TOKEN || GCAL_ACCESS_TOKEN === 'ya29.xxx') {
    console.log('\n⚠️  GCAL_ACCESS_TOKEN not configured or is placeholder');
    console.log('   GCal sync cannot proceed without valid credentials');
    console.log('\n📋 To configure GCal:');
    console.log('   1. Go to Google Cloud Console');
    console.log('   2. Enable Calendar API');
    console.log('   3. Create OAuth 2.0 credentials');
    console.log('   4. Get access token and refresh token');
    console.log('   5. Add to .env file');
    await sql.end();
    return;
  }
  
  if (!GCAL_PROVIDER_CALENDAR_ID) {
    console.log('\n⚠️  GCAL_PROVIDER_CALENDAR_ID not configured');
    await sql.end();
    return;
  }
  
  console.log('\n✅ GCal credentials found');
  console.log(`   Calendar: ${GCAL_PROVIDER_CALENDAR_ID}`);
  
  // Step 3: Create GCal event
  const eventPayload = {
    summary: `Cita Médica - Test Cliente Nuevo`,
    description: `Consulta General\nBooking ID: ${booking.booking_id}`,
    start: {
      dateTime: new Date(booking.start_time).toISOString(),
      timeZone: 'America/Mexico_City',
    },
    end: {
      dateTime: new Date(booking.end_time).toISOString(),
      timeZone: 'America/Mexico_City',
    },
    status: 'confirmed',
  };
  
  console.log('\n📤 Creating GCal event...');
  
  try {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GCAL_PROVIDER_CALENDAR_ID)}/events`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GCAL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventPayload),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ GCal API error: ${response.status}`);
      console.log(errorText);
      
      // Update booking status to 'failed'
      await sql`
        UPDATE bookings
        SET gcal_sync_status = 'failed'
        WHERE booking_id = ${BOOKING_ID}::uuid
      `;
      console.log('   Updated booking gcal_sync_status to "failed"');
      await sql.end();
      return;
    }
    
    const eventData = await response.json();
    console.log('✅ GCal event created successfully!');
    console.log(`   Event ID: ${eventData.id}`);
    console.log(`   HTML Link: ${eventData.htmlLink}`);
    console.log(`   Status: ${eventData.status}`);
    
    // Update booking with GCal event ID
    await sql`
      UPDATE bookings
      SET gcal_sync_status = 'synced',
          gcal_provider_event_id = ${eventData.id ?? ''},
          gcal_last_sync = NOW()
      WHERE booking_id = ${BOOKING_ID}::uuid
    `;
    console.log('   Updated booking gcal_sync_status to "synced"');
    
  } catch (e) {
    console.error(`❌ GCal sync failed: ${e instanceof Error ? e.message : String(e)}`);
    await sql`
      UPDATE bookings
      SET gcal_sync_status = 'failed'
      WHERE booking_id = ${BOOKING_ID}::uuid
    `;
  }
  
  await sql.end();
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
