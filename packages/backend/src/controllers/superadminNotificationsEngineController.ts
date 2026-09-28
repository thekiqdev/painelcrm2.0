/**
 * Superadmin — visão operacional mínima do motor de notificações (Fase 4).
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { isNotificationsEngineEnabled } from '../config/notificationsEngineEnv.js';
import {
  getGlobalDeliveryStatusSummary,
  getSentLatencySummaryMs,
  listOperationalDeliveriesGlobal,
} from '../services/notificationsEngine/notificationEngineRepository.js';
import {
  getNotificationsEngineGlobalSettingsRow,
  upsertNotificationsEngineGlobalSettings,
} from '../services/notificationsEngine/notificationsEngineGlobalSettingsService.js';
import { refreshNotificationsEngineFlagsFromPool } from '../services/notificationsEngine/notificationsEngineRuntimeFlags.js';

const globalFlagsBodySchema = z.object({
  notifications_engine_enabled: z.boolean().optional(),
  notifications_engine_business_events_enabled: z.boolean().optional(),
  notifications_engine_whatsapp_send_enabled: z.boolean().optional(),
});

function engineOff(res: Response) {
  res.status(503).json({
    ok: false,
    error: 'Motor de notificações desligado (Super Admin → Motor de notificações, ou kill switch no ambiente).',
  });
}

/** GET /api/superadmin/notifications-engine/summary */
export async function getNotificationsEngineOpsSummary(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineOff(res);
      return;
    }
    const hours = Math.min(168 * 4, Math.max(1, parseInt(String(req.query.hours || '72'), 10) || 72));
    const tenantId = typeof req.query.tenant_id === 'string' && req.query.tenant_id.trim() ? req.query.tenant_id.trim() : null;
    const byStatus = await getGlobalDeliveryStatusSummary(pool, { hours, tenantId });
    const latency = await getSentLatencySummaryMs(pool, { hours, tenantId });
    res.json({ ok: true, hours, tenant_id: tenantId, by_status: byStatus, sent_latency_ms: latency });
  } catch (e: unknown) {
    console.error('[superadmin/notifications-engine] summary', e);
    res.status(500).json({ ok: false, error: 'Erro ao obter resumo do motor.' });
  }
}

/** GET /api/superadmin/notifications-engine/deliveries */
export async function listNotificationsEngineDeliveries(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineOff(res);
      return;
    }
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));
    const hours = Math.min(168 * 4, Math.max(1, parseInt(String(req.query.hours || '72'), 10) || 72));
    const tenantId = typeof req.query.tenant_id === 'string' && req.query.tenant_id.trim() ? req.query.tenant_id.trim() : null;
    const status = typeof req.query.status === 'string' && req.query.status.trim() ? req.query.status.trim() : null;
    const eventKey = typeof req.query.event_key === 'string' && req.query.event_key.trim() ? req.query.event_key.trim() : null;
    const channel = typeof req.query.channel === 'string' && req.query.channel.trim() ? req.query.channel.trim() : null;

    const rows = await listOperationalDeliveriesGlobal(pool, {
      limit,
      tenantId,
      status,
      eventKey,
      channel,
      hours,
    });
    res.json({ ok: true, deliveries: rows });
  } catch (e: unknown) {
    console.error('[superadmin/notifications-engine] deliveries', e);
    res.status(500).json({ ok: false, error: 'Erro ao listar entregas.' });
  }
}

/** GET /api/superadmin/notifications-engine/global-settings — não exige motor ligado. */
export async function getNotificationsEngineGlobalSettingsHandler(
  _req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const settings = await getNotificationsEngineGlobalSettingsRow(pool);
    res.json({ ok: true, ...settings });
  } catch (e: unknown) {
    console.error('[superadmin/notifications-engine] global-settings get', e);
    res.status(500).json({ ok: false, error: 'Erro ao ler configuração global do motor.' });
  }
}

/** PUT /api/superadmin/notifications-engine/global-settings */
export async function putNotificationsEngineGlobalSettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = globalFlagsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido.', details: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;
    if (
      body.notifications_engine_enabled === undefined &&
      body.notifications_engine_business_events_enabled === undefined &&
      body.notifications_engine_whatsapp_send_enabled === undefined
    ) {
      res.status(400).json({ ok: false, error: 'Envie pelo menos um campo booleano para atualizar.' });
      return;
    }
    const settings = await upsertNotificationsEngineGlobalSettings(pool, {
      notifications_engine_enabled: body.notifications_engine_enabled,
      notifications_engine_business_events_enabled: body.notifications_engine_business_events_enabled,
      notifications_engine_whatsapp_send_enabled: body.notifications_engine_whatsapp_send_enabled,
    });
    await refreshNotificationsEngineFlagsFromPool(pool);
    res.json({ ok: true, ...settings });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[superadmin/notifications-engine] global-settings put', e);
    res.status(500).json({ ok: false, error: msg || 'Erro ao guardar configuração global do motor.' });
  }
}
