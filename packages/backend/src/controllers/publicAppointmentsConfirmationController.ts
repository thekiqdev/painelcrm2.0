import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  getPublicConfirmationViewByToken,
  getPublicRescheduleConflictPreview,
  submitPublicConfirmationByToken,
} from '../services/publicAppointmentConfirmationService.js';
import { getPublicAvailabilitySlotsForToken } from '../services/appointmentAvailabilityService.js';

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

export async function getPublicAppointmentAvailabilityByToken(req: Request, res: Response): Promise<void> {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      res.status(400).json({ error: 'Token inválido', code: 'invalid_token' });
      return;
    }
    const result = await getPublicAvailabilitySlotsForToken(token);
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
      res.status(400).json({ error: result.message || 'Indisponível', code: result.code });
      return;
    }
    res.json({
      timezone: result.timezone,
      slot_duration_minutes: result.slot_duration_minutes,
      default_meeting_duration_minutes: result.default_meeting_duration_minutes,
      meeting_duration_minutes: result.meeting_duration_minutes,
      settings_source: result.settings_source,
      capacity_per_slot: result.capacity_per_slot,
      slots: result.slots,
      ...(result.date ? { date: result.date } : {}),
      ...(result.unavailable_reason ? { unavailable_reason: result.unavailable_reason } : {}),
      ...(result.holiday ? { holiday: result.holiday } : {}),
    });
  } catch (e) {
    console.error('[public/appointments/confirm:availability]', e);
    res.status(500).json({ error: 'Erro ao calcular disponibilidade', code: 'internal_error' });
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
      if (result.code === 'slot_blocked') {
        res.status(400).json({
          error: result.message || 'Indisponível',
          code: 'slot_blocked',
          message: result.message || 'Este horário está indisponível. Escolha outro horário.',
        });
        return;
      }
      if (result.code === 'holiday_blocked') {
        res.status(400).json({
          error: result.message || 'Indisponível',
          code: 'holiday_blocked',
          message: result.message || 'Este dia não está disponível para agendamento.',
        });
        return;
      }
      if (result.code === 'slot_unavailable') {
        res.status(400).json({
          error: result.message || 'Sem vagas',
          code: 'slot_unavailable',
          message: result.message || 'Este horário já não tem vagas disponíveis. Escolha outro horário.',
        });
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
    if (result.status === 'slot_blocked') {
      const msg = result.message || 'Este horário está indisponível. Escolha outro horário.';
      res.status(400).json({
        error: msg,
        code: 'slot_blocked',
        message: msg,
      });
      return;
    }
    if (result.status === 'holiday_blocked') {
      const msg = result.message || 'Este dia não está disponível para agendamento.';
      res.status(400).json({
        error: msg,
        code: 'holiday_blocked',
        message: msg,
      });
      return;
    }
    if (result.status === 'slot_unavailable') {
      const msg = result.message || 'Este horário já não tem vagas disponíveis. Escolha outro horário.';
      res.status(400).json({
        error: msg,
        code: 'slot_unavailable',
        message: msg,
      });
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
