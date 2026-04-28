import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import {
  isNotificationsEngineEnabled,
  isNotificationsEngineBusinessEventsEnabled,
  isNotificationsEngineWhatsAppSendEnabled,
} from '../config/notificationsEngineEnv.js';
import {
  listActiveEvents,
  listRecentDeliveries,
  listRecentDeliveriesFiltered,
  getLatestDeliveryPerEventKey,
  listDeliveryAttemptsForTenantDelivery,
  getTenantNotificationPanelSummary,
  getTenantDeliveryStatusSummary,
  getSentLatencySummaryMs,
  getEventByKey,
  getSystemTemplate,
  getTenantOverride,
  getTenantPreference,
  listCatalogWithTenantState,
  upsertTenantNotificationPreference,
  upsertTenantNotificationOverride,
  deleteTenantNotificationOverride,
} from '../services/notificationsEngine/notificationEngineRepository.js';
import { groupCatalogRowsForTenantPreferences } from '../services/notificationsEngine/notificationTenantPreferencesGrouped.js';
import {
  simulateTransactionalNotification,
  isSkippedByTenantPreference,
} from '../services/notificationsEngine/notificationEngineOrchestrator.js';
import { renderStrictTemplates } from '../services/notificationsEngine/strictMergeRenderer.js';
import { buildSampleMergeContext } from '../services/notificationsEngine/notificationTenantUiSamples.js';

const simulateSchema = z.object({
  event_key: z.string().min(1),
  entity_type: z.string().min(1),
  entity_id: z.string().uuid().optional().nullable(),
  idempotency_key: z.string().min(1).max(512),
  recipient_phone: z.string().min(8).max(32),
  recipient_type: z.string().max(64).optional().default('customer'),
  merge_context: z.record(z.string()),
  event_occurred_at: z.string().optional().nullable(),
});

const DEFAULT_LOCALE = 'pt-BR';

const tenantPrefBodySchema = z.object({
  enabled: z.boolean(),
  channel: z.enum(['whatsapp', 'email', 'sms']).optional(),
});

const tenantOverrideBodySchema = z.object({
  body_template: z.string().min(1).max(16000),
  subject_template: z.string().max(2000).optional().nullable(),
});

const tenantPreviewBodySchema = z.object({
  event_key: z.string().min(1),
  body_template: z.string().min(1).max(16000),
  subject_template: z.string().max(2000).optional().nullable(),
  merge_context: z.record(z.string()).optional(),
});

function engineDisabled(res: Response) {
  res.status(503).json({
    ok: false,
    error: 'Motor de notificações desligado (Super Admin → Motor de notificações, ou kill switch NOTIFICATIONS_ENGINE_ENABLED no ambiente).',
  });
}

/** Módulo da UI (billing, proposals, …) → filtro no catálogo (invoices, …). */
function tenantUiModuleToCatalogFilter(raw: string | null | undefined): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || s === '__all__') return null;
  const map: Record<string, string> = {
    billing: 'invoices',
    proposals: 'proposals',
    contracts: 'contracts',
    agenda: 'agenda',
    other: 'other',
  };
  return map[s] ?? null;
}

/** GET /api/notifications-engine/events */
export async function listNotificationEvents(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineDisabled(res);
      return;
    }
    const rows = await listActiveEvents(pool);
    res.json({
      ok: true,
      events: rows.map((e) => ({
        event_key: e.event_key,
        module: e.module,
        description: e.description,
        default_channel: e.default_channel,
        merge_fields: e.merge_fields,
      })),
    });
  } catch (e: unknown) {
    console.error('[notifications-engine] listNotificationEvents', e);
    res.status(500).json({ ok: false, error: 'Erro ao listar catálogo de eventos.' });
  }
}

/** GET /api/notifications-engine/deliveries/search — filtros opcionais (tenant corrente). */
export async function listNotificationDeliveriesFiltered(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineDisabled(res);
      return;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ ok: false, error: 'Empresa obrigatória.' });
      return;
    }
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const hours = Math.min(168, Math.max(1, parseInt(String(req.query.hours || '72'), 10) || 72));
    const status = typeof req.query.status === 'string' && req.query.status.trim() ? req.query.status.trim() : null;
    const eventKey = typeof req.query.event_key === 'string' && req.query.event_key.trim() ? req.query.event_key.trim() : null;
    const channel = typeof req.query.channel === 'string' && req.query.channel.trim() ? req.query.channel.trim() : null;
    const moduleUi =
      typeof req.query.module === 'string' && req.query.module.trim() ? req.query.module.trim() : null;
    const catalogModule = tenantUiModuleToCatalogFilter(moduleUi);
    const rows = await listRecentDeliveriesFiltered(pool, {
      tenantId,
      limit,
      status,
      eventKey,
      channel,
      hours,
      catalogModule,
    });
    res.json({
      ok: true,
      deliveries: rows.map((r) => ({
        id: r.id,
        tenant_id: r.tenant_id,
        event_key: r.event_key,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        status: r.status,
        rendered_body: r.rendered_body,
        rendered_subject: r.rendered_subject,
        error_message: r.error_message,
        provider_message_id: r.provider_message_id,
        idempotency_key: r.idempotency_key,
        created_at: r.created_at,
        channel: r.channel,
        recipient_type: r.recipient_type,
        recipient_address: r.recipient_address,
        retry_count: r.retry_count,
        next_retry_at: r.next_retry_at,
        dispatch_sender_user_id: r.dispatch_sender_user_id,
        sent_at: r.sent_at,
        module: r.catalog_module ?? null,
      })),
    });
  } catch (e: unknown) {
    console.error('[notifications-engine] listNotificationDeliveriesFiltered', e);
    res.status(500).json({ ok: false, error: 'Erro ao listar entregas.' });
  }
}

/** GET /api/notifications-engine/tenant/summary — cartões da visão geral (7 dias + preferências). */
export async function getTenantNotificationPanelSummaryHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineDisabled(res);
      return;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ ok: false, error: 'Empresa obrigatória.' });
      return;
    }
    const summary = await getTenantNotificationPanelSummary(pool, tenantId);
    res.json({ ok: true, ...summary });
  } catch (e: unknown) {
    console.error('[notifications-engine] getTenantNotificationPanelSummaryHandler', e);
    res.status(500).json({ ok: false, error: 'Erro ao obter resumo.' });
  }
}

/** GET /api/notifications-engine/deliveries/:deliveryId/attempts */
export async function listNotificationDeliveryAttempts(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineDisabled(res);
      return;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ ok: false, error: 'Empresa obrigatória.' });
      return;
    }
    const deliveryId = String(req.params.deliveryId || '').trim();
    if (!deliveryId) {
      res.status(400).json({ ok: false, error: 'Identificador de entrega obrigatório.' });
      return;
    }
    const own = await pool.query(`SELECT 1 FROM notification_outbound_deliveries WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`, [deliveryId, tenantId]);
    if (!own.rows[0]) {
      res.status(404).json({ ok: false, error: 'Entrega não encontrada.' });
      return;
    }
    const rows = await listDeliveryAttemptsForTenantDelivery(pool, tenantId, deliveryId);
    res.json({
      ok: true,
      attempts: rows.map((a) => ({
        id: a.id,
        attempt_number: a.attempt_number,
        status: a.status,
        error_message: a.error_message,
        provider_response: a.provider_response,
        duration_ms: a.duration_ms,
        created_at: a.created_at,
      })),
    });
  } catch (e: unknown) {
    console.error('[notifications-engine] listNotificationDeliveryAttempts', e);
    res.status(500).json({ ok: false, error: 'Erro ao listar tentativas.' });
  }
}

/** GET /api/notifications-engine/metrics/summary */
export async function getTenantNotificationsEngineSummary(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineDisabled(res);
      return;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ ok: false, error: 'Empresa obrigatória.' });
      return;
    }
    const hours = Math.min(168, Math.max(1, parseInt(String(req.query.hours || '72'), 10) || 72));
    const byStatus = await getTenantDeliveryStatusSummary(pool, tenantId, hours);
    const latency = await getSentLatencySummaryMs(pool, { hours, tenantId });
    res.json({ ok: true, hours, by_status: byStatus, sent_latency_ms: latency });
  } catch (e: unknown) {
    console.error('[notifications-engine] getTenantNotificationsEngineSummary', e);
    res.status(500).json({ ok: false, error: 'Erro ao obter métricas.' });
  }
}

/** GET /api/notifications-engine/deliveries */
export async function listNotificationDeliveries(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineDisabled(res);
      return;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ ok: false, error: 'Empresa obrigatória.' });
      return;
    }
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '30'), 10) || 30));
    const rows = await listRecentDeliveries(pool, tenantId, limit);
    res.json({ ok: true, deliveries: rows });
  } catch (e: unknown) {
    console.error('[notifications-engine] listNotificationDeliveries', e);
    res.status(500).json({ ok: false, error: 'Erro ao listar entregas.' });
  }
}

/**
 * POST /api/notifications-engine/simulate
 * Simula uma notificação transacional (Fase 2 — sem wiring de negócio).
 */
export async function simulateNotification(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineDisabled(res);
      return;
    }
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      res.status(403).json({ ok: false, error: 'Autenticação e empresa obrigatórios.' });
      return;
    }

    const parsed = simulateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido.', details: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;
    let occurredAt: Date | null = null;
    if (body.event_occurred_at) {
      const d = new Date(body.event_occurred_at);
      if (!Number.isNaN(d.getTime())) occurredAt = d;
    }

    const result = await simulateTransactionalNotification({
      pool,
      tenantId,
      senderUserId: userId,
      eventKey: body.event_key,
      entityType: body.entity_type,
      entityId: body.entity_id ?? null,
      idempotencyKey: body.idempotency_key,
      recipientPhone: body.recipient_phone.replace(/\D/g, '') || body.recipient_phone,
      recipientType: body.recipient_type,
      mergeContext: body.merge_context,
      eventOccurredAt: occurredAt,
    });

    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error, details: result.details });
      return;
    }

    if (isSkippedByTenantPreference(result)) {
      res.status(200).json({
        ok: true,
        skipped: true,
        skip_reason: 'notification_skipped_by_tenant_preference',
        event_key: body.event_key,
      });
      return;
    }

    res.status(result.duplicate ? 200 : 201).json({
      ok: true,
      duplicate: result.duplicate,
      delivery_id: result.deliveryId,
      status: result.status,
      rendered_subject: result.renderedSubject,
      rendered_body: result.renderedBody,
      provider_message_id: result.providerMessageId,
      error_message: result.errorMessage,
    });
  } catch (e: unknown) {
    console.error('[notifications-engine] simulateNotification', e);
    res.status(500).json({ ok: false, error: 'Erro ao simular notificação.' });
  }
}

/** GET /api/notifications-engine/bootstrap — não exige motor ligado. */
export async function getNotificationsEngineBootstrap(_req: AuthRequest, res: Response): Promise<void> {
  const master = isNotificationsEngineEnabled();
  res.json({
    ok: true,
    engine_enabled: master,
    business_events_enabled: master && isNotificationsEngineBusinessEventsEnabled(),
    whatsapp_send_enabled: master && isNotificationsEngineWhatsAppSendEnabled(),
    default_locale: DEFAULT_LOCALE,
  });
}

/** GET /api/notifications-engine/tenant/preferences — eventos agrupados por módulo (UI “Notificações automáticas”). */
export async function getTenantNotificationPreferencesGrouped(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineDisabled(res);
      return;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ ok: false, error: 'Empresa obrigatória.' });
      return;
    }
    const locale =
      typeof req.query.locale === 'string' && req.query.locale.trim()
        ? req.query.locale.trim()
        : DEFAULT_LOCALE;
    const rows = await listCatalogWithTenantState(pool, tenantId, locale);
    const keys = rows.map((r) => r.event_key);
    const lasts = await getLatestDeliveryPerEventKey(pool, tenantId, keys);
    const lastMap = new Map(
      lasts.map((x) => [x.event_key, { status: x.status, created_at: x.created_at }]),
    );
    const modules = groupCatalogRowsForTenantPreferences(rows, lastMap);
    res.json({ ok: true, modules });
  } catch (e: unknown) {
    console.error('[notifications-engine] getTenantNotificationPreferencesGrouped', e);
    res.status(500).json({ ok: false, error: 'Erro ao listar preferências.' });
  }
}

/** GET /api/notifications-engine/tenant/catalog-with-state */
export async function getTenantCatalogWithState(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineDisabled(res);
      return;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ ok: false, error: 'Empresa obrigatória.' });
      return;
    }
    const locale =
      typeof req.query.locale === 'string' && req.query.locale.trim()
        ? req.query.locale.trim()
        : DEFAULT_LOCALE;
    const rows = await listCatalogWithTenantState(pool, tenantId, locale);
    res.json({
      ok: true,
      locale,
      items: rows.map((r) => {
        const effectiveChannel = r.pref_primary_channel || r.default_channel;
        const enabled = r.pref_enabled !== false;
        return {
          event_key: r.event_key,
          module: r.module,
          description: r.description,
          default_channel: r.default_channel,
          effective_channel: effectiveChannel,
          merge_fields: r.merge_fields,
          tenant_enabled: enabled,
          has_override: r.has_override,
          template_exists: r.has_system_template,
        };
      }),
    });
  } catch (e: unknown) {
    console.error('[notifications-engine] getTenantCatalogWithState', e);
    res.status(500).json({ ok: false, error: 'Erro ao listar catálogo da empresa.' });
  }
}

/** GET /api/notifications-engine/tenant/template-bundle/:eventKey */
export async function getTenantTemplateBundle(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineDisabled(res);
      return;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ ok: false, error: 'Empresa obrigatória.' });
      return;
    }
    const eventKey = String(req.params.eventKey || '').trim();
    if (!eventKey) {
      res.status(400).json({ ok: false, error: 'event_key obrigatório.' });
      return;
    }
    const locale =
      typeof req.query.locale === 'string' && req.query.locale.trim()
        ? req.query.locale.trim()
        : DEFAULT_LOCALE;
    const channelParam =
      typeof req.query.channel === 'string' && req.query.channel.trim()
        ? req.query.channel.trim()
        : null;

    const event = await getEventByKey(pool, eventKey);
    if (!event || !event.is_active) {
      res.status(404).json({ ok: false, error: 'Evento não encontrado ou inativo.' });
      return;
    }
    const pref = await getTenantPreference(pool, tenantId, eventKey);
    const effectiveChannel = channelParam || pref?.primary_channel || event.default_channel;

    const systemTpl = await getSystemTemplate(pool, eventKey, effectiveChannel, locale);
    if (!systemTpl) {
      res.status(404).json({ ok: false, error: 'Template sistema não encontrado para canal/locale.' });
      return;
    }
    const override = await getTenantOverride(pool, tenantId, eventKey, effectiveChannel, locale);

    res.json({
      ok: true,
      event_key: eventKey,
      locale,
      effective_channel: effectiveChannel,
      merge_fields: event.merge_field_list,
      system: {
        subject_template: systemTpl.subject_template,
        body_template: systemTpl.body_template,
        version: systemTpl.version,
      },
      override: override
        ? { subject_template: override.subject_template, body_template: override.body_template }
        : null,
    });
  } catch (e: unknown) {
    console.error('[notifications-engine] getTenantTemplateBundle', e);
    res.status(500).json({ ok: false, error: 'Erro ao obter templates.' });
  }
}

/** PUT /api/notifications-engine/tenant/preferences/:eventKey */
export async function putTenantNotificationPreference(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineDisabled(res);
      return;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ ok: false, error: 'Empresa obrigatória.' });
      return;
    }
    const eventKey = String(req.params.eventKey || '').trim();
    if (!eventKey) {
      res.status(400).json({ ok: false, error: 'event_key obrigatório.' });
      return;
    }
    const parsed = tenantPrefBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido.', details: parsed.error.flatten() });
      return;
    }
    const event = await getEventByKey(pool, eventKey);
    if (!event || !event.is_active) {
      res.status(404).json({ ok: false, error: 'Evento não encontrado ou inativo.' });
      return;
    }
    await upsertTenantNotificationPreference(pool, {
      tenantId,
      eventKey,
      enabled: parsed.data.enabled,
      primaryChannel: parsed.data.channel,
    });
    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[notifications-engine] putTenantNotificationPreference', e);
    res.status(500).json({ ok: false, error: 'Erro ao guardar preferência.' });
  }
}

/** PATCH /api/notifications-engine/tenant/preferences/:eventKey — mesmo corpo que PUT (enabled + canal opcional). */
export async function patchTenantNotificationPreference(req: AuthRequest, res: Response): Promise<void> {
  await putTenantNotificationPreference(req, res);
}

/** PUT /api/notifications-engine/tenant/override/:eventKey */
export async function putTenantNotificationOverride(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineDisabled(res);
      return;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ ok: false, error: 'Empresa obrigatória.' });
      return;
    }
    const eventKey = String(req.params.eventKey || '').trim();
    if (!eventKey) {
      res.status(400).json({ ok: false, error: 'event_key obrigatório.' });
      return;
    }
    const parsed = tenantOverrideBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido.', details: parsed.error.flatten() });
      return;
    }
    const locale =
      typeof req.query.locale === 'string' && req.query.locale.trim()
        ? req.query.locale.trim()
        : DEFAULT_LOCALE;
    const channelParam =
      typeof req.query.channel === 'string' && req.query.channel.trim()
        ? req.query.channel.trim()
        : null;

    const event = await getEventByKey(pool, eventKey);
    if (!event || !event.is_active) {
      res.status(404).json({ ok: false, error: 'Evento não encontrado ou inativo.' });
      return;
    }
    const pref = await getTenantPreference(pool, tenantId, eventKey);
    const effectiveChannel = channelParam || pref?.primary_channel || event.default_channel;

    const systemTpl = await getSystemTemplate(pool, eventKey, effectiveChannel, locale);
    if (!systemTpl) {
      res.status(404).json({ ok: false, error: 'Template sistema não encontrado para canal/locale.' });
      return;
    }

    const sampleCtx = buildSampleMergeContext(event.merge_field_list, null);
    const check = renderStrictTemplates({
      subjectTemplate: parsed.data.subject_template ?? null,
      bodyTemplate: parsed.data.body_template,
      context: sampleCtx,
      allowedMergeFields: event.merge_field_list,
    });
    if (!check.ok) {
      res.status(400).json({
        ok: false,
        error: check.error,
        disallowed_placeholders: check.disallowedPlaceholders,
        missing_keys: check.missingKeys,
      });
      return;
    }

    await upsertTenantNotificationOverride(pool, {
      tenantId,
      eventKey,
      channel: effectiveChannel,
      locale,
      bodyTemplate: parsed.data.body_template,
      subjectTemplate: parsed.data.subject_template ?? null,
      systemTemplateId: systemTpl.id,
    });
    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[notifications-engine] putTenantNotificationOverride', e);
    res.status(500).json({ ok: false, error: 'Erro ao guardar override.' });
  }
}

/** DELETE /api/notifications-engine/tenant/override/:eventKey */
export async function deleteTenantNotificationOverrideHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineDisabled(res);
      return;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ ok: false, error: 'Empresa obrigatória.' });
      return;
    }
    const eventKey = String(req.params.eventKey || '').trim();
    if (!eventKey) {
      res.status(400).json({ ok: false, error: 'event_key obrigatório.' });
      return;
    }
    const locale =
      typeof req.query.locale === 'string' && req.query.locale.trim()
        ? req.query.locale.trim()
        : DEFAULT_LOCALE;
    const channelParam =
      typeof req.query.channel === 'string' && req.query.channel.trim()
        ? req.query.channel.trim()
        : null;

    const event = await getEventByKey(pool, eventKey);
    if (!event || !event.is_active) {
      res.status(404).json({ ok: false, error: 'Evento não encontrado ou inativo.' });
      return;
    }
    const pref = await getTenantPreference(pool, tenantId, eventKey);
    const effectiveChannel = channelParam || pref?.primary_channel || event.default_channel;

    const deleted = await deleteTenantNotificationOverride(pool, {
      tenantId,
      eventKey,
      channel: effectiveChannel,
      locale,
    });
    res.json({ ok: true, deleted });
  } catch (e: unknown) {
    console.error('[notifications-engine] deleteTenantNotificationOverrideHandler', e);
    res.status(500).json({ ok: false, error: 'Erro ao remover override.' });
  }
}

/** POST /api/notifications-engine/tenant/preview — apenas render strict, sem envio. */
export async function postTenantNotificationPreview(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineDisabled(res);
      return;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ ok: false, error: 'Empresa obrigatória.' });
      return;
    }
    const parsed = tenantPreviewBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido.', details: parsed.error.flatten() });
      return;
    }
    const event = await getEventByKey(pool, parsed.data.event_key);
    if (!event || !event.is_active) {
      res.status(404).json({ ok: false, error: 'Evento não encontrado ou inativo.' });
      return;
    }
    const sampleCtx = buildSampleMergeContext(event.merge_field_list, parsed.data.merge_context ?? null);
    const rendered = renderStrictTemplates({
      subjectTemplate: parsed.data.subject_template ?? null,
      bodyTemplate: parsed.data.body_template,
      context: sampleCtx,
      allowedMergeFields: event.merge_field_list,
    });
    if (!rendered.ok) {
      res.status(200).json({
        ok: true,
        render_ok: false,
        error: rendered.error,
        disallowed_placeholders: rendered.disallowedPlaceholders,
        missing_keys: rendered.missingKeys,
      });
      return;
    }
    res.json({
      ok: true,
      render_ok: true,
      rendered_subject: rendered.subject,
      rendered_body: rendered.body,
    });
  } catch (e: unknown) {
    console.error('[notifications-engine] postTenantNotificationPreview', e);
    res.status(500).json({ ok: false, error: 'Erro ao pré-visualizar.' });
  }
}
