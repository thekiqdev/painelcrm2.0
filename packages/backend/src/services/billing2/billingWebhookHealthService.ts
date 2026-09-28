/**
 * Billing 2.0 Sprint 7 — saúde de webhooks SaaS + reprocess seguro.
 *
 * Reprocess só para eventos `failed` com payload em `payment_events`.
 * Remove a linha de idempotência e reexecuta `handleWebhook` (domínio idempotente por status).
 */
import { pool } from '../../utils/db.js';
import { handleWebhook } from '../../modules/payments/webhook/webhookCore.js';
import { writeBillingAuditEvent } from '../collectionPolicy/billingAuditEventWriter.js';
import { upsertWebhookEvent } from '../paymentWebhookEventsService.js';

export type WebhookHealthSummary = {
  window_hours: number;
  total: number;
  processed: number;
  failed: number;
  pending: number;
  ok_rate: number | null;
  sources: {
    asaas_webhook_events: { total: number; processed: number; failed: number; pending: number };
    payment_webhook_events: { total: number; processed: number; failed: number; pending: number };
  };
  last_webhook_received_at: string | null;
  last_webhook_error: string | null;
};

export type WebhookEventListItem = {
  source: 'asaas_webhook_events' | 'payment_webhook_events';
  event_id: string;
  event_type: string | null;
  status: string;
  payment_id: string | null;
  last_error: string | null;
  attempts: number | null;
  external_reference: string | null;
  created_at: string | null;
  processed_at: string | null;
  reprocessable: boolean;
};

async function countByStatus(
  table: 'asaas_webhook_events' | 'payment_webhook_events',
  hours: number
): Promise<{ total: number; processed: number; failed: number; pending: number }> {
  const createdCol = table === 'asaas_webhook_events' ? 'created_at' : 'created_at';
  try {
    const r = await pool.query<{
      total: string;
      processed: string;
      failed: string;
      pending: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status = 'processed')::text AS processed,
         COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
         COUNT(*) FILTER (WHERE status = 'pending')::text AS pending
       FROM ${table}
       WHERE ${createdCol} >= now() - ($1::int || ' hours')::interval`,
      [hours]
    );
    return {
      total: Number.parseInt(r.rows[0]?.total ?? '0', 10) || 0,
      processed: Number.parseInt(r.rows[0]?.processed ?? '0', 10) || 0,
      failed: Number.parseInt(r.rows[0]?.failed ?? '0', 10) || 0,
      pending: Number.parseInt(r.rows[0]?.pending ?? '0', 10) || 0,
    };
  } catch {
    return { total: 0, processed: 0, failed: 0, pending: 0 };
  }
}

export async function getBillingWebhookHealth(windowHours = 24): Promise<WebhookHealthSummary> {
  const hours = Math.min(168, Math.max(1, windowHours));
  const [asaas, debug, cfg] = await Promise.all([
    countByStatus('asaas_webhook_events', hours),
    countByStatus('payment_webhook_events', hours),
    pool
      .query<{ last_webhook_received_at: string | null; last_webhook_error: string | null }>(
        `SELECT last_webhook_received_at::text, last_webhook_error
         FROM payment_gateway_configs
         WHERE gateway_key = 'asaas' AND is_active = true AND scope = 'global'
         ORDER BY updated_at DESC NULLS LAST
         LIMIT 1`
      )
      .catch(() => ({ rows: [] as Array<{ last_webhook_received_at: string | null; last_webhook_error: string | null }> })),
  ]);

  const total = asaas.total;
  const processed = asaas.processed;
  const failed = asaas.failed;
  const pending = asaas.pending;
  const denom = processed + failed;
  const ok_rate = denom > 0 ? Math.round((processed / denom) * 1000) / 10 : null;

  return {
    window_hours: hours,
    total,
    processed,
    failed,
    pending,
    ok_rate,
    sources: {
      asaas_webhook_events: asaas,
      payment_webhook_events: debug,
    },
    last_webhook_received_at: cfg.rows[0]?.last_webhook_received_at ?? null,
    last_webhook_error: cfg.rows[0]?.last_webhook_error ?? null,
  };
}

export async function listBillingWebhookEvents(opts: {
  status?: string | null;
  limit?: number;
}): Promise<WebhookEventListItem[]> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const status = opts.status?.trim() || null;

  const params: unknown[] = [];
  let statusSql = '';
  if (status && status !== 'all') {
    params.push(status);
    statusSql = `AND a.status = $${params.length}`;
  }
  params.push(limit);
  const limIdx = params.length;

  const r = await pool.query(
    `SELECT
       a.event_id,
       a.event_type,
       a.status,
       a.payment_id,
       a.last_error,
       a.attempts,
       a.created_at::text AS created_at,
       a.processed_at::text AS processed_at,
       p.external_reference,
       CASE
         WHEN a.status = 'failed'
          AND EXISTS (
            SELECT 1 FROM payment_events pe
            WHERE pe.gateway = 'asaas' AND pe.event_id = a.event_id AND pe.payload IS NOT NULL
          )
         THEN true ELSE false
       END AS reprocessable
     FROM asaas_webhook_events a
     LEFT JOIN payment_webhook_events p
       ON p.gateway_key = 'asaas' AND p.event_id = a.event_id
     WHERE 1=1
       ${statusSql}
     ORDER BY a.created_at DESC NULLS LAST
     LIMIT $${limIdx}`,
    params
  );

  return r.rows.map((row) => ({
    source: 'asaas_webhook_events' as const,
    event_id: String(row.event_id),
    event_type: row.event_type != null ? String(row.event_type) : null,
    status: String(row.status),
    payment_id: row.payment_id != null ? String(row.payment_id) : null,
    last_error: row.last_error != null ? String(row.last_error) : null,
    attempts: row.attempts != null ? Number(row.attempts) : null,
    external_reference: row.external_reference != null ? String(row.external_reference) : null,
    created_at: row.created_at != null ? String(row.created_at) : null,
    processed_at: row.processed_at != null ? String(row.processed_at) : null,
    reprocessable: row.reprocessable === true,
  }));
}

/**
 * Reprocessa evento Asaas failed com payload persistido.
 * Segurança: só `failed`; exige payload; remove idempotency row e reexecuta domínio.
 */
export async function reprocessFailedAsaasWebhook(input: {
  eventId: string;
  actor: string;
}): Promise<{ ok: boolean; error?: string; handle_status?: number }> {
  const eventId = input.eventId.trim();
  if (!eventId) return { ok: false, error: 'event_id obrigatório' };

  const asaas = await pool.query<{ status: string; event_type: string; payment_id: string | null }>(
    `SELECT status, event_type, payment_id FROM asaas_webhook_events WHERE event_id = $1`,
    [eventId]
  );
  const row = asaas.rows[0];
  if (!row) return { ok: false, error: 'Evento não encontrado em asaas_webhook_events' };
  if (row.status !== 'failed') {
    return { ok: false, error: `Reprocess só permitido para status=failed (atual=${row.status})` };
  }

  const pe = await pool.query<{ payload: unknown; reference_id: string }>(
    `SELECT payload, reference_id FROM payment_events WHERE gateway = 'asaas' AND event_id = $1`,
    [eventId]
  );
  const payload = pe.rows[0]?.payload;
  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      error: 'Sem payload em payment_events — reprocess seguro indisponível para este evento',
    };
  }

  // Libera idempotência para permitir reexecução
  await pool.query(`DELETE FROM payment_events WHERE gateway = 'asaas' AND event_id = $1`, [eventId]);
  await pool.query(
    `UPDATE asaas_webhook_events
     SET status = 'pending', last_error = NULL, attempts = GREATEST(attempts, 1), processed_at = NULL
     WHERE event_id = $1`,
    [eventId]
  );
  await upsertWebhookEvent({
    gatewayKey: 'asaas',
    eventId,
    payloadSummary: { event: row.event_type, reprocess: true },
    status: 'pending',
  });

  // Garante parser Asaas registrado (side-effect do módulo)
  await import('../../modules/gateways/asaas/webhooks/asaasWebhook.js');
  const result = await handleWebhook('asaas', payload);

  if (result.status === 200) {
    await pool.query(
      `UPDATE asaas_webhook_events SET status = 'processed', processed_at = now(), last_error = NULL WHERE event_id = $1`,
      [eventId]
    );
    await upsertWebhookEvent({
      gatewayKey: 'asaas',
      eventId,
      payloadSummary: { event: row.event_type, reprocess: true },
      status: 'processed',
    });
  } else {
    const message = result.body?.error ?? 'Erro no reprocess';
    await pool.query(
      `UPDATE asaas_webhook_events SET status = 'failed', last_error = $2 WHERE event_id = $1`,
      [eventId, message]
    );
    await upsertWebhookEvent({
      gatewayKey: 'asaas',
      eventId,
      payloadSummary: { event: row.event_type, reprocess: true, error: message },
      status: 'failed',
    });
  }

  await writeBillingAuditEvent({
    actor: input.actor,
    actor_type: 'superadmin',
    action: 'webhook.reprocess',
    entity_type: 'asaas_webhook_event',
    entity_id: eventId,
    reason: result.status === 200 ? 'reprocess_ok' : 'reprocess_failed',
    origin: 'superadmin_billing_webhooks',
    correlation_id: `webhook:asaas:${eventId}`,
    payload: {
      event_id: eventId,
      payment_id: row.payment_id,
      handle_status: result.status,
      error: result.body?.error ?? null,
    },
  });

  if (result.status !== 200) {
    return { ok: false, error: result.body?.error ?? 'Falha no reprocess', handle_status: result.status };
  }
  return { ok: true, handle_status: 200 };
}
