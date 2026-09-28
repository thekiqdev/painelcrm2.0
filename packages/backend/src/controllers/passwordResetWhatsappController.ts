/**
 * POST públicos: pedir código, validar código, concluir nova senha (WhatsApp).
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import {
  requestPasswordResetByWhatsapp,
  verifyPasswordResetCode,
  completePasswordResetWithToken,
} from '../services/passwordResetWhatsappService.js';

const requestSchema = z.object({
  whatsapp: z.string().min(1),
});

const verifySchema = z.object({
  whatsapp: z.string().min(1),
  code: z.string().min(4).max(12),
});

const completeSchema = z.object({
  reset_token: z.string().min(10),
  new_password: z.string().min(6),
  confirm_password: z.string().min(6),
});

export async function postPasswordResetRequest(req: Request, res: Response): Promise<void> {
  try {
    const body = requestSchema.parse(req.body ?? {});
    const { shownMessage } = await requestPasswordResetByWhatsapp(pool, body.whatsapp);
    res.json({ ok: true, message: shownMessage });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Dados inválidos.', details: e.flatten() });
      return;
    }
    console.error('[passwordReset] request', e);
    res.status(500).json({ ok: false, error: 'Erro ao processar o pedido.' });
  }
}

export async function postPasswordResetVerifyCode(req: Request, res: Response): Promise<void> {
  try {
    const body = verifySchema.parse(req.body ?? {});
    const result = await verifyPasswordResetCode(pool, body.whatsapp, body.code);
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error });
      return;
    }
    res.json({ ok: true, reset_token: result.reset_token });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Dados inválidos.', details: e.flatten() });
      return;
    }
    console.error('[passwordReset] verify', e);
    res.status(500).json({ ok: false, error: 'Erro ao validar o código.' });
  }
}

export async function postPasswordResetComplete(req: Request, res: Response): Promise<void> {
  try {
    const body = completeSchema.parse(req.body ?? {});
    if (body.new_password !== body.confirm_password) {
      res.status(400).json({ ok: false, error: 'As senhas não coincidem.' });
      return;
    }
    const result = await completePasswordResetWithToken(pool, body.reset_token, body.new_password);
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error });
      return;
    }
    res.json({ ok: true, message: 'Senha atualizada. Já pode iniciar sessão.' });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Dados inválidos.', details: e.flatten() });
      return;
    }
    console.error('[passwordReset] complete', e);
    res.status(500).json({ ok: false, error: 'Erro ao atualizar a senha.' });
  }
}
