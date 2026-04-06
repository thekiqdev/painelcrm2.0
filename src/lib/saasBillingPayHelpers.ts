/**
 * Helpers compartilhados para pagamento de cobranças internas SaaS (tenant_billing).
 * Mantidos fora do PlanCheckout para o fluxo InternalBillingCheckout.
 */

export interface SaasBillingPurchaseResult {
  billing_id: string;
  invoice_number?: string;
  amount_cents: number;
  status: string;
  tenant_id: string;
  payment_method?: string;
  invoice_url?: string;
  bank_slip_url?: string;
  bank_slip_digitable_line?: string;
  pix_qr_code?: string;
  pix_copy_paste?: string;
  inline_pay_token?: string;
  seat_addon_additional_seats?: number;
  billing_reason?: string;
}

export type PlanPurchasePm = 'PIX' | 'BOLETO' | 'CREDIT_CARD';

export function normalizePlanPurchasePaymentMethod(m: string | undefined | null): PlanPurchasePm | null {
  const u = String(m ?? '').toUpperCase();
  if (u === 'PIX' || u === 'BOLETO' || u === 'CREDIT_CARD') return u;
  return null;
}

/**
 * Indica se `result` já tem dados utilizáveis para o método pedido.
 * Não descarta boleto/cartão só porque ainda existam campos de PIX no objeto (estado antigo ou API parcial).
 * Quando `payment_method` do backend bate com `method`, valida só os campos daquele método.
 */
export function hasRenderablePayloadForMethod(result: SaasBillingPurchaseResult, method: PlanPurchasePm): boolean {
  const resultPm = normalizePlanPurchasePaymentMethod(result.payment_method);
  if (resultPm && resultPm !== method) return false;

  if (method === 'PIX') {
    return !!(result.pix_qr_code || result.pix_copy_paste);
  }
  if (method === 'BOLETO') {
    return !!(
      result.bank_slip_url?.trim() ||
      result.invoice_url?.trim() ||
      result.bank_slip_digitable_line?.trim()
    );
  }
  if (method === 'CREDIT_CARD') {
    return !!(
      result.billing_id &&
      (result.invoice_url?.trim() || result.inline_pay_token?.trim())
    );
  }
  return false;
}

/**
 * Monta o state de cobrança só com campos do método atual — evita PIX “fantasma” bloqueando boleto/cartão
 * quando o JSON do prepare omite chaves e o React mantinha valores antigos no objeto.
 */
export function buildSaasBillingDisplayResult(
  p: SaasBillingPurchaseResult,
  merge: Partial<SaasBillingPurchaseResult> = {}
): SaasBillingPurchaseResult {
  const pm = normalizePlanPurchasePaymentMethod(p.payment_method);
  const base: SaasBillingPurchaseResult = {
    billing_id: p.billing_id,
    invoice_number: p.invoice_number,
    amount_cents: p.amount_cents,
    status: p.status,
    tenant_id: p.tenant_id,
    payment_method: p.payment_method,
    billing_reason: p.billing_reason,
    seat_addon_additional_seats: p.seat_addon_additional_seats,
    ...merge,
  };

  if (pm === 'PIX') {
    base.pix_qr_code = p.pix_qr_code;
    base.pix_copy_paste = p.pix_copy_paste;
    base.inline_pay_token = p.inline_pay_token;
    return base;
  }
  if (pm === 'BOLETO') {
    base.invoice_url = p.invoice_url;
    base.bank_slip_url = p.bank_slip_url;
    base.bank_slip_digitable_line = p.bank_slip_digitable_line;
    base.inline_pay_token = p.inline_pay_token;
    return base;
  }
  if (pm === 'CREDIT_CARD') {
    base.invoice_url = p.invoice_url;
    base.inline_pay_token = p.inline_pay_token;
    return base;
  }

  base.pix_qr_code = p.pix_qr_code;
  base.pix_copy_paste = p.pix_copy_paste;
  base.invoice_url = p.invoice_url;
  base.bank_slip_url = p.bank_slip_url;
  base.bank_slip_digitable_line = p.bank_slip_digitable_line;
  base.inline_pay_token = p.inline_pay_token;
  return base;
}
