/**
 * Carrega faturas em aberto do cliente para o simulador (S12).
 */
import { customerInvoicesService } from '@/services/customerInvoices';
import {
  buildInvoiceLookupMappedFromItems,
  FLOW_INVOICE_OPEN_STATUSES,
  invoiceRowToBag,
  type FlowInvoiceItemBag,
} from './flowInvoiceVars';

export async function loadOpenInvoicesMappedForSim(opts: {
  clientId: string;
  mode: 'last_open' | 'open_menu';
  limit?: number;
}): Promise<{ found: boolean; mapped: Record<string, string>; items: FlowInvoiceItemBag[] }> {
  const limit =
    opts.mode === 'last_open' ? 1 : Math.min(20, Math.max(1, opts.limit ?? 8));
  const rows = await customerInvoicesService.list({
    client_id: opts.clientId,
    status_in: [...FLOW_INVOICE_OPEN_STATUSES],
    limit,
  });
  const items = rows.map(invoiceRowToBag);
  const { found, mapped } = buildInvoiceLookupMappedFromItems(
    opts.clientId,
    items,
    opts.mode
  );
  return { found, mapped, items };
}
