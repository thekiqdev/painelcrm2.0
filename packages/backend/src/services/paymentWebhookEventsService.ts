/**
 * Serviço de eventos de webhook para debug (Fase 5 — PLANO-EVOLUCAO-PAYMENT-GATEWAYS-PANEL).
 */
import { pool } from '../utils/db.js';

export interface PaymentWebhookEventRow {
  id: string;
  gateway_key: string;
  event_id: string;
  payload_summary: Record<string, unknown> | null;
  status: string;
  external_reference: string | null;
  created_at: string;
}

/**
 * Insere ou atualiza um evento na tabela de debug (chamado pelos handlers de webhook).
 */
export async function upsertWebhookEvent(data: {
  gatewayKey: string;
  eventId: string;
  payloadSummary: Record<string, unknown> | null;
  status: 'pending' | 'processed' | 'failed';
  externalReference?: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO payment_webhook_events (gateway_key, event_id, payload_summary, status, external_reference)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (gateway_key, event_id) DO UPDATE SET
       payload_summary = EXCLUDED.payload_summary,
       status = EXCLUDED.status,
       external_reference = COALESCE(payment_webhook_events.external_reference, EXCLUDED.external_reference)`,
    [
      data.gatewayKey,
      data.eventId,
      data.payloadSummary ? JSON.stringify(data.payloadSummary) : null,
      data.status,
      data.externalReference ?? null,
    ]
  );
}

export interface ListWebhookEventsParams {
  gatewayKey?: string;
  tenantId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Lista eventos para GET .../payments/webhooks/events (paginação e filtro por gateway/tenant).
 */
export async function listWebhookEvents(
  params: ListWebhookEventsParams = {}
): Promise<PaymentWebhookEventRow[]> {
  const { gatewayKey, tenantId, limit = 50, offset = 0 } = params;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (gatewayKey) {
    conditions.push(`gateway_key = $${i++}`);
    values.push(gatewayKey);
  }
  if (tenantId) {
    conditions.push(`external_reference = $${i++}`);
    values.push(tenantId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit, offset);
  const r = await pool.query<PaymentWebhookEventRow>(
    `SELECT id, gateway_key, event_id, payload_summary, status, external_reference, created_at
     FROM payment_webhook_events
     ${where}
     ORDER BY created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    values
  );
  return r.rows;
}
