import fs from 'fs';

const filesToFix = [
  "f/booking_cancel/main.ts",
  "f/booking_orchestrator/main.ts",
  "f/conversation_logger/main.ts",
  "f/dlq_processor/main.ts",
  "f/gcal_reconcile/main.ts",
  "f/gcal_sync/main.ts",
  "f/gcal_webhook_receiver/main.ts",
  "f/health_check/main.ts",
  "f/noshow_trigger/main.ts",
  "f/patient_register/main.ts",
  "f/provider_agenda/main.ts",
  "f/provider_dashboard/main.ts",
  "f/rag_query/main.ts",
  "f/telegram_auto_register/main.ts",
  "f/web_admin_dashboard/main.ts",
  "f/web_admin_users/main.ts",
  "f/web_auth_change_role/main.ts",
  "f/web_auth_complete_profile/main.ts",
  "f/web_auth_login/main.ts",
  "f/web_auth_me/main.ts",
  "f/web_auth_register/main.ts",
  "f/web_booking_api/main.ts",
  "f/web_patient_bookings/main.ts",
  "f/web_patient_profile/main.ts",
  "f/web_provider_dashboard/main.ts",
  "f/web_waitlist/main.ts"
];

for (const file of filesToFix) {
  if (fs.existsSync(file)) {
    console.log(`Deleting postgres import in ${file}`);
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace("import postgres from 'postgres';", "");
    content = content.replace("import type postgres from 'postgres';", "");
    fs.writeFileSync(file, content);
  }
}
