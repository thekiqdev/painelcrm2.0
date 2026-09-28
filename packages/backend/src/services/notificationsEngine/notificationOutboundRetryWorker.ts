/**
 * Outbound WhatsApp: primeira entrega quando `dispatch_not_before` vence e retries (`next_retry_at`).
 */
import type { Pool } from 'pg';
import { pool, withBillingWorkerRlsBypass } from '../../utils/db.js';
import {
  getOutboundDeliveryForDispatch,
  listDeliveriesDueForRetry,
  insertDeliveryAttempt,
  updateDeliveryOutcome,
  getNextDeliveryAttemptNumber,
  clearOutboundDeliveryRetrySchedule,
  setDispatchSenderIfNull,
  setDispatchChatInstanceIfNull,
  scheduleOutboundDeliveryRetry,
} from './notificationEngineRepository.js';
import { dispatchWhatsAppText } from './whatsappChannelDispatcher.js';
import { resolveWhatsAppSenderUserIdForTenant } from './whatsappSenderResolve.js';
import { resolveWhatsAppRoutingForEventKey } from './whatsappInstanceRoutingService.js';
import {
  isNotificationsEngineEnabled,
  isNotificationsEngineWhatsAppSendEnabled,
  getNotificationsEngineWhatsAppMaxSendAttempts,
  getNotificationsEngineRetryBaseMs,
} from '../../config/notificationsEngineEnv.js';
import { classifyWhatsAppDispatchError } from './whatsappDispatchErrorClassifier.js';
import { neLogError, neLogInfo, neLogWarn } from './notificationEngineLog.js';

function computeRetryDelayMs(failedAttemptNumber: number): number {
  const base = getNotificationsEngineRetryBaseMs();
  const exp = Math.min(8, Math.max(0, failedAttemptNumber - 1));
  return Math.min(600_000, Math.round(base * Math.pow(2, exp)));
}

async function redispatchOne(p: Pool, deliveryId: string): Promise<void> {
  if (!isNotificationsEngineEnabled()) return;

  const row = await getOutboundDeliveryForDispatch(p, deliveryId);
  if (!row || row.channel !== 'whatsapp') return;

  if (row.dispatch_not_before && row.dispatch_not_before.getTime() > Date.now()) {
    neLogWarn('outbound_worker_skip_not_yet_due', {
      delivery_id: deliveryId,
      tenant_id: row.tenant_id,
      event_key: row.event_key,
      dispatch_not_before: row.dispatch_not_before.toISOString(),
    });
    return;
  }

  if (!isNotificationsEngineWhatsAppSendEnabled()) {
    await updateDeliveryOutcome(p, deliveryId, {
      status: 'skipped',
      errorMessage: null,
      providerMessageId: null,
      sentAt: null,
    });
    const a = await getNextDeliveryAttemptNumber(p, deliveryId);
    await insertDeliveryAttempt(p, {
      deliveryId,
      attemptNumber: a,
      status: 'skipped',
      errorMessage: 'NOTIFICATIONS_ENGINE_WHATSAPP_SEND_ENABLED=false',
      providerResponse: { reason: 'send_disabled_mid_retry' },
      durationMs: null,
    });
    return;
  }

  let sender =
    row.dispatch_sender_user_id ??
    (await resolveWhatsAppSenderUserIdForTenant(p, row.tenant_id, null));
  let chatInstanceId: string | null = row.dispatch_chat_instance_id ?? null;

  // Sticky instance: confirma que ainda pertence ao tenant; senão cai no routing atual.
  if (chatInstanceId) {
    const still = await p.query<{ sender_user_id: string }>(
      `SELECT i.user_id::text AS sender_user_id
       FROM chat_instances i
       INNER JOIN users u ON u.id = i.user_id
       WHERE i.id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [chatInstanceId, row.tenant_id],
    );
    if (still.rows[0]) {
      sender = still.rows[0].sender_user_id;
    } else {
      neLogWarn('retry_sticky_instance_orphan', {
        delivery_id: deliveryId,
        tenant_id: row.tenant_id,
        dispatch_chat_instance_id: chatInstanceId,
      });
      chatInstanceId = null;
    }
  }

  if (!chatInstanceId) {
    const routed = await resolveWhatsAppRoutingForEventKey(p, row.tenant_id, row.event_key);
    if (routed) {
      sender = routed.sender_user_id;
      chatInstanceId = routed.chat_instance_id;
    }
  }

  if (!sender) {
    await updateDeliveryOutcome(p, deliveryId, {
      status: 'failed',
      errorMessage: 'Sem remetente WhatsApp para retry.',
      providerMessageId: null,
      sentAt: null,
    });
    const a = await getNextDeliveryAttemptNumber(p, deliveryId);
    await insertDeliveryAttempt(p, {
      deliveryId,
      attemptNumber: a,
      status: 'failed',
      errorMessage: 'Sem remetente WhatsApp para retry.',
      providerResponse: { class: 'definitive' },
      durationMs: null,
    });
    neLogWarn('retry_no_sender', { delivery_id: deliveryId, tenant_id: row.tenant_id });
    return;
  }

  await setDispatchSenderIfNull(p, deliveryId, sender);
  if (chatInstanceId) {
    await setDispatchChatInstanceIfNull(p, deliveryId, chatInstanceId);
  }
  await updateDeliveryOutcome(p, deliveryId, {
    status: 'processing',
    errorMessage: null,
    providerMessageId: null,
    sentAt: null,
  });

  neLogInfo('outbound_worker_dispatch_start', {
    delivery_id: deliveryId,
    tenant_id: row.tenant_id,
    event_key: row.event_key,
    retry_count: row.retry_count,
    had_retry_schedule: row.next_retry_at != null,
    sticky_chat_instance_id: chatInstanceId,
  });

  const t0 = Date.now();
  const send = await dispatchWhatsAppText({
    pool: p,
    tenantId: row.tenant_id,
    senderUserId: sender,
    phone: row.recipient_address,
    text: row.rendered_body,
    chatInstanceId,
  });
  if (send.ok && send.chatInstanceId) {
    await setDispatchChatInstanceIfNull(p, deliveryId, send.chatInstanceId);
  }
  const durationMs = Date.now() - t0;

  if (send.ok) {
    await clearOutboundDeliveryRetrySchedule(p, deliveryId);
    const attemptNo = await getNextDeliveryAttemptNumber(p, deliveryId);
    await updateDeliveryOutcome(p, deliveryId, {
      status: 'sent',
      errorMessage: null,
      providerMessageId: send.providerMessageId,
      sentAt: new Date(),
    });
    await insertDeliveryAttempt(p, {
      deliveryId,
      attemptNumber: attemptNo,
      status: 'success',
      errorMessage: null,
      providerResponse: { provider_message_id: send.providerMessageId, via: 'retry_worker' },
      durationMs,
    });
    return;
  }

  const errClass = classifyWhatsAppDispatchError(send.error);
  const maxAttempts = getNotificationsEngineWhatsAppMaxSendAttempts();
  const failedAttemptNumber = await getNextDeliveryAttemptNumber(p, deliveryId);

  if (send.chatInstanceId) {
    await setDispatchChatInstanceIfNull(p, deliveryId, send.chatInstanceId);
  }

  await insertDeliveryAttempt(p, {
    deliveryId,
    attemptNumber: failedAttemptNumber,
    status: errClass === 'transient' ? 'failed_transient' : 'failed',
    errorMessage: send.error,
    providerResponse: {
      class: errClass,
      via: 'retry_worker',
      ...(send.chatInstanceId ? { chat_instance_id: send.chatInstanceId } : {}),
    },
    durationMs,
  });

  neLogWarn('whatsapp_dispatch_failed', {
    delivery_id: deliveryId,
    tenant_id: row.tenant_id,
    event_key: row.event_key,
    chat_instance_id: send.chatInstanceId ?? chatInstanceId ?? null,
    error: send.error.slice(0, 240),
    class: errClass,
    attempt: failedAttemptNumber,
    max_attempts: maxAttempts,
    via: 'retry_worker',
  });

  if (errClass === 'transient' && failedAttemptNumber < maxAttempts) {
    const delay = computeRetryDelayMs(failedAttemptNumber);
    const nextAt = new Date(Date.now() + delay);
    await scheduleOutboundDeliveryRetry(p, {
      deliveryId,
      errorMessage: send.error,
      nextRetryAt: nextAt,
    });
    neLogWarn('retry_worker_transient_rescheduled', {
      delivery_id: deliveryId,
      tenant_id: row.tenant_id,
      event_key: row.event_key,
      chat_instance_id: send.chatInstanceId ?? chatInstanceId ?? null,
      attempt: failedAttemptNumber,
      max_attempts: maxAttempts,
      next_retry_at: nextAt.toISOString(),
      error_class: errClass,
    });
    return;
  }

  await updateDeliveryOutcome(p, deliveryId, {
    status: 'failed',
    errorMessage: send.error,
    providerMessageId: null,
    sentAt: null,
  });
}

export async function processNotificationOutboundRetriesBatch(limit: number): Promise<{ processed: number }> {
  if (!isNotificationsEngineEnabled()) {
    return { processed: 0 };
  }
  return withBillingWorkerRlsBypass(async () => {
    const ids = await listDeliveriesDueForRetry(pool, limit);
    let processed = 0;
    for (const row of ids) {
      try {
        await redispatchOne(pool, row.id);
        processed += 1;
      } catch (e) {
        neLogError('retry_batch_item', { delivery_id: row.id }, e);
      }
    }
    return { processed };
  });
}
