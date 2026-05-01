/**
 * Envio pontual de e-mail de teste (Super Admin). Não liga ao motor de notificações transacionais.
 */
import nodemailer from 'nodemailer';
import { getSmtpRuntimeConfigForSendOrThrow } from './smtpSuperadminSettingsService.js';

export async function sendSmtpSuperadminTestEmail(toAddress: string): Promise<void> {
  const cfg = await getSmtpRuntimeConfigForSendOrThrow();

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
      ? { name: cfg.fromName.trim(), address: cfg.fromEmail }
      : cfg.fromEmail;

  await transporter.sendMail({
    from,
    to: toAddress.trim(),
    subject: 'Teste SMTP — PainelCRM',
    text: `Esta é uma mensagem de teste enviada pelo Super Admin.\n\n${new Date().toISOString()}`,
    ...(cfg.replyTo ? { replyTo: cfg.replyTo } : {}),
  });
}
