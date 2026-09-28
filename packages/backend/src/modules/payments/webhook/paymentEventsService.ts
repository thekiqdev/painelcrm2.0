/**
 * Idempotência de webhook: payment_events (INSERT + marcar processado + processed_result).
 * Fase 3 — PLANO-REFATORACAO-MULTI-GATEWAY.
 */
import { pool } from '../../../utils/db.js';

export interface ProcessedResult {
  previous_status: string;
  new_status: string;
  action: 'status_updated' | 'no_change' | 'skipped_regression';
  reason: string;
}

/**
 * Insere evento. Em conflito (gateway, event_id) retorna { inserted: false, alreadyProcessed }.
 * Se inserted: true, processar e depois chamar markProcessed.
 */
export async function insertPaymentEvent(params: {
  gateway: string;
  eventId: string;
  referenceId: string;
  payload: Record<string, unknown>;
}): Promise<{ inserted: boolean; alreadyProcessed?: boolean }> {
  const { gateway, eventId, referenceId, payload } = params;
  const payloadJson = JSON.stringify(payload ?? {});

  try {
    await pool.query(
      `INSERT INTO payment_events (gateway, event_id, reference_id, payload, processed)
       VALUES ($1, $2, $3, $4::jsonb, false)`,
      [gateway, eventId, referenceId, payloadJson]
    );
    return { inserted: true };
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === '23505') {
      const row = await pool.query<{ processed: boolean }>(
        `SELECT processed FROM payment_events WHERE gateway = $1 AND event_id = $2`,
        [gateway, eventId]
      );
      return { inserted: false, alreadyProcessed: row.rows[0]?.processed ?? false };
    }
    throw err;
  }
}

/**
 * Marca evento como processado e grava log de decisão.
 */
export async function markPaymentEventProcessed(params: {
  gateway: string;
  eventId: string;
  processedResult: ProcessedResult;
}): Promise<void> {
  const { gateway, eventId, processedResult } = params;
  await pool.query(
    `UPDATE payment_events
     SET processed = true, processed_at = now(), processed_result = $3::jsonb
     WHERE gateway = $1 AND event_id = $2`,
    [gateway, eventId, JSON.stringify(processedResult)]
  );
}
