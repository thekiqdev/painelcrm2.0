import type { ClientFinancialSummary } from '@/services/clients';

/** Estado seguro ao não haver dados ou quando a API não devolve corpo completo. */
export function normalizeClientFinancialSummary(
  input: Partial<ClientFinancialSummary> | null | undefined,
): ClientFinancialSummary {
  const z = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
  const zn = (n: unknown): number | null =>
    n != null && typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : null;

  return {
    invoices_count: z(input?.invoices_count),
    open_amount_cents: z(input?.open_amount_cents),
    paid_amount_cents: z(input?.paid_amount_cents),
    overdue_amount_cents: z(input?.overdue_amount_cents),
    proposals_accepted_count: z(input?.proposals_accepted_count),
    proposals_accepted_amount_cents: z(input?.proposals_accepted_amount_cents),
    proposals_pending_count: z(input?.proposals_pending_count),
    proposals_pending_amount_cents: z(input?.proposals_pending_amount_cents),
    average_ticket_cents:
      input?.average_ticket_cents != null &&
      typeof input.average_ticket_cents === 'number' &&
      Number.isFinite(input.average_ticket_cents)
        ? Math.floor(input.average_ticket_cents)
        : null,
    last_invoice_amount_cents: zn(input?.last_invoice_amount_cents),
    last_invoice_status: typeof input?.last_invoice_status === 'string' ? input.last_invoice_status : null,
    currency: typeof input?.currency === 'string' && input.currency.trim() ? input.currency.trim() : 'BRL',
  };
}

export const EMPTY_CLIENT_FINANCIAL_SUMMARY: ClientFinancialSummary =
  normalizeClientFinancialSummary(null);
