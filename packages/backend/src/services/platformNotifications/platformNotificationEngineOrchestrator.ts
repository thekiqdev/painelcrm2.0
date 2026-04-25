import type { Pool } from 'pg';
import { randomUUID } from 'crypto';
import {
  getPlatformEventByKey,
  getPlatformSystemTemplate,
  getPlatformOverride,
  insertPlatformDelivery,
  insertPlatformDeliveryAttempt,
  updatePlatformDeliveryOutcome,
  getNextPlatformDeliveryAttemptNumber,
  schedulePlatformOutboundDeliveryRetry,
  setPlatformDispatchSenderIfNull,
  clearPlatformOutboundDeliveryRetrySchedule,
} from './platformNotificationEngineRepository.js';
import { renderStrictTemplates } from '../notificationsEngine/strictMergeRenderer.js';
import { dispatchPlatformWhatsAppText } from '../notificationsEngine/whatsappChannelDispatcher.js';
import { tryPlatformBillingPixWhatsappFollowupAfterText } from './platformNotificationWhatsappPixFollowup.js';
import {
  isPlatformNotificationsEnabled,
  isPlatformNotificationsWhatsAppSendEnabled,
  getPlatformNotificationsWhatsAppMaxSendAttempts,
  getPlatformNotificationsRetryBaseMs,
} from '../../config/platformNotificationsEnv.js';
import { classifyWhatsAppDispatchError } from '../notificationsEngine/whatsappDispatchErrorClassifier.js';
import { pnLogInfo, pnLogWarn } from './platformNotificationLog.js';
import {
  isPlatformNotificationPilotTargetAllowed,
  resolvePlatformWhatsAppOutboundReady,
} from './platformNotificationDispatchContext.js';

const DEFAULT_LOCALE = 'pt-BR';

export type PlatformSimulateResult =
  | {
      ok: true;
      duplicate: boolean;
      deliveryId: string;
      status: string;
      renderedSubject: string | null;
      renderedBody: string;
      providerMessageId: string | null;
      errorMessage: string | null;
    }
  | { ok: false; error: string; details?: unknown };

function computeRetryDelayMs(failedAttemptNumber: number): number {
  const base = getPlatformNotificationsRetryBaseMs();
  const exp = Math.min(8, Math.max(0, failedAttemptNumber - 1));
  return Math.min(600_000, Math.round(base * Math.pow(2, exp)));
}

async function recordPlatformAttemptAndHandleSendFailure(params: {
  pool: Pool;
  deliveryId: string;
  errorMessage: string;
  durationMs: number;
  failedAttemptNumber: number;
}): Promise<void> {
  const errClass = classifyWhatsAppDispatchError(params.errorMessage);
  const maxAttempts = getPlatformNotificationsWhatsAppMaxSendAttempts();

  await insertPlatformDeliveryAttempt(params.pool, {
    deliveryId: params.deliveryId,
    attemptNumber: params.failedAttemptNumber,
    status: errClass === 'transient' ? 'failed_transient' : 'failed',
    errorMessage: params.errorMessage,
    providerResponse: { class: errClass, attempt: params.failedAttemptNumber },
    durationMs: params.durationMs,
  });

  if (errClass === 'transient' && params.failedAttemptNumber < maxAttempts) {
    const delay = computeRetryDelayMs(params.failedAttemptNumber);
    const nextAt = new Date(Date.now() + delay);
    await schedulePlatformOutboundDeliveryRetry(params.pool, {
      deliveryId: params.deliveryId,
      errorMessage: params.errorMessage,
      nextRetryAt: nextAt,
    });
    pnLogWarn('platform_send_transient_retry_scheduled', {
      delivery_id: params.deliveryId,
      attempt: params.failedAttemptNumber,
      max_attempts: maxAttempts,
      next_retry_at: nextAt.toISOString(),
    });
    return;
  }

  await updatePlatformDeliveryOutcome(params.pool, params.deliveryId, {
    status: 'failed',
    errorMessage: params.errorMessage,
    providerMessageId: null,
    sentAt: null,
  });
}

/**
 * Pipeline: simulação (Fase 2) e futuros eventos reais (Fase 3).
 * Não misturar com `runTransactionalNotification` do tenant.
 */
export async function runPlatformTransactionalNotification(params: {
  pool: Pool;
  targetTenantId: string;
  eventKey: string;
  entityType: string;
  entityId: string | null;
  idempotencyKey: string;
  recipientPhone: string;
  recipientType: string;
  mergeContext: Record<string, string>;
  eventOccurredAt: Date | null;
  actor: Record<string, unknown>;
  metadata: Record<string, unknown>;
}): Promise<PlatformSimulateResult> {
  if (!isPlatformNotificationsEnabled()) {
    return { ok: false, error: 'Motor de notificações da plataforma desligado.' };
  }

  /** Piloto (CSV em superadmin_settings) aplica-se apenas a simulações manuais; eventos reais de negócio não ficam bloqueados por UUIDs antigos na lista. */
  const pilotApplies = params.entityType === 'simulate' || params.metadata?.simulate === true;
  if (pilotApplies && !isPlatformNotificationPilotTargetAllowed(params.targetTenantId)) {
    return {
      ok: false,
      error: 'Tenant alvo fora do piloto configurado (platform_notifications_pilot_target_tenant_ids).',
      details: { target_tenant_id: params.targetTenantId },
    };
  }

  const event = await getPlatformEventByKey(params.pool, params.eventKey);
  if (!event || !event.is_active) {
    return { ok: false, error: 'Evento da plataforma não encontrado ou inativo.' };
  }

  const channel = event.default_channel;
  if (channel !== 'whatsapp') {
    return { ok: false, error: 'Apenas canal whatsapp suportado no MVP da plataforma.' };
  }

  const systemTpl = await getPlatformSystemTemplate(params.pool, params.eventKey, channel, DEFAULT_LOCALE);
  if (!systemTpl) {
    return { ok: false, error: 'Template sistema da plataforma não encontrado para evento/canal/locale.' };
  }

  const override = await getPlatformOverride(params.pool, params.eventKey, channel, DEFAULT_LOCALE);
  const subjectTpl = override?.subject_template ?? systemTpl.subject_template;
  const bodyTpl = override?.body_template ?? systemTpl.body_template;

  const rendered = renderStrictTemplates({
    subjectTemplate: subjectTpl,
    bodyTemplate: bodyTpl,
    context: params.mergeContext,
    allowedMergeFields: event.merge_field_list,
  });

  if (!rendered.ok) {
    pnLogWarn('platform_render_strict_failed', {
      target_tenant_id: params.targetTenantId,
      event_key: params.eventKey,
      error: rendered.error,
    });
    return {
      ok: false,
      error: rendered.error,
      details: {
        disallowedPlaceholders: rendered.disallowedPlaceholders,
        missingKeys: rendered.missingKeys,
      },
    };
  }

  const outbound = await resolvePlatformWhatsAppOutboundReady(params.pool);
  if (!outbound) {
    return {
      ok: false,
      error:
        'Remetente WhatsApp da plataforma não disponível. No Super Admin → Notificações da plataforma, ligue o WhatsApp, escaneie o QR e clique para usar este número como remetente oficial (instância tem de estar conectada).',
    };
  }

  const { created, row: deliveryRow } = await insertPlatformDelivery(params.pool, {
    targetTenantId: params.targetTenantId,
    eventKey: params.eventKey,
    entityType: params.entityType,
    entityId: params.entityId,
    idempotencyKey: params.idempotencyKey,
    channel,
    recipientType: params.recipientType,
    recipientAddress: params.recipientPhone,
    status: 'queued',
    renderedSubject: rendered.subject,
    renderedBody: rendered.body,
    errorMessage: null,
    providerMessageId: null,
    actor: params.actor,
    metadata: {
      ...params.metadata,
      platform_whatsapp_chat_instance_id: outbound.chatInstanceId,
    },
    eventOccurredAt: params.eventOccurredAt,
    dispatchSenderUserId: outbound.ownerUserId,
    dispatchNotBefore: null,
  });

  if (!created) {
    pnLogInfo('platform_idempotent_duplicate', {
      target_tenant_id: params.targetTenantId,
      event_key: params.eventKey,
      idempotency_key: params.idempotencyKey,
      delivery_id: deliveryRow.id,
    });
    return {
      ok: true,
      duplicate: true,
      deliveryId: deliveryRow.id,
      status: deliveryRow.status,
      renderedSubject: deliveryRow.rendered_subject,
      renderedBody: deliveryRow.rendered_body,
      providerMessageId: deliveryRow.provider_message_id,
      errorMessage: deliveryRow.error_message,
    };
  }

  const deliveryId = deliveryRow.id;
  const t0 = Date.now();

  if (!isPlatformNotificationsWhatsAppSendEnabled()) {
    await updatePlatformDeliveryOutcome(params.pool, deliveryId, {
      status: 'skipped',
      errorMessage: null,
      providerMessageId: null,
      sentAt: null,
    });
    await insertPlatformDeliveryAttempt(params.pool, {
      deliveryId,
      attemptNumber: 1,
      status: 'skipped',
      errorMessage: 'PLATFORM_NOTIFICATIONS_WHATSAPP_SEND_ENABLED=false',
      providerResponse: { reason: 'send_disabled_by_flag' },
      durationMs: Date.now() - t0,
    });
    pnLogInfo('platform_send_skipped_flag', { delivery_id: deliveryId, target_tenant_id: params.targetTenantId });
    return {
      ok: true,
      duplicate: false,
      deliveryId,
      status: 'skipped',
      renderedSubject: rendered.subject,
      renderedBody: rendered.body,
      providerMessageId: null,
      errorMessage: null,
    };
  }

  await setPlatformDispatchSenderIfNull(params.pool, deliveryId, outbound.ownerUserId);
  await updatePlatformDeliveryOutcome(params.pool, deliveryId, {
    status: 'processing',
    errorMessage: null,
    providerMessageId: null,
    sentAt: null,
  });

  const send = await dispatchPlatformWhatsAppText({
    instanceToken: outbound.instanceToken,
    phone: params.recipientPhone,
    text: rendered.body,
  });

  const durationMs = Date.now() - t0;

  if (send.ok) {
    await clearPlatformOutboundDeliveryRetrySchedule(params.pool, deliveryId);
    const attemptNo = await getNextPlatformDeliveryAttemptNumber(params.pool, deliveryId);
    await updatePlatformDeliveryOutcome(params.pool, deliveryId, {
      status: 'sent',
      errorMessage: null,
      providerMessageId: send.providerMessageId,
      sentAt: new Date(),
    });
    await insertPlatformDeliveryAttempt(params.pool, {
      deliveryId,
      attemptNumber: attemptNo,
      status: 'success',
      errorMessage: null,
      providerResponse: { provider_message_id: send.providerMessageId },
      durationMs,
    });
    const meta =
      params.metadata && typeof params.metadata === 'object' && !Array.isArray(params.metadata)
        ? (params.metadata as Record<string, unknown>)
        : {};
    await tryPlatformBillingPixWhatsappFollowupAfterText({
      pool: params.pool,
      instanceToken: outbound.instanceToken,
      phone: params.recipientPhone,
      eventKey: params.eventKey,
      channel,
      locale: DEFAULT_LOCALE,
      metadata: meta,
      entityType: params.entityType,
      entityId: params.entityId,
    });
    return {
      ok: true,
      duplicate: false,
      deliveryId,
      status: 'sent',
      renderedSubject: rendered.subject,
      renderedBody: rendered.body,
      providerMessageId: send.providerMessageId,
      errorMessage: null,
    };
  }

  const failedAttemptNumber = await getNextPlatformDeliveryAttemptNumber(params.pool, deliveryId);
  await recordPlatformAttemptAndHandleSendFailure({
    pool: params.pool,
    deliveryId,
    errorMessage: send.error,
    durationMs,
    failedAttemptNumber,
  });

  const after = await params.pool.query<{ status: string }>(
    `SELECT status FROM platform_notification_deliveries WHERE id = $1`,
    [deliveryId],
  );
  const st = after.rows[0]?.status ?? 'failed';

  return {
    ok: true,
    duplicate: false,
    deliveryId,
    status: st,
    renderedSubject: rendered.subject,
    renderedBody: rendered.body,
    providerMessageId: null,
    errorMessage: send.error,
  };
}

export async function simulatePlatformNotification(params: {
  pool: Pool;
  targetTenantId: string;
  senderUserId: string;
  eventKey: string;
  recipientPhone: string;
  mergeContext: Record<string, string>;
  idempotencyKey?: string;
}): Promise<PlatformSimulateResult> {
  const idem = params.idempotencyKey?.trim() || `simulate:${params.eventKey}:${randomUUID()}`;
  return runPlatformTransactionalNotification({
    pool: params.pool,
    targetTenantId: params.targetTenantId,
    eventKey: params.eventKey,
    entityType: 'simulate',
    entityId: null,
    idempotencyKey: idem,
    recipientPhone: params.recipientPhone,
    recipientType: 'tenant_admin',
    mergeContext: params.mergeContext,
    eventOccurredAt: new Date(),
    actor: { type: 'super_admin', user_id: params.senderUserId },
    metadata: { engine: 'platform_notifications', phase: 2, simulate: true },
  });
}
