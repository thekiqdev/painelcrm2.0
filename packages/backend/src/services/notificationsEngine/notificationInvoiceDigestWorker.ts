/**
 * Digest CRM invoice.due_soon / invoice.overdue.
 * Roda com o motor ligado (sem flag opt-in). Preferência do tenant (default ON) + recipient_policy.
 * Overdue: 1.º aviso + repetições opcionais (seq:N).
 */
import { pool, withBillingWorkerRlsBypass } from '../../utils/db.js';
import {
  isNotificationsEngineEnabled,
  isNotificationsEngineBusinessEventsEnabled,
  isNotificationsEngineInvoiceDigestEnabled,
  isBusinessNotificationEventKeyAllowed,
} from '../../config/notificationsEngineEnv.js';
import { notifyInvoiceDueSoon, notifyInvoiceOverdue } from '../invoiceNotificationsService.js';
import { listOverdueDigestDeliveriesForInvoices } from './notificationEngineRepository.js';
import { neLogError, neLogInfo } from './notificationEngineLog.js';
import {
  isDueSoonEligibleOnLocalDay,
  localYmdInZone,
  overdueDigestIdempotencySuffix,
  parseInvoiceDueSoonSchedule,
  parseInvoiceOverdueSchedule,
  parseOverdueDigestSeqFromIdempotencyKey,
  resolveNextOverdueDigestSend,
} from './invoiceDigestSchedulePolicy.js';

type DigestCandidateRow = {
  id: string;
  tenant_id: string;
  due_date: string;
  tenant_today: string;
  timezone_effective: string;
  pref_enabled: boolean | null;
  recipient_policy: unknown;
};

function aggregateOverdueSendState(
  rows: { entity_id: string; idempotency_key: string; created_at: Date }[],
  timeZone: string,
): Map<string, { maxSeq: number; lastSendYmd: string | null }> {
  const map = new Map<string, { maxSeq: number; lastSendYmd: string | null; lastAt: number }>();
  for (const row of rows) {
    const seq = parseOverdueDigestSeqFromIdempotencyKey(row.idempotency_key) ?? 1;
    const at = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
    const prev = map.get(row.entity_id);
    if (!prev) {
      map.set(row.entity_id, {
        maxSeq: seq,
        lastSendYmd: localYmdInZone(at, timeZone),
        lastAt: at.getTime(),
      });
      continue;
    }
    if (seq > prev.maxSeq) prev.maxSeq = seq;
    if (at.getTime() >= prev.lastAt) {
      prev.lastAt = at.getTime();
      prev.lastSendYmd = localYmdInZone(at, timeZone);
    }
  }
  const out = new Map<string, { maxSeq: number; lastSendYmd: string | null }>();
  for (const [id, v] of map) {
    out.set(id, { maxSeq: v.maxSeq, lastSendYmd: v.lastSendYmd });
  }
  return out;
}

export async function processInvoiceNotificationDigestBatch(
  maxPerKind: number,
): Promise<{ due_soon: number; overdue: number }> {
  if (
    !isNotificationsEngineEnabled() ||
    !isNotificationsEngineBusinessEventsEnabled() ||
    !isNotificationsEngineInvoiceDigestEnabled()
  ) {
    return { due_soon: 0, overdue: 0 };
  }

  return withBillingWorkerRlsBypass(async () => {
    let dueSoon = 0;
    let overdue = 0;

    if (isBusinessNotificationEventKeyAllowed('invoice.due_soon')) {
      const rs = await pool.query<DigestCandidateRow>(
        `WITH tenant_day AS (
           SELECT
             t.id AS tenant_id,
             COALESCE(NULLIF(trim(t.timezone), ''), 'America/Sao_Paulo') AS timezone_effective,
             (timezone(
                COALESCE(NULLIF(trim(t.timezone), ''), 'America/Sao_Paulo'),
                now()
              ))::date AS tenant_today
           FROM tenants t
         )
         SELECT ci.id::text AS id,
                ci.tenant_id::text AS tenant_id,
                ci.due_date::text AS due_date,
                td.tenant_today::text AS tenant_today,
                td.timezone_effective,
                p.enabled AS pref_enabled,
                COALESCE(p.recipient_policy, '{}'::jsonb) AS recipient_policy
         FROM customer_invoices ci
         INNER JOIN tenant_day td ON td.tenant_id = ci.tenant_id
         LEFT JOIN tenant_notification_preferences p
           ON p.tenant_id = ci.tenant_id AND p.event_key = 'invoice.due_soon'
         WHERE ci.client_id IS NOT NULL
           AND ci.status IN ('pending', 'waiting_payment', 'processing')
           AND COALESCE(p.enabled, true) = true
           AND ci.due_date::date >= td.tenant_today
           AND ci.due_date::date <= td.tenant_today + 60
         ORDER BY ci.due_date ASC
         LIMIT $1`,
        [Math.max(maxPerKind * 4, 200)],
      );

      let taken = 0;
      for (const row of rs.rows) {
        if (taken >= maxPerKind) break;
        const schedule = parseInvoiceDueSoonSchedule(row.recipient_policy);
        const dueYmd = String(row.due_date).slice(0, 10);
        const todayYmd = String(row.tenant_today).slice(0, 10);
        if (
          !isDueSoonEligibleOnLocalDay({
            dueDateYmd: dueYmd,
            tenantTodayYmd: todayYmd,
            daysBefore: schedule.days_before,
          })
        ) {
          continue;
        }
        notifyInvoiceDueSoon({
          tenantId: row.tenant_id,
          invoiceId: row.id,
          idempotencyDay: todayYmd,
          preferredSenderUserId: null,
          publishOutboundDigest: true,
        });
        dueSoon += 1;
        taken += 1;
      }
    }

    if (isBusinessNotificationEventKeyAllowed('invoice.overdue')) {
      const ro = await pool.query<DigestCandidateRow>(
        `WITH tenant_day AS (
           SELECT
             t.id AS tenant_id,
             COALESCE(NULLIF(trim(t.timezone), ''), 'America/Sao_Paulo') AS timezone_effective,
             (timezone(
                COALESCE(NULLIF(trim(t.timezone), ''), 'America/Sao_Paulo'),
                now()
              ))::date AS tenant_today
           FROM tenants t
         )
         SELECT ci.id::text AS id,
                ci.tenant_id::text AS tenant_id,
                ci.due_date::text AS due_date,
                td.tenant_today::text AS tenant_today,
                td.timezone_effective,
                p.enabled AS pref_enabled,
                COALESCE(p.recipient_policy, '{}'::jsonb) AS recipient_policy
         FROM customer_invoices ci
         INNER JOIN tenant_day td ON td.tenant_id = ci.tenant_id
         LEFT JOIN tenant_notification_preferences p
           ON p.tenant_id = ci.tenant_id AND p.event_key = 'invoice.overdue'
         WHERE ci.client_id IS NOT NULL
           AND ci.status IN ('pending', 'waiting_payment', 'processing', 'overdue')
           AND COALESCE(p.enabled, true) = true
           AND ci.due_date::date <= td.tenant_today
           AND ci.due_date::date >= td.tenant_today - 90
         ORDER BY ci.due_date DESC
         LIMIT $1`,
        [Math.max(maxPerKind * 4, 200)],
      );

      // Agrupa por tenant para 1 query de deliveries.
      const byTenant = new Map<string, DigestCandidateRow[]>();
      for (const row of ro.rows) {
        const list = byTenant.get(row.tenant_id) ?? [];
        list.push(row);
        byTenant.set(row.tenant_id, list);
      }

      let taken = 0;
      for (const [tenantId, candidates] of byTenant) {
        if (taken >= maxPerKind) break;
        const tz = candidates[0]?.timezone_effective || 'America/Sao_Paulo';
        const ids = candidates.map((c) => c.id);
        const deliveries = await listOverdueDigestDeliveriesForInvoices(pool, tenantId, ids);
        const stateByInvoice = aggregateOverdueSendState(deliveries, tz);

        for (const row of candidates) {
          if (taken >= maxPerKind) break;
          const schedule = parseInvoiceOverdueSchedule(row.recipient_policy);
          const dueYmd = String(row.due_date).slice(0, 10);
          const todayYmd = String(row.tenant_today).slice(0, 10);
          const state = stateByInvoice.get(row.id) ?? { maxSeq: 0, lastSendYmd: null };
          const next = resolveNextOverdueDigestSend({
            schedule,
            dueDateYmd: dueYmd,
            tenantTodayYmd: todayYmd,
            maxSeqAlready: state.maxSeq,
            lastSendYmd: state.lastSendYmd,
          });
          if (!next) continue;

          notifyInvoiceOverdue({
            tenantId: row.tenant_id,
            invoiceId: row.id,
            idempotencyDay: overdueDigestIdempotencySuffix(next.seq),
            preferredSenderUserId: null,
            publishOutboundDigest: true,
          });
          overdue += 1;
          taken += 1;
        }
      }
    }

    if (dueSoon > 0 || overdue > 0) {
      neLogInfo('invoice_digest_batch', { due_soon: dueSoon, overdue });
    }

    return { due_soon: dueSoon, overdue };
  });
}

export async function runInvoiceDigestTickSafe(): Promise<void> {
  try {
    await processInvoiceNotificationDigestBatch(80);
  } catch (e) {
    neLogError('invoice_digest_tick', {}, e);
  }
}
