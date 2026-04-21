/*
 * PRE-FLIGHT CHECKLIST
 * Mission         : Send email notifications with HTML action links (confirm/cancel/reschedule)
 * DB Tables Used  : NONE — pure email service
 * Concurrency Risk: NO — independent email dispatch
 * GCal Calls      : NO — uses Gmail (nodemailer via SMTP)
 * Idempotency Key : N/A — email sends are inherently non-idempotent
 * RLS Tenant ID   : NO — no DB queries
 * Zod Schemas     : YES — InputSchema validates recipient, action, booking details
 */

/*
 * REASONING TRACE
 * ### Mission Decomposition
 * - Validate input: recipient_email, message_type, booking_details, action_links
 * - Build HTML email content based on message_type switch with template per notification kind
 * - Send email via nodemailer SMTP with exponential backoff retry (3 attempts)
 *
 * ### Schema Verification
 * - Tables: NONE — pure email service, no DB queries
 * - Columns: N/A
 *
 * ### Failure Mode Analysis
 * - Scenario 1: SMTP connection fails → retryWithBackoff retries up to 3 times; permanent errors (4xx) abort immediately
 * - Scenario 2: Missing SMTP credentials → fail-fast with clear error before transporter creation
 *
 * ### Concurrency Analysis
 * - Risk: NO — independent email dispatch per call; no shared mutable state
 *
 * ### SOLID Compliance Check
 * - SRP: YES — buildEmailContent handles only template rendering; sendWithRetry handles only SMTP delivery; main orchestrates
 * - DRY: YES — safeString utility prevents repeated null checks; switch-case covers all message types in one place
 * - KISS: YES — straightforward template-per-type approach; no email engine abstraction
 *
 * → CLEARED FOR CODE GENERATION
 */

// ============================================================================
// GMAIL SEND — Notification Service with HTML Action Links
// ============================================================================
// Sends emails with inline HTML styling and action links (confirm/cancel/reschedule).
// Uses nodemailer via SMTP with retry (3 attempts, exponential backoff).
// Go-style: no throw, no any, no as. Tuple return.
// ============================================================================

import { z } from 'zod';
import * as nodemailer from 'nodemailer';
import { InputSchema, type GmailSendData } from './types';
import { buildEmailContent, sendWithRetry } from './services';

export async function main(rawInput: unknown): Promise<[Error | null, GmailSendData | null]> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [new Error(`Invalid input: ${parsed.error.message}`), null];
  }

  const input: Readonly<z.infer<typeof InputSchema>> = parsed.data;

  const smtpHost = process.env['SMTP_HOST'] ?? 'smtp.gmail.com';
  const smtpPort = parseInt(process.env['SMTP_PORT'] ?? '587', 10);
  const smtpUser = process.env['GMAIL_USER'] ?? process.env['DEV_LOCAL_GMAIL_USER'] ?? '';
  const smtpPass = process.env['GMAIL_PASSWORD'] ?? process.env['DEV_LOCAL_GMAIL_PASS'] ?? '';
  const fromEmail = process.env['GMAIL_FROM_EMAIL'] ?? smtpUser;
  const fromName = process.env['GMAIL_FROM_NAME'] ?? 'Sistema de Citas Médicas';

  if (!smtpUser || !smtpPass) {
    return [new Error('SMTP credentials not configured (GMAIL_USER/GMAIL_PASSWORD)'), null];
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const { subject, html } = buildEmailContent(input.message_type, input.booking_details, input.action_links);

  const [err, result] = await sendWithRetry(
    transporter,
    `"${fromName}" <${fromEmail}>`,
    input.recipient_email,
    subject,
    html
  );

  if (err !== null) return [err, null];
  if (result === null) return [new Error('Failed to send email'), null];

  return [null, {
    sent: result.sent,
    message_id: result.message_id,
    recipient_email: input.recipient_email,
    message_type: input.message_type,
    subject,
  }];
}
