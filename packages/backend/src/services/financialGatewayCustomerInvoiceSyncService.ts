/**
 * Compat: delega para financialGatewayReceivablesService.
 */
import { syncCustomerInvoicePaymentToFinancialAccount } from './financialGatewayReceivablesService.js';

export async function syncGatewayIncomeTransactionForPaidInvoice(invoiceId: string): Promise<void> {
  await syncCustomerInvoicePaymentToFinancialAccount(invoiceId);
}
