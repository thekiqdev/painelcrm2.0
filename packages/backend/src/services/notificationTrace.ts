/**
 * BILLING V2 Fase 1B — rastreamento completo do Notification Engine.
 * Prefixo: [NOTIFICATION_TRACE]
 */
import { safeNowIso } from '../utils/billingSafeDate.js';

export type NotificationTraceEvent =
  | 'NOTIFICATION_START'
  | 'NOTIFICATION_QUEUE'
  | 'NOTIFICATION_SENT'
  | 'NOTIFICATION_DELIVERED'
  | 'NOTIFICATION_FAILED'
  | 'NOTIFICATION_RETRY'
  | 'NOTIFICATION_SKIPPED'
  | 'NOTIFICATION_SUPPRESSED';

export type NotificationTracePayload = {
  event: NotificationTraceEvent;
  notification_id?: string | null;
  invoice_id?: string | null;
  subscription_id?: string | null;
  tenant_id?: string | null;
  channel?: string | null;
  provider?: string | null;
  attempt?: number | null;
  latency_ms?: number | null;
  result?: string | null;
  reason?: string | null;
  origin_kind?: string | null;
  error?: string | null;
};

export function traceNotification(payload: NotificationTracePayload): void {
  console.log(
    '[NOTIFICATION_TRACE]',
    JSON.stringify({
      ts: safeNowIso(),
      ...payload,
    })
  );
}
