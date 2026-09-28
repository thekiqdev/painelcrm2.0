/**
 * Envio transacional via SMTP global do Super Admin (nodemailer).
 * Não regista logs com senha; sujeito/reply-to são normalizados contra quebras de linha (header injection).
 */
import nodemailer from 'nodemailer';
import { getSmtpRuntimeConfigForSendOrThrow } from '../smtpSuperadminSettingsService.js';

function stripHeaderInjection(value: string, maxLen: number): string {
  return String(value)
    .replace(/[\r\n\u2028\u2029]/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function htmlToPlainText(html: string): string {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type SendTransactionalEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  eventKey?: string;
  tenantId?: string | null;
};

export type SendTransactionalEmailResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string };

export async function sendTransactionalEmail(params: SendTransactionalEmailParams): Promise<SendTransactionalEmailResult> {
  const toRaw = String(params.to ?? '').trim();
  if (!toRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toRaw)) {
    return { ok: false, error: 'Destinatário inválido' };
  }
  const subject = stripHeaderInjection(params.subject || 'Notificação', 200);
  if (!subject) {
    return { ok: false, error: 'Assunto inválido' };
  }

  let cfg: Awaited<ReturnType<typeof getSmtpRuntimeConfigForSendOrThrow>>;
  try {
    cfg = await getSmtpRuntimeConfigForSendOrThrow();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'SMTP indisponível';
    return { ok: false, error: msg };
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secureMode === 'ssl',
    requireTLS: cfg.secureMode === 'tls',
    auth: {
      user: cfg.user,
      pass: cfg.password,
    },
  });

  const from =
    cfg.fromName && cfg.fromName.trim().length > 0
      ? { name: stripHeaderInjection(cfg.fromName, 120), address: cfg.fromEmail.trim() }
      : cfg.fromEmail.trim();

  const text = params.text?.trim() ? params.text : htmlToPlainText(params.html);

  try {
    const info = await transporter.sendMail({
      from,
      to: toRaw,
      subject,
      text,
      html: params.html,
      ...(cfg.replyTo?.trim() ? { replyTo: cfg.replyTo.trim() } : {}),
      headers: {
        ...(params.eventKey ? { 'X-PainelCRM-Event': stripHeaderInjection(params.eventKey, 120) } : {}),
        ...(params.tenantId ? { 'X-PainelCRM-Tenant': stripHeaderInjection(params.tenantId, 80) } : {}),
      },
    });
    const mid =
      typeof info?.messageId === 'string' && info.messageId.trim() ? info.messageId.trim() : undefined;
    return { ok: true, messageId: mid };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao enviar e-mail';
    return { ok: false, error: msg };
  }
}
