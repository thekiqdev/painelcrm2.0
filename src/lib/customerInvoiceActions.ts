import type { CustomerInvoice } from "@/services/customerInvoices";

/** Status em que cancelar/editar/excluir é permitido (alinhado ao backend). */
export const INVOICE_ACTIONABLE = new Set([
  "pending",
  "waiting_payment",
  "processing",
  "overdue",
]);

/** Faturas de assinatura já encerradas no fluxo — exclusão permitida (alinhado ao backend). */
const SUBSCRIPTION_INVOICE_PURGEABLE_STATUSES = new Set(["cancelled", "failed"]);

export function isInvoiceActionable(status: string): boolean {
  return INVOICE_ACTIONABLE.has(status);
}

/** Assinatura + cancelada/falhada: pode apagar o registro (só histórico encerrado). */
export function isSubscriptionInvoicePurgeable(
  inv: Pick<CustomerInvoice, "status" | "origin">
): boolean {
  return inv.origin === "subscription" && SUBSCRIPTION_INVOICE_PURGEABLE_STATUSES.has(inv.status);
}

export function canDeleteCustomerInvoice(
  inv: Pick<CustomerInvoice, "status" | "origin">
): boolean {
  if (isSubscriptionInvoicePurgeable(inv)) return true;
  return isInvoiceActionable(inv.status) && inv.origin !== "subscription";
}
