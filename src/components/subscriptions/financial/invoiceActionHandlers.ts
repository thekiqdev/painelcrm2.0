import type { InvoiceAction, InvoiceActionHandlers } from '@/lib/invoiceAvailableActions';
import {
  copyInvoicePublicUrl,
  openInvoiceInNewTab,
  openInvoicePdfInNewTab,
  openInvoiceResendInNewTab,
} from '@/lib/invoiceQuickActions';

export function executeInvoiceAction(
  action: InvoiceAction,
  invoiceId: string | undefined,
  paymentToken: string | null | undefined,
  handlers?: InvoiceActionHandlers
): void {
  switch (action.id) {
    case 'open':
      if (invoiceId) openInvoiceInNewTab(invoiceId);
      break;
    case 'copy_public_link':
      if (invoiceId) void copyInvoicePublicUrl(invoiceId, paymentToken);
      break;
    case 'send_again':
      if (invoiceId) openInvoiceResendInNewTab(invoiceId);
      break;
    case 'download_pdf':
      if (invoiceId) openInvoicePdfInNewTab(invoiceId);
      break;
    case 'register_payment':
      // Confirmação inline via ConfirmPaymentDialog nos componentes financeiros da assinatura.
      break;
    case 'view_history':
      handlers?.onViewHistory?.();
      break;
    case 'generate_now':
    case 'resolve':
      handlers?.onGenerateBilling?.();
      break;
    case 'change_due':
      handlers?.onChangeDue?.();
      break;
    case 'reprocess':
      handlers?.onGenerateBilling?.();
      break;
    case 'add_note':
      handlers?.onAddNote?.();
      break;
    default:
      break;
  }
}
