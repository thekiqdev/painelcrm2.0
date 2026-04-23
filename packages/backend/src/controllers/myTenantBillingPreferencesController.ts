import { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import {
  getTenantBillingPreferences,
  isValidIanaTimezone,
  normalizeTimeToHhMm,
  resolveTenantBillingPreferences,
  updateTenantBillingPreferences,
} from '../services/tenantBillingPreferencesService.js';

const hhMmSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'Formato de horário deve ser HH:mm')
  .refine((v) => normalizeTimeToHhMm(v) != null, 'Horário inválido');

const putBodySchema = z
  .object({
    timezone: z.string().trim().min(1).nullable(),
    recurring_generate_time_local: hhMmSchema,
    invoice_notify_same_as_generation: z.boolean(),
    invoice_notify_time_local: hhMmSchema.nullable().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.timezone && !isValidIanaTimezone(d.timezone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['timezone'],
        message: 'Timezone inválida (IANA)',
      });
    }
    if (!d.invoice_notify_same_as_generation) {
      if (!d.invoice_notify_time_local) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['invoice_notify_time_local'],
          message: 'Obrigatório quando notificação não usa o mesmo horário da geração',
        });
      }
    }
  });

export async function getMyTenantBillingPreferences(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;

    const row = await getTenantBillingPreferences(tenantId);
    if (!row) {
      res.status(404).json({ error: 'Tenant não encontrado' });
      return;
    }
    const resolved = resolveTenantBillingPreferences(row);
    res.json({
      timezone: row.timezone,
      recurring_generate_time_local: normalizeTimeToHhMm(row.recurring_generate_time_local) ?? null,
      invoice_notify_same_as_generation:
        typeof row.invoice_notify_same_as_generation === 'boolean'
          ? row.invoice_notify_same_as_generation
          : null,
      invoice_notify_time_local: normalizeTimeToHhMm(row.invoice_notify_time_local) ?? null,
      defaults: {
        timezone: resolved.timezone_effective,
        recurring_generate_time_local: resolved.recurring_generate_time_local_effective,
        invoice_notify_same_as_generation: resolved.invoice_notify_same_as_generation_effective,
        invoice_notify_time_local: resolved.invoice_notify_time_local_effective,
      },
      sources: {
        timezone: resolved.timezone_source,
        recurring_generate_time_local: resolved.recurring_generate_time_source,
        invoice_notify_same_as_generation: resolved.invoice_notify_same_as_generation_source,
        invoice_notify_time_local: resolved.invoice_notify_time_source,
      },
    });
  } catch (error) {
    console.error('getMyTenantBillingPreferences error:', error);
    res.status(500).json({ error: 'Erro ao carregar preferências de recorrência' });
  }
}

export async function putMyTenantBillingPreferences(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    await assertModulePermission(userId, 'settings', 'edit', undefined, req);

    const parsed = putBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }

    const payload = parsed.data;
    const updated = await updateTenantBillingPreferences(tenantId, {
      timezone: payload.timezone ? payload.timezone.trim() : null,
      recurring_generate_time_local: payload.recurring_generate_time_local,
      invoice_notify_same_as_generation: payload.invoice_notify_same_as_generation,
      invoice_notify_time_local: payload.invoice_notify_same_as_generation
        ? null
        : payload.invoice_notify_time_local ?? null,
    });
    if (!updated) {
      res.status(404).json({ error: 'Tenant não encontrado' });
      return;
    }
    const resolved = resolveTenantBillingPreferences(updated);
    res.json({
      timezone: updated.timezone,
      recurring_generate_time_local: normalizeTimeToHhMm(updated.recurring_generate_time_local),
      invoice_notify_same_as_generation: updated.invoice_notify_same_as_generation,
      invoice_notify_time_local: normalizeTimeToHhMm(updated.invoice_notify_time_local),
      effective: {
        timezone: resolved.timezone_effective,
        recurring_generate_time_local: resolved.recurring_generate_time_local_effective,
        invoice_notify_same_as_generation: resolved.invoice_notify_same_as_generation_effective,
        invoice_notify_time_local: resolved.invoice_notify_time_local_effective,
      },
      message: 'Preferências de recorrência atualizadas',
    });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('putMyTenantBillingPreferences error:', error);
    res.status(500).json({ error: 'Erro ao salvar preferências de recorrência' });
  }
}

