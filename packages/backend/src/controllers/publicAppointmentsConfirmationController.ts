import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  getPublicConfirmationViewByToken,
  getPublicRescheduleConflictPreview,
  submitPublicConfirmationByToken,
} from '../services/publicAppointmentConfirmationService.js';

const noteField = z.string().max(2000).optional().nullable();

const submitBodySchema = z.discriminatedUnion('response', [
  z.object({
    response: z.literal('confirmed'),
    note: noteField,
  }),
  z.object({
    response: z.literal('declined'),
    note: noteField,
  }),
  z.object({
    response: z.literal('needs_reschedule'),
    starts_at: z.string().min(1),
    ends_at: z.string().min(1),
    note: noteField,
  }),
]);

export async function getPublicAppointmentConfirmationByToken(req: Request, res: Response): Promise<void> {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      res.status(400).json({ error: 'Token inválido', code: 'invalid_token' });
      return;
    }
    const data = await getPublicConfirmationViewByToken(token);
    if (!data) {
      res.status(404).json({ error: 'Link não encontrado', code: 'not_found' });
      return;
    }
    res.json(data);
  } catch (e) {
    console.error('[public/appointments/confirm:get]', e);
    res.status(500).json({ error: 'Erro ao carregar link de confirmação', code: 'internal_error' });
  }
}

export async function getPublicRescheduleConflictsByToken(req: Request, res: Response): Promise<void> {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      res.status(400).json({ error: 'Token inválido', code: 'invalid_token' });
      return;
    }
    const starts_at = String(req.query.starts_at || '').trim();
    const ends_at = String(req.query.ends_at || '').trim();
    if (!starts_at || !ends_at) {
      res.status(400).json({ error: 'Informe início e fim', code: 'validation_error' });
      return;
    }
    const result = await getPublicRescheduleConflictPreview({ token, starts_at, ends_at });
    if (!result.ok) {
      if (result.code === 'not_found') {
        res.status(404).json({ error: 'Link não encontrado', code: 'not_found' });
        return;
      }
      if (result.code === 'expired') {
        res.status(410).json({ error: 'Link expirado', code: 'token_expired' });
        return;
      }
      if (result.code === 'already_responded') {
        res.status(409).json({ error: 'Resposta já registrada', code: 'already_responded' });
        return;
      }
      if (result.code === 'invalid_state') {
        res.status(400).json({ error: result.message || 'Estado inválido', code: 'invalid_state' });
        return;
      }
      res.status(400).json({ error: result.message || 'Dados inválidos', code: 'validation_error' });
      return;
    }
    res.json({ has_conflict: result.has_conflict, conflicts: result.conflicts });
  } catch (e) {
    console.error('[public/appointments/confirm:conflicts]', e);
    res.status(500).json({ error: 'Erro ao verificar disponibilidade', code: 'internal_error' });
  }
}

export async function postPublicAppointmentConfirmationByToken(req: Request, res: Response): Promise<void> {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      res.status(400).json({ error: 'Token inválido', code: 'invalid_token' });
      return;
    }
    const parsed = submitBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', code: 'validation_error', details: parsed.error.flatten() });
      return;
    }

    const payload =
      parsed.data.response === 'needs_reschedule'
        ? {
            token,
            response: parsed.data.response,
            note: parsed.data.note ?? null,
            starts_at: parsed.data.starts_at,
            ends_at: parsed.data.ends_at,
          }
        : {
            token,
            response: parsed.data.response,
            note: parsed.data.note ?? null,
          };

    const result = await submitPublicConfirmationByToken(payload);
    if (result.status === 'not_found') {
      res.status(404).json({ error: 'Link não encontrado', code: 'not_found' });
      return;
    }
    if (result.status === 'expired') {
      res.status(410).json({ error: 'Link expirado', code: 'token_expired' });
      return;
    }
    if (result.status === 'already_responded') {
      res.status(409).json({ error: 'Resposta já registrada', code: 'already_responded' });
      return;
    }
    if (result.status === 'validation_error') {
      res.status(400).json({ error: result.message || 'Dados inválidos', code: 'validation_error' });
      return;
    }
    if (result.status === 'invalid_state') {
      res.status(400).json({ error: result.message || 'Estado inválido', code: 'invalid_state' });
      return;
    }
    res.json({
      ok: true,
      success: true,
      status: 'updated',
      rescheduled: result.rescheduled === true,
      has_conflict: result.has_conflict === true,
      conflicts: result.conflicts ?? [],
    });
  } catch (e) {
    console.error('[public/appointments/confirm:post]', e);
    res.status(500).json({ error: 'Erro ao confirmar presença', code: 'internal_error' });
  }
}
