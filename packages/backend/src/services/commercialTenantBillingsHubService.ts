/**
 * Hub comercial /meu-plano: lista apenas cobranças "pai" (tenant_billing) da conta.
 * Tentativas por método ficam em tenant_billing_payment_attempts — não são listadas aqui.
 */
import { pool } from '../utils/db.js';

export const COMMERCIAL_BILLING_REASONS = [
  'plan_purchase',
  'plan_upgrade',
  'plan_renewal',
  'manual_charge',
  'seat_addon',
] as const;

export interface CommercialBillingHubRow {
  id: string;
  amount_cents: number;
  due_date: string;
  status: string;
  paid_at: string | null;
  /** Coluna da fatura ou, se paga, método da tentativa que liquidou. */
  effective_payment_method: string | null;
  invoice_number: string | null;
  period_start: string | null;
  period_end: string | null;
  billing_reason: string;
  plan_name_snapshot: string | null;
  has_gateway_reference: boolean;
  created_at: string;
}

export async function listCommercialBillingsForHub(
  tenantId: string,
  limit = 60
): Promise<CommercialBillingHubRow[]> {
  const r = await pool.query<CommercialBillingHubRow>(
    `SELECT
      tb.id,
      tb.amount_cents,
      tb.due_date::text AS due_date,
      tb.status,
      tb.paid_at::text AS paid_at,
      COALESCE(
        NULLIF(trim(tb.payment_method), ''),
        (SELECT tpa.payment_method::text
         FROM tenant_billing_payment_attempts tpa
         WHERE tpa.billing_id = tb.id AND tpa.status = 'paid'
         ORDER BY tpa.paid_at DESC NULLS LAST, tpa.updated_at DESC
         LIMIT 1)
      ) AS effective_payment_method,
      tb.invoice_number,
      tb.period_start::text AS period_start,
      tb.period_end::text AS period_end,
      COALESCE(tb.billing_reason, 'plan_purchase') AS billing_reason,
      tb.plan_name_snapshot,
      (tb.gateway_reference_id IS NOT NULL AND length(trim(COALESCE(tb.gateway_reference_id, ''))) > 0)
        AS has_gateway_reference,
      tb.created_at::text AS created_at
    FROM tenant_billing tb
    WHERE tb.tenant_id = $1
      AND COALESCE(tb.billing_reason, 'plan_purchase') = ANY($2::text[])
    ORDER BY tb.created_at DESC
    LIMIT $3`,
    [tenantId, COMMERCIAL_BILLING_REASONS, limit]
  );
  return r.rows;
}
