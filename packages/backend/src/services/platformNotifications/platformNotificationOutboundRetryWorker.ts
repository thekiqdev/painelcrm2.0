/**
 * Fila/retry de entregas WhatsApp do motor da PLATAFORMA (domínio separado do tenant).
 */
import type { Pool } from 'pg';
import { pool, withBillingWorkerRlsBypass } from '../../utils/db.js';
import {
  getPlatformOutboundDeliveryForDispatch,
  listPlatformDeliveriesDueForRetry,
  insertPlatformDeliveryAttempt,
  updatePlatformDeliveryOutcome,
  getNextPlatformDeliveryAttemptNumber,
  clearPlatformOutboundDeliveryRetrySchedule,
  setPlatformDispatchSenderIfNull,
  schedulePlatformOutboundDeliveryRetry,
} from './platformNotificationEngineRepository.js';
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
import { resolvePlatformWhatsAppOutboundReady } from './platformNotificationDispatchContext.js';

function computeRetryDelayMs(failedAttemptNumber: number): number {
  const base = getPlatformNotificationsRetryBaseMs();
  const exp = Math.min(8, Math.max(0, failedAttemptNumber - 1));
  return Math.min(600_000, Math.round(base * Math.pow(2, exp)));
}

async function redispatchOnePlatform(p: Pool, deliveryId: string): Promise<void> {
  if (!isPlatformNotificationsEnabled()) return;

  const row = await getPlatformOutboundDeliveryForDispatch(p, deliveryId);
  if (!row || row.channel !== 'whatsapp') return;

  if (row.dispatch_not_before && row.dispatch_not_before.getTime() > Date.now()) {
    pnLogWarn('platform_outbound_worker_skip_not_yet_due', {
      delivery_id: deliveryId,
      target_tenant_id: row.target_tenant_id,
      dispatch_not_before: row.dispatch_not_before.toISOString(),
    });
    return;
  }

  const outbound = await resolvePlatformWhatsAppOutboundReady(p);
  if (!outbound) {
    await updatePlatformDeliveryOutcome(p, deliveryId, {
      status: 'failed',
      errorMessage:
        'Remetente WhatsApp da plataforma indisponível (instância desligada ou não designada; retry abortado).',
      providerMessageId: null,
      sentAt: null,
    });
    const a = await getNextPlatformDeliveryAttemptNumber(p, deliveryId);
    await insertPlatformDeliveryAttempt(p, {
      deliveryId,
      attemptNumber: a,
      status: 'failed',
      errorMessage: 'Remetente WhatsApp da plataforma indisponível.',
      providerResponse: { class: 'definitive', via: 'platform_retry_worker' },
      durationMs: null,
    });
    return;
  }

  if (!isPlatformNotificationsWhatsAppSendEnabled()) {
    await updatePlatformDeliveryOutcome(p, deliveryId, {
      status: 'skipped',
      errorMessage: null,
      providerMessageId: null,
      sentAt: null,
    });
    const a = await getNextPlatformDeliveryAttemptNumber(p, deliveryId);
    await insertPlatformDeliveryAttempt(p, {
      deliveryId,
      attemptNumber: a,
      status: 'skipped',
      errorMessage: 'PLATFORM_NOTIFICATIONS_WHATSAPP_SEND_ENABLED=false',
      providerResponse: { reason: 'send_disabled_mid_retry', via: 'platform_retry_worker' },
      durationMs: null,
    });
    return;
  }

  const sender = row.dispatch_sender_user_id ?? outbound.ownerUserId;
  await setPlatformDispatchSenderIfNull(p, deliveryId, sender);
  await updatePlatformDeliveryOutcome(p, deliveryId, {
    status: 'processing',
    errorMessage: null,
    providerMessageId: null,
    sentAt: null,
  });

  pnLogInfo('platform_outbound_worker_dispatch_start', {
    delivery_id: deliveryId,
    target_tenant_id: row.target_tenant_id,
    event_key: row.event_key,
    retry_count: row.retry_count,
    had_retry_schedule: row.next_retry_at != null,
  });

  const t0 = Date.now();
  const send = await dispatchPlatformWhatsAppText({
    instanceToken: outbound.instanceToken,
    phone: row.recipient_address,
    text: row.rendered_body,
  });
  const durationMs = Date.now() - t0;

  if (send.ok) {
    await clearPlatformOutboundDeliveryRetrySchedule(p, deliveryId);
    const attemptNo = await getNextPlatformDeliveryAttemptNumber(p, deliveryId);
    await updatePlatformDeliveryOutcome(p, deliveryId, {
      status: 'sent',
      errorMessage: null,
      providerMessageId: send.providerMessageId,
      sentAt: new Date(),
    });
    await insertPlatformDeliveryAttempt(p, {
      deliveryId,
      attemptNumber: attemptNo,
      status: 'success',
      errorMessage: null,
      providerResponse: { provider_message_id: send.providerMessageId, via: 'platform_retry_worker' },
      durationMs,
    });
    await tryPlatformBillingPixWhatsappFollowupAfterText({
      pool: p,
      instanceToken: outbound.instanceToken,
      phone: row.recipient_address,
      eventKey: row.event_key,
      channel: row.channel,
      locale: 'pt-BR',
      metadata: row.metadata,
      entityType: row.entity_type,
      entityId: row.entity_id,
    });
    return;
  }

  const errClass = classifyWhatsAppDispatchError(send.error);
  const maxAttempts = getPlatformNotificationsWhatsAppMaxSendAttempts();
  const failedAttemptNumber = await getNextPlatformDeliveryAttemptNumber(p, deliveryId);

  await insertPlatformDeliveryAttempt(p, {
    deliveryId,
    attemptNumber: failedAttemptNumber,
    status: errClass === 'transient' ? 'failed_transient' : 'failed',
    errorMessage: send.error,
    providerResponse: { class: errClass, via: 'platform_retry_worker' },
    durationMs,
  });

  if (errClass === 'transient' && failedAttemptNumber < maxAttempts) {
    const delay = computeRetryDelayMs(failedAttemptNumber);
    const nextAt = new Date(Date.now() + delay);
    await schedulePlatformOutboundDeliveryRetry(p, {
      deliveryId,
      errorMessage: send.error,
      nextRetryAt: nextAt,
    });
    pnLogWarn('platform_retry_worker_transient_rescheduled', {
      delivery_id: deliveryId,
      attempt: failedAttemptNumber,
      next_retry_at: nextAt.toISOString(),
    });
    return;
  }

  await updatePlatformDeliveryOutcome(p, deliveryId, {
    status: 'failed',
    errorMessage: send.error,
    providerMessageId: null,
    sentAt: null,
  });
}

export async function processPlatformNotificationOutboundRetriesBatch(limit: number): Promise<{ processed: number }> {
  if (!isPlatformNotificationsEnabled()) {
    return { processed: 0 };
  }
  return withBillingWorkerRlsBypass(async () => {
    const ids = await listPlatformDeliveriesDueForRetry(pool, limit);
    let processed = 0;
    for (const row of ids) {
      try {
        await redispatchOnePlatform(pool, row.id);
        processed += 1;
      } catch (e) {
        console.error('[platform-notifications/retry] batch item', row.id, e);
      }
    }
    return { processed };
  });
}
