/**
 * Super Admin — Motor de Notificações da PLATAFORMA (API operacional mínima, Fase 2).
 * Rotas sob /api/superadmin/platform-notifications/* — não confundir com /notifications-engine (tenant).
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { isPlatformNotificationsEnabled } from '../config/platformNotificationsEnv.js';
import {
  listPlatformCatalog,
  getPlatformEventByKey,
  getPlatformSystemTemplate,
  getPlatformOverride,
  upsertPlatformTemplateOverride,
  deletePlatformTemplateOverride,
  listRecentPlatformDeliveries,
  setPlatformCatalogEventActive,
} from '../services/platformNotifications/platformNotificationEngineRepository.js';
import {
  getPlatformNotificationsGlobalSettingsRow,
  upsertPlatformNotificationsGlobalSettings,
} from '../services/platformNotifications/platformNotificationsGlobalSettingsService.js';
import { refreshPlatformNotificationsFlagsFromPool } from '../services/platformNotifications/platformNotificationsRuntimeFlags.js';
import { renderStrictTemplates } from '../services/notificationsEngine/strictMergeRenderer.js';
import { simulatePlatformNotification } from '../services/platformNotifications/platformNotificationEngineOrchestrator.js';

const globalSettingsBodySchema = z.object({
  platform_notifications_enabled: z.boolean().optional(),
  platform_notifications_whatsapp_send_enabled: z.boolean().optional(),
  platform_notifications_verbose_log: z.boolean().optional(),
  platform_notifications_business_events_enabled: z.boolean().optional(),
  platform_notifications_pilot_target_tenant_ids: z.string().nullable().optional(),
  platform_notifications_dispatch_tenant_id: z.string().nullable().optional(),
  platform_notifications_dispatch_sender_user_id: z.string().nullable().optional(),
  platform_notifications_whatsapp_chat_instance_id: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
});

const previewBodySchema = z.object({
  event_key: z.string().min(1),
  locale: z.string().optional().default('pt-BR'),
  channel: z.string().optional().default('whatsapp'),
  merge_context: z.record(z.string()),
});

const simulateBodySchema = z.object({
  target_tenant_id: z.string().uuid(),
  event_key: z.string().min(1),
  recipient_phone: z.string().min(5),
  merge_context: z.record(z.string()),
  idempotency_key: z.string().min(1).optional(),
});

const overridePutSchema = z.object({
  event_key: z.string().min(1),
  channel: z.string().optional().default('whatsapp'),
  locale: z.string().optional().default('pt-BR'),
  body_template: z.string().min(1),
  subject_template: z.string().nullable().optional(),
  send_whatsapp_pix_copy_paste_button: z.boolean().optional(),
});

const eventActivePatchSchema = z.object({
  is_active: z.boolean(),
});

function platformOff(res: Response) {
  res.status(503).json({
    ok: false,
    error:
      'Motor de notificações da Plataforma desligado (Super Admin → Plataforma → notificações, ou kill switch PLATFORM_NOTIFICATIONS_ENABLED).',
  });
}

/** GET /api/superadmin/platform-notifications/catalog/events */
export async function listPlatformNotificationCatalog(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rows = await listPlatformCatalog(pool);
    const DEFAULT_LOCALE = 'pt-BR';
    const DEFAULT_CH = 'whatsapp';
    const enriched = await Promise.all(
      rows.map(async (ev) => {
        const ov = await getPlatformOverride(pool, ev.event_key, DEFAULT_CH, DEFAULT_LOCALE);
        return {
          ...ev,
          has_override: Boolean(ov),
        };
      }),
    );
    res.json({ ok: true, events: enriched });
  } catch (e: unknown) {
    console.error('[superadmin/platform-notifications] catalog', e);
    res.status(500).json({ ok: false, error: 'Erro ao listar catálogo da plataforma.' });
  }
}

/** GET /api/superadmin/platform-notifications/catalog/events/:eventKey */
export async function getPlatformNotificationCatalogEventDetail(req: AuthRequest, res: Response): Promise<void> {
  try {
    const eventKey = typeof req.params.eventKey === 'string' ? req.params.eventKey.trim() : '';
    if (!eventKey) {
      res.status(400).json({ ok: false, error: 'event_key inválido.' });
      return;
    }
    const locale =
      typeof req.query.locale === 'string' && req.query.locale.trim() ? req.query.locale.trim() : 'pt-BR';
    const channel =
      typeof req.query.channel === 'string' && req.query.channel.trim() ? req.query.channel.trim() : 'whatsapp';
    const event = await getPlatformEventByKey(pool, eventKey);
    if (!event) {
      res.status(404).json({ ok: false, error: 'Evento não encontrado.' });
      return;
    }
    const systemTpl = await getPlatformSystemTemplate(pool, eventKey, channel, locale);
    if (!systemTpl) {
      res.status(404).json({ ok: false, error: 'Template sistema não encontrado.' });
      return;
    }
    const override = await getPlatformOverride(pool, eventKey, channel, locale);
    res.json({
      ok: true,
      event,
      system: {
        body_template: systemTpl.body_template,
        subject_template: systemTpl.subject_template,
        version: systemTpl.version,
        send_whatsapp_pix_copy_paste_button: Boolean(systemTpl.send_whatsapp_pix_copy_paste_button),
      },
      override: override
        ? {
            body_template: override.body_template,
            subject_template: override.subject_template,
            send_whatsapp_pix_copy_paste_button: Boolean(override.send_whatsapp_pix_copy_paste_button),
          }
        : null,
      effective_source: override ? 'override' : 'system',
    });
  } catch (e: unknown) {
    console.error('[superadmin/platform-notifications] catalog detail', e);
    res.status(500).json({ ok: false, error: 'Erro ao obter detalhe do evento.' });
  }
}

/** PATCH /api/superadmin/platform-notifications/catalog/events/:eventKey/active */
export async function patchPlatformNotificationCatalogEventActive(req: AuthRequest, res: Response): Promise<void> {
  try {
    const eventKey = typeof req.params.eventKey === 'string' ? req.params.eventKey.trim() : '';
    if (!eventKey) {
      res.status(400).json({ ok: false, error: 'event_key inválido.' });
      return;
    }
    const parsed = eventActivePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido.', details: parsed.error.flatten() });
      return;
    }
    const ok = await setPlatformCatalogEventActive(pool, eventKey, parsed.data.is_active);
    if (!ok) {
      res.status(404).json({ ok: false, error: 'Evento não encontrado.' });
      return;
    }
    res.json({ ok: true, event_key: eventKey, is_active: parsed.data.is_active });
  } catch (e: unknown) {
    console.error('[superadmin/platform-notifications] catalog active patch', e);
    res.status(500).json({ ok: false, error: 'Erro ao atualizar evento.' });
  }
}

/** GET /api/superadmin/platform-notifications/deliveries */
export async function listPlatformNotificationDeliveries(req: AuthRequest, res: Response): Promise<void> {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));
    const hours = Math.min(168 * 4, Math.max(1, parseInt(String(req.query.hours || '72'), 10) || 72));
    const targetTenantId =
      typeof req.query.target_tenant_id === 'string' && req.query.target_tenant_id.trim()
        ? req.query.target_tenant_id.trim()
        : null;
    const status = typeof req.query.status === 'string' && req.query.status.trim() ? req.query.status.trim() : null;
    const eventKey = typeof req.query.event_key === 'string' && req.query.event_key.trim() ? req.query.event_key.trim() : null;

    const rows = await listRecentPlatformDeliveries(pool, {
      limit,
      targetTenantId,
      status,
      eventKey,
      hours,
    });
    res.json({ ok: true, deliveries: rows });
  } catch (e: unknown) {
    console.error('[superadmin/platform-notifications] deliveries', e);
    res.status(500).json({ ok: false, error: 'Erro ao listar entregas da plataforma.' });
  }
}

/** GET /api/superadmin/platform-notifications/global-settings — não exige motor ligado. */
export async function getPlatformNotificationsGlobalSettingsHandler(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const settings = await getPlatformNotificationsGlobalSettingsRow(pool);
    res.json({ ok: true, ...settings });
  } catch (e: unknown) {
    console.error('[superadmin/platform-notifications] global-settings get', e);
    res.status(500).json({ ok: false, error: 'Erro ao ler configuração global da plataforma.' });
  }
}

/** PUT /api/superadmin/platform-notifications/global-settings */
export async function putPlatformNotificationsGlobalSettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = globalSettingsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido.', details: parsed.error.flatten() });
      return;
    }
    const waIdRaw = parsed.data.platform_notifications_whatsapp_chat_instance_id;
    if (waIdRaw !== undefined && waIdRaw !== null && String(waIdRaw).trim() !== '') {
      const iid = String(waIdRaw).trim();
      const uid = req.userId;
      if (!uid) {
        res.status(401).json({ ok: false, error: 'Não autenticado.' });
        return;
      }
      const chk = await pool.query(
        `SELECT 1 FROM chat_instances ci
         INNER JOIN users u ON u.id = ci.user_id
         WHERE ci.id = $1::uuid AND ci.user_id = $2::uuid AND u.is_super_admin = true
           AND ci.status IN ('connected', 'open')
         LIMIT 1`,
        [iid, uid],
      );
      if (chk.rows.length === 0) {
        res.status(400).json({
          ok: false,
          error:
            'Instância inválida: tem de pertencer ao seu utilizador Super Admin e estar conectada (connected/open).',
        });
        return;
      }
    }
    const updated = await upsertPlatformNotificationsGlobalSettings(pool, parsed.data);
    await refreshPlatformNotificationsFlagsFromPool(pool);
    res.json({ ok: true, ...updated });
  } catch (e: unknown) {
    console.error('[superadmin/platform-notifications] global-settings put', e);
    const msg = e instanceof Error ? e.message : 'Erro ao gravar configuração.';
    res.status(500).json({ ok: false, error: msg });
  }
}

/** POST /api/superadmin/platform-notifications/preview — render strict sem persistir entrega. */
export async function postPlatformNotificationPreview(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = previewBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido.', details: parsed.error.flatten() });
      return;
    }
    const { event_key, locale, channel, merge_context } = parsed.data;
    const event = await getPlatformEventByKey(pool, event_key);
    if (!event) {
      res.status(404).json({ ok: false, error: 'Evento da plataforma não encontrado.' });
      return;
    }
    if (channel !== 'whatsapp') {
      res.status(400).json({ ok: false, error: 'Canal não suportado no MVP.' });
      return;
    }
    const systemTpl = await getPlatformSystemTemplate(pool, event_key, channel, locale);
    if (!systemTpl) {
      res.status(404).json({ ok: false, error: 'Template sistema não encontrado.' });
      return;
    }
    const override = await getPlatformOverride(pool, event_key, channel, locale);
    const subjectTpl = override?.subject_template ?? systemTpl.subject_template;
    const bodyTpl = override?.body_template ?? systemTpl.body_template;
    const rendered = renderStrictTemplates({
      subjectTemplate: subjectTpl,
      bodyTemplate: bodyTpl,
      context: merge_context,
      allowedMergeFields: event.merge_field_list,
    });
    if (!rendered.ok) {
      res.status(400).json({
        ok: false,
        error: rendered.error,
        disallowed_placeholders: rendered.disallowedPlaceholders,
        missing_keys: rendered.missingKeys,
      });
      return;
    }
    res.json({
      ok: true,
      event_key,
      locale,
      channel,
      rendered_subject: rendered.subject,
      rendered_body: rendered.body,
    });
  } catch (e: unknown) {
    console.error('[superadmin/platform-notifications] preview', e);
    res.status(500).json({ ok: false, error: 'Erro no preview.' });
  }
}

/** POST /api/superadmin/platform-notifications/simulate — Fase 2: dispara pipeline real (idempotência + delivery). */
export async function postPlatformNotificationSimulate(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isPlatformNotificationsEnabled()) {
      platformOff(res);
      return;
    }
    const parsed = simulateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido.', details: parsed.error.flatten() });
      return;
    }
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ ok: false, error: 'Utilizador não autenticado.' });
      return;
    }
    const r = await simulatePlatformNotification({
      pool,
      targetTenantId: parsed.data.target_tenant_id,
      senderUserId: userId,
      eventKey: parsed.data.event_key,
      recipientPhone: parsed.data.recipient_phone,
      mergeContext: parsed.data.merge_context,
      idempotencyKey: parsed.data.idempotency_key,
    });
    if (!r.ok) {
      res.status(400).json({ ok: false, error: r.error, details: 'details' in r ? r.details : undefined });
      return;
    }
    res.json({ ok: true, result: r });
  } catch (e: unknown) {
    console.error('[superadmin/platform-notifications] simulate', e);
    res.status(500).json({ ok: false, error: 'Erro na simulação.' });
  }
}

/** PUT /api/superadmin/platform-notifications/template-overrides */
export async function putPlatformNotificationTemplateOverride(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = overridePutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido.', details: parsed.error.flatten() });
      return;
    }
    const userId = req.user?.id ?? null;
    const { event_key, channel, locale, body_template, subject_template, send_whatsapp_pix_copy_paste_button } =
      parsed.data;
    const systemTpl = await getPlatformSystemTemplate(pool, event_key, channel, locale);
    if (!systemTpl) {
      res.status(404).json({ ok: false, error: 'Template sistema não encontrado para evento/canal/locale.' });
      return;
    }
    const pixFlag =
      event_key === 'platform.billing.charge.created' ? Boolean(send_whatsapp_pix_copy_paste_button) : false;
    await upsertPlatformTemplateOverride(pool, {
      eventKey: event_key,
      channel,
      locale,
      bodyTemplate: body_template,
      subjectTemplate: subject_template ?? null,
      systemTemplateId: systemTpl.id,
      updatedBy: userId,
      sendWhatsappPixCopyPasteButton: pixFlag,
    });
    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[superadmin/platform-notifications] override put', e);
    res.status(500).json({ ok: false, error: 'Erro ao gravar override.' });
  }
}

/** DELETE /api/superadmin/platform-notifications/template-overrides?event_key=&channel=&locale= */
export async function deletePlatformNotificationTemplateOverrideHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const event_key = typeof req.query.event_key === 'string' ? req.query.event_key.trim() : '';
    const channel = typeof req.query.channel === 'string' && req.query.channel.trim() ? req.query.channel.trim() : 'whatsapp';
    const locale = typeof req.query.locale === 'string' && req.query.locale.trim() ? req.query.locale.trim() : 'pt-BR';
    if (!event_key) {
      res.status(400).json({ ok: false, error: 'event_key obrigatório.' });
      return;
    }
    const n = await deletePlatformTemplateOverride(pool, { eventKey: event_key, channel, locale });
    res.json({ ok: true, deleted: n });
  } catch (e: unknown) {
    console.error('[superadmin/platform-notifications] override delete', e);
    res.status(500).json({ ok: false, error: 'Erro ao remover override.' });
  }
}
