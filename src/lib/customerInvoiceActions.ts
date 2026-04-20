import type { CustomerInvoice } from "@/services/customerInvoices";

/** Status em que cancelar/editar/excluir é permitido (alinhado ao backend). */
export const INVOICE_ACTIONABLE = new Set([
  "pending",
  "waiting_payment",
  "processing",
  "overdue",
]);

export function isInvoiceActionable(status: string): boolean {
  return INVOICE_ACTIONABLE.has(status);
}

export function canDeleteCustomerInvoice(
  inv: Pick<CustomerInvoice, "status" | "origin">
): boolean {
  return isInvoiceActionable(inv.status) && inv.origin !== "subscription";
}
