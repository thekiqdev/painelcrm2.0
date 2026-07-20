import type { Pool } from 'pg';
import {
  getEventByKey,
  getSystemTemplate,
  getTenantOverride,
  getTenantPreference,
  insertDelivery,
  insertDeliveryAttempt,
  updateDeliveryOutcome,
  getNextDeliveryAttemptNumber,
  scheduleOutboundDeliveryRetry,
  setDispatchSenderIfNull,
  setDispatchChatInstanceIfNull,
  clearOutboundDeliveryRetrySchedule,
} from './notificationEngineRepository.js';
import { renderStrictTemplates } from './strictMergeRenderer.js';
import { dispatchWhatsAppText } from './whatsappChannelDispatcher.js';
import {
  isNotificationsEngineWhatsAppSendEnabled,
  getNotificationsEngineWhatsAppMaxSendAttempts,
  getNotificationsEngineRetryBaseMs,
} from '../../config/notificationsEngineEnv.js';
import { classifyWhatsAppDispatchError } from './whatsappDispatchErrorClassifier.js';
import { neLogInfo, neLogWarn } from './notificationEngineLog.js';
import { resolveInvoiceTransactionalDispatchNotBefore } from './notificationTenantOutboundDispatchSchedule.js';

const DEFAULT_LOCALE = 'pt-BR';

export type SimulateSuccess = {
  ok: true;
  duplicate: boolean;
  /** Null apenas quando a preferência do tenant bloqueia antes de criar entrega. */
  deliveryId: string | null;
  status: string;
  renderedSubject: string | null;
  renderedBody: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  skipReason?: 'tenant_preference_disabled';
};

export type SimulateResult = SimulateSuccess | { ok: false; error: string; details?: unknown };

export function isSkippedByTenantPreference(result: SimulateResult): boolean {
  return result.ok === true && result.skipReason === 'tenant_preference_disabled';
}

function computeRetryDelayMs(failedAttemptNumber: number): number {
  const base = getNotificationsEngineRetryBaseMs();
  const exp = Math.min(8, Math.max(0, failedAttemptNumber - 1));
  return Math.min(600_000, Math.round(base * Math.pow(2, exp)));
}

async function recordAttemptAndHandleSendFailure(params: {
  pool: Pool;
  deliveryId: string;
  errorMessage: string;
  durationMs: number;
  failedAttemptNumber: number;
}): Promise<void> {
  const errClass = classifyWhatsAppDispatchError(params.errorMessage);
  const maxAttempts = getNotificationsEngineWhatsAppMaxSendAttempts();

  await insertDeliveryAttempt(params.pool, {
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
    await scheduleOutboundDeliveryRetry(params.pool, {
      deliveryId: params.deliveryId,
      errorMessage: params.errorMessage,
      nextRetryAt: nextAt,
    });
    neLogWarn('send_transient_retry_scheduled', {
      delivery_id: params.deliveryId,
      attempt: params.failedAttemptNumber,
      max_attempts: maxAttempts,
      next_retry_at: nextAt.toISOString(),
      delay_ms: delay,
    });
    return;
  }

  await updateDeliveryOutcome(params.pool, params.deliveryId, {
    status: 'failed',
    errorMessage: params.errorMessage,
    providerMessageId: null,
    sentAt: null,
  });
  neLogWarn('send_failed_final', {
    delivery_id: params.deliveryId,
    attempt: params.failedAttemptNumber,
    class: errClass,
    max_attempts: maxAttempts,
  });
}

/** Pipeline partilhado: simulação (Fase 2) e eventos de negócio (Fase 3). */
export async function runTransactionalNotification(params: {
  pool: Pool;
  tenantId: string;
  senderUserId: string;
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
  /** WR1: instância explícita (routing de faturas). */
  chatInstanceId?: string | null;
}): Promise<SimulateResult> {
  const event = await getEventByKey(params.pool, params.eventKey);
  if (!event || !event.is_active) {
    return { ok: false, error: 'Evento não encontrado ou inativo.' };
  }

  const pref = await getTenantPreference(params.pool, params.tenantId, params.eventKey);
  if (pref && pref.enabled === false) {
    neLogInfo('notification_skipped_by_tenant_preference', {
      tenant_id: params.tenantId,
      event_key: params.eventKey,
      channel: pref.primary_channel ?? null,
    });
    return {
      ok: true,
      duplicate: false,
      deliveryId: null,
      status: 'skipped',
      renderedSubject: null,
      renderedBody: '',
      providerMessageId: null,
      errorMessage: null,
      skipReason: 'tenant_preference_disabled',
    };
  }

  const channel = pref?.primary_channel || event.default_channel;

  if (channel !== 'whatsapp') {
    return {
      ok: false,
      error: 'Motor: apenas canal whatsapp suportado para processamento.',
      details: { resolved_channel: channel },
    };
  }

  const systemTpl = await getSystemTemplate(params.pool, params.eventKey, channel, DEFAULT_LOCALE);
  if (!systemTpl) {
    return { ok: false, error: 'Template sistema não encontrado para evento/canal/locale.' };
  }

  const override = await getTenantOverride(
    params.pool,
    params.tenantId,
    params.eventKey,
    channel,
    DEFAULT_LOCALE,
  );

  const subjectTpl = override?.subject_template ?? systemTpl.subject_template;
  const bodyTpl = override?.body_template ?? systemTpl.body_template;

  const rendered = renderStrictTemplates({
    subjectTemplate: subjectTpl,
    bodyTemplate: bodyTpl,
    context: params.mergeContext,
    allowedMergeFields: event.merge_field_list,
  });

  if (!rendered.ok) {
    neLogWarn('render_strict_failed', {
      tenant_id: params.tenantId,
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

  const dispatchNotBefore = await resolveInvoiceTransactionalDispatchNotBefore({
    tenantId: params.tenantId,
    eventKey: params.eventKey,
    eventOccurredAt: params.eventOccurredAt,
  });

  const metadataWithSchedule = {
    ...params.metadata,
    ...(dispatchNotBefore != null
      ? { outbound_dispatch_not_before: dispatchNotBefore.toISOString() }
      : {}),
  };

  const { created, row: deliveryRow } = await insertDelivery(params.pool, {
    tenantId: params.tenantId,
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
    metadata: metadataWithSchedule,
    eventOccurredAt: params.eventOccurredAt,
    dispatchSenderUserId: params.senderUserId,
    dispatchNotBefore,
  });

  if (!created) {
    neLogInfo('idempotent_duplicate', {
      tenant_id: params.tenantId,
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

  const firstDue =
    !dispatchNotBefore || dispatchNotBefore.getTime() <= Date.now();
  if (!firstDue) {
    neLogInfo('outbound_first_dispatch_deferred', {
      tenant_id: params.tenantId,
      event_key: params.eventKey,
      delivery_id: deliveryId,
      dispatch_not_before: dispatchNotBefore!.toISOString(),
      schedule_source: 'tenant_invoice_notify_time_local',
    });
    return {
      ok: true,
      duplicate: false,
      deliveryId,
      status: 'queued',
      renderedSubject: rendered.subject,
      renderedBody: rendered.body,
      providerMessageId: null,
      errorMessage: null,
    };
  }

  if (!isNotificationsEngineWhatsAppSendEnabled()) {
    await updateDeliveryOutcome(params.pool, deliveryId, {
      status: 'skipped',
      errorMessage: null,
      providerMessageId: null,
      sentAt: null,
    });
    await insertDeliveryAttempt(params.pool, {
      deliveryId,
      attemptNumber: 1,
      status: 'skipped',
      errorMessage: 'NOTIFICATIONS_ENGINE_WHATSAPP_SEND_ENABLED=false',
      providerResponse: { reason: 'send_disabled_by_flag' },
      durationMs: Date.now() - t0,
    });
    neLogInfo('send_skipped_flag', { delivery_id: deliveryId, tenant_id: params.tenantId });
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

  await setDispatchSenderIfNull(params.pool, deliveryId, params.senderUserId);
  if (params.chatInstanceId) {
    await setDispatchChatInstanceIfNull(params.pool, deliveryId, params.chatInstanceId);
  }
  await updateDeliveryOutcome(params.pool, deliveryId, {
    status: 'processing',
    errorMessage: null,
    providerMessageId: null,
    sentAt: null,
  });

  const send = await dispatchWhatsAppText({
    pool: params.pool,
    tenantId: params.tenantId,
    senderUserId: params.senderUserId,
    phone: params.recipientPhone,
    text: rendered.body,
    chatInstanceId: params.chatInstanceId ?? null,
  });

  if (send.ok) {
    if (send.chatInstanceId) {
      await setDispatchChatInstanceIfNull(params.pool, deliveryId, send.chatInstanceId);
    }
    await clearOutboundDeliveryRetrySchedule(params.pool, deliveryId);
    const attemptNo = await getNextDeliveryAttemptNumber(params.pool, deliveryId);
    await updateDeliveryOutcome(params.pool, deliveryId, {
      status: 'sent',
      errorMessage: null,
      providerMessageId: send.providerMessageId,
      sentAt: new Date(),
    });
    await insertDeliveryAttempt(params.pool, {
      deliveryId,
      attemptNumber: attemptNo,
      status: 'success',
      errorMessage: null,
      providerResponse: { provider_message_id: send.providerMessageId },
      durationMs,
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

  const failedAttemptNumber = await getNextDeliveryAttemptNumber(params.pool, deliveryId);
  await recordAttemptAndHandleSendFailure({
    pool: params.pool,
    deliveryId,
    errorMessage: send.error,
    durationMs,
    failedAttemptNumber,
  });

  const after = await params.pool.query<{ status: string }>(
    `SELECT status FROM notification_outbound_deliveries WHERE id = $1`,
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

export async function simulateTransactionalNotification(params: {
  pool: Pool;
  tenantId: string;
  senderUserId: string;
  eventKey: string;
  entityType: string;
  entityId: string | null;
  idempotencyKey: string;
  recipientPhone: string;
  recipientType: string;
  mergeContext: Record<string, string>;
  eventOccurredAt: Date | null;
}): Promise<SimulateResult> {
  return runTransactionalNotification({
    ...params,
    actor: { type: 'user', user_id: params.senderUserId },
    metadata: { engine: 'notifications_engine', phase: 2, simulate: true },
  });
}
