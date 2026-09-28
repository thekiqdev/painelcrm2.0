/**
 * GET/PUT /api/superadmin/smtp-settings e POST /api/superadmin/smtp-settings/test — SMTP (Super Admin).
 */
import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import {
  getSmtpSuperadminSettings,
  updateSmtpSuperadminSettings,
  type SmtpSettingsUpdateInput,
} from '../services/smtpSuperadminSettingsService.js';
import { sendSmtpSuperadminTestEmail } from '../services/smtpSuperadminTestMailService.js';

const postTestBodySchema = z
  .object({
    to: z.string().email().max(320),
  })
  .strict();

const putBodySchema = z
  .object({
    smtp_enabled: z.boolean().optional(),
    smtp_host: z.union([z.string().max(500), z.null()]).optional(),
    smtp_port: z.number().int().min(1).max(65535).optional(),
    smtp_username: z.union([z.string().max(500), z.null()]).optional(),
    smtp_password: z.union([z.string().max(2000), z.null()]).optional(),
    smtp_secure_mode: z.enum(['none', 'tls', 'ssl']).optional(),
    smtp_from_name: z.union([z.string().max(200), z.null()]).optional(),
    smtp_from_email: z.union([z.string().email().max(320), z.literal(''), z.null()]).optional(),
    smtp_reply_to_email: z.union([z.string().email().max(320), z.literal(''), z.null()]).optional(),
  })
  .strict();

export async function getSmtpSuperadminSettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await getSmtpSuperadminSettings();
    res.json(data);
  } catch (e: unknown) {
    console.error('[getSmtpSuperadminSettingsHandler]', e);
    const msg = e instanceof Error ? e.message : 'Erro ao carregar configuração SMTP';
    res.status(500).json({ error: msg });
  }
}

export async function postSmtpSuperadminTestEmailHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = postTestBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors.join('; ') || 'Payload inválido';
      res.status(400).json({ error: msg });
      return;
    }
    await sendSmtpSuperadminTestEmail(parsed.data.to);
    res.json({ ok: true, message: 'E-mail de teste enviado.' });
  } catch (e: unknown) {
    console.error('[postSmtpSuperadminTestEmailHandler]', e);
    const msg = e instanceof Error ? e.message : 'Falha ao enviar e-mail de teste';
    const lower = msg.toLowerCase();
    const client =
      lower.includes('configure') ||
      lower.includes('secret') ||
      lower.includes('senha') ||
      lower.includes('desencriptar') ||
      lower.includes('host') ||
      lower.includes('utilizador') ||
      lower.includes('remetente');
    res.status(client ? 400 : 500).json({ error: msg });
  }
}

export async function putSmtpSuperadminSettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = putBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const msg = parsed.error.flatten().formErrors.join('; ') || 'Payload inválido';
      res.status(400).json({ error: msg, details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    const payload: SmtpSettingsUpdateInput = {};
    if (b.smtp_enabled !== undefined) payload.smtp_enabled = b.smtp_enabled;
    if (b.smtp_host !== undefined) payload.smtp_host = b.smtp_host;
    if (b.smtp_port !== undefined) payload.smtp_port = b.smtp_port;
    if (b.smtp_username !== undefined) payload.smtp_username = b.smtp_username;
    if (b.smtp_password !== undefined) payload.smtp_password = b.smtp_password;
    if (b.smtp_secure_mode !== undefined) payload.smtp_secure_mode = b.smtp_secure_mode;
    if (b.smtp_from_name !== undefined) payload.smtp_from_name = b.smtp_from_name;
    if (b.smtp_from_email !== undefined) {
      payload.smtp_from_email = b.smtp_from_email === '' ? null : b.smtp_from_email;
    }
    if (b.smtp_reply_to_email !== undefined) {
      payload.smtp_reply_to_email = b.smtp_reply_to_email === '' ? null : b.smtp_reply_to_email;
    }

    if (Object.keys(payload).length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }

    const data = await updateSmtpSuperadminSettings(payload);
    res.json(data);
  } catch (e: unknown) {
    console.error('[putSmtpSuperadminSettingsHandler]', e);
    const msg = e instanceof Error ? e.message : 'Erro ao guardar configuração SMTP';
    if (msg.includes('SMTP_SETTINGS_SECRET')) {
      res.status(400).json({ error: msg });
      return;
    }
    if (msg.includes('superadmin_settings')) {
      res.status(500).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
}
