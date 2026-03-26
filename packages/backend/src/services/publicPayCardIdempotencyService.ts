/**
 * Cache de respostas idempotentes para pay-with-card (token + idempotency_key).
 * Não armazena dados de cartão — apenas JSON de resposta de sucesso já sanitizado.
 */
import { pool } from '../utils/db.js';

let hasTablePromise: Promise<boolean> | null = null;

async function hasTable(): Promise<boolean> {
  if (!hasTablePromise) {
    hasTablePromise = (async () => {
      const r = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'public_pay_card_idempotency'`
      );
      return (r.rows[0]?.c ?? '0') === '1';
    })();
  }
  return hasTablePromise;
}

export async function getPayWithCardIdempotentResponse(
  paymentToken: string,
  idempotencyKey: string
): Promise<Record<string, unknown> | null> {
  if (!(await hasTable())) return null;
  const r = await pool.query<{ response_json: Record<string, unknown> }>(
    `SELECT response_json FROM public_pay_card_idempotency
     WHERE payment_token = $1::uuid AND idempotency_key = $2
     LIMIT 1`,
    [paymentToken, idempotencyKey]
  );
  const row = r.rows[0];
  return row?.response_json ?? null;
}

export async function savePayWithCardIdempotentResponse(
  paymentToken: string,
  idempotencyKey: string,
  responseJson: Record<string, unknown>
): Promise<void> {
  if (!(await hasTable())) return;
  await pool.query(
    `INSERT INTO public_pay_card_idempotency (payment_token, idempotency_key, response_json)
     VALUES ($1::uuid, $2, $3::jsonb)
     ON CONFLICT (payment_token, idempotency_key) DO NOTHING`,
    [paymentToken, idempotencyKey, JSON.stringify(responseJson)]
  );
}
