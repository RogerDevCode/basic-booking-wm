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

const InputSchema = z.object({
  recipient_email: z.email(),
  message_type: z.enum([
    'booking_created',
    'booking_confirmed',
    'booking_cancelled',
    'booking_rescheduled',
    'reminder_24h',
    'reminder_2h',
    'reminder_30min',
    'no_show',
    'provider_schedule_change',
    'custom',
  ]),
  booking_details: z.record(z.string(), z.unknown()).optional().default({}),
  action_links: z.array(
    z.object({
      text: z.string(),
      url: z.url(),
      style: z.enum(['primary', 'secondary', 'danger']).optional().default('primary'),
    })
  ).optional().default([]),
});

interface ActionLink { readonly text: string; readonly url: string; readonly style: 'primary' | 'secondary' | 'danger' }

type EmailDetails = Readonly<Record<string, unknown>>;

interface GmailSendData {
  readonly sent: boolean;
  readonly message_id: string | null;
  readonly recipient_email: string;
  readonly message_type: string;
  readonly subject: string;
}

function safeString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function buildEmailContent(
  messageType: string,
  details: EmailDetails,
  actionLinks: readonly ActionLink[]
): { subject: string; html: string } {
  const date = safeString(details['date'], 'Por confirmar');
  const time = safeString(details['time'], 'Por confirmar');
  const providerName = safeString(details['provider_name'], 'Tu doctor');
  const service = safeString(details['service'], 'Consulta');
  const bookingId = safeString(details['booking_id'], '');
  const cancellationReason = safeString(details['cancellation_reason'], '');
  const customSubject = safeString(details['subject'], '');
  const customHtmlBody = safeString(details['html_body'], '');

  let subject = '';
  let body = '';
  let icon = '';
  let color = '#4CAF50';

  switch (messageType) {
    case 'booking_created':
      subject = '✅ Cita Médica Agendada';
      icon = '✅';
      color = '#4CAF50';
      body = `<h2 style="color: ${color};">Cita Agendada Exitosamente</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px 0; font-weight: bold;">📅 Fecha:</td><td>${date}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">🕐 Hora:</td><td>${time}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">👨‍⚕️ Doctor:</td><td>${providerName}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">📋 Servicio:</td><td>${service}</td></tr>
          ${bookingId ? `<tr><td style="padding: 8px 0; font-weight: bold;">🆔 ID:</td><td><code>${bookingId}</code></td></tr>` : ''}
        </table>
        <p style="color: #666;">Para cancelar o reagendar, usa los botones de abajo o responde a este correo.</p>`;
      break;
    case 'booking_confirmed':
      subject = '✅ Cita Confirmada';
      icon = '✅';
      color = '#4CAF50';
      body = `<h2 style="color: ${color};">Tu Cita Ha Sido Confirmada</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px 0; font-weight: bold;">📅 Fecha:</td><td>${date}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">🕐 Hora:</td><td>${time}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">👨‍⚕️ Doctor:</td><td>${providerName}</td></tr>
        </table>
        <p style="color: #666;">Te esperamos. Recuerda llegar 10 minutos antes.</p>`;
      break;
    case 'booking_cancelled':
      subject = '❌ Cita Cancelada';
      icon = '❌';
      color = '#F44336';
      body = `<h2 style="color: ${color};">Cita Cancelada</h2>
        <p>Tu cita ha sido cancelada:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px 0; font-weight: bold;">📅 Fecha:</td><td>${date}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">🕐 Hora:</td><td>${time}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">👨‍⚕️ Doctor:</td><td>${providerName}</td></tr>
        </table>
        ${cancellationReason ? `<p><strong>Motivo:</strong> ${cancellationReason}</p>` : ''}
        <p style="color: #666;">Si deseas agendar una nueva cita, contáctanos por Telegram o responde a este correo.</p>`;
      break;
    case 'booking_rescheduled':
      subject = '🔄 Cita Reprogramada';
      icon = '🔄';
      color = '#FF9800';
      body = `<h2 style="color: ${color};">Cita Reprogramada</h2>
        <p>Tu cita ha sido reprogramada con los siguientes datos:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px 0; font-weight: bold;">📅 Nueva fecha:</td><td>${date}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">🕐 Nueva hora:</td><td>${time}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">👨‍⚕️ Doctor:</td><td>${providerName}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">📋 Servicio:</td><td>${service}</td></tr>
        </table>`;
      break;
    case 'reminder_24h':
      subject = '⏰ Recordatorio: Tu cita es mañana';
      icon = '⏰';
      color = '#2196F3';
      body = `<h2 style="color: ${color};">Recordatorio de Cita</h2>
        <p style="font-size: 18px;">Tu cita es <strong>mañana</strong>:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px 0; font-weight: bold;">📅 Fecha:</td><td>${date}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">🕐 Hora:</td><td>${time}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">👨‍⚕️ Doctor:</td><td>${providerName}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">📋 Servicio:</td><td>${service}</td></tr>
        </table>
        <p style="color: #666;">Recuerda llegar 10 minutos antes. Para cancelar, usa el botón de abajo.</p>`;
      break;
    case 'reminder_2h':
      subject = '⏰ Tu cita es en 2 horas';
      icon = '⏰';
      color = '#FF9800';
      body = `<h2 style="color: ${color};">Tu Cita es Pronto</h2>
        <p style="font-size: 18px;">Tu cita es en <strong>2 horas</strong>:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px 0; font-weight: bold;">📅 Fecha:</td><td>${date}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">🕐 Hora:</td><td>${time}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">👨‍⚕️ Doctor:</td><td>${providerName}</td></tr>
        </table>
        <p style="color: #666;">¡Es hora de salir! No olvides llegar 10 minutos antes.</p>`;
      break;
    case 'reminder_30min':
      subject = '🚨 Tu cita es en 30 minutos';
      icon = '🚨';
      color = '#F44336';
      body = `<h2 style="color: ${color};">¡Tu Cita es en 30 Minutos!</h2>
        <p style="font-size: 18px;">Es hora de salir:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px 0; font-weight: bold;">🕐 Hora:</td><td>${time}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold;">👨‍⚕️ Doctor:</td><td>${providerName}</td></tr>
        </table>`;
      break;
    case 'no_show':
      subject = '⚠️ Política de Inasistencia';
      icon = '⚠️';
      color = '#9E9E9E';
      body = `<h2 style="color: ${color};">No Asististe a tu Cita</h2>
        <p>Tu cita del <strong>${date}</strong> a las <strong>${time}</strong> no fue atendida.</p>
        <p style="color: #666;">Recuerda: Las cancelaciones deben hacerse con al menos 24 horas de anticipación para evitar cargos.</p>
        <p>Si deseas reagendar, contáctanos por Telegram o responde a este correo.</p>`;
      break;
    case 'provider_schedule_change':
      subject = '📢 Cambio de Horario del Doctor';
      icon = '📢';
      color = '#9C27B0';
      body = `<h2 style="color: ${color};">Cambio de Horario</h2>
        <p>El horario del Dr. ${providerName} ha cambiado.</p>
        <p>Si tienes citas próximas, te contactaremos para reprogramar.</p>`;
      break;
    case 'custom':
      subject = customSubject || 'Notificación del Sistema de Citas';
      body = customHtmlBody || '<p>Tienes una notificación.</p>';
      break;
    default: {
      subject = 'Notificación del Sistema de Citas';
      body = `<p>Tienes una notificación: ${JSON.stringify(details)}</p>`;
    }
  }

  const buttonsHtml = actionLinks.length > 0
    ? `<div style="margin: 30px 0;">
        ${actionLinks.map(link => {
          const bgColor = link.style === 'danger' ? '#F44336' : link.style === 'secondary' ? '#757575' : '#4CAF50';
          return `<a href="${link.url}" style="display: inline-block; padding: 12px 24px; margin: 0 8px 8px 0; background-color: ${bgColor}; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">${link.text}</a>`;
        }).join('')}
      </div>`
    : '';

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; font-size: 48px; margin-bottom: 20px;">${icon}</div>
  ${body}
  ${buttonsHtml}
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #999; font-size: 12px;">Este es un mensaje automático del sistema de citas médicas. No respondas directamente a este correo.</p>
</body></html>`;

  return { subject, html };
}

async function sendWithRetry(
  transporter: nodemailer.Transporter,
  from: string,
  to: string,
  subject: string,
  html: string
): Promise<[Error | null, { sent: boolean; message_id: string | null } | null]> {
  const maxRetries = 3;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const info = await transporter.sendMail({ from, to, subject, html });
      const messageId = typeof info.messageId === 'string' ? info.messageId : null;
      return [null, { sent: true, message_id: messageId }];
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      lastError = err.message;
      if (err.message.includes('4')) {
        return [new Error(`Permanent error: ${err.message}`), null];
      }
    }
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(3, attempt) * 1000));
    }
  }

  return [new Error(`Failed after ${String(maxRetries)} retries: ${lastError ?? 'Unknown'}`), null];
}

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
