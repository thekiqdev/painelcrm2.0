import { toast } from '@/components/ui/sonner';

export function invoiceCrmPath(invoiceId: string): string {
  return `/customer-invoices/${encodeURIComponent(invoiceId)}`;
}

export function invoiceCrmAbsoluteUrl(invoiceId: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}${invoiceCrmPath(invoiceId)}`;
}

/** Link público de pagamento quando há token; senão URL da fatura no CRM. */
export function invoicePublicUrl(invoiceId: string, paymentToken?: string | null): string {
  const token = paymentToken?.trim();
  if (token) {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    return `${base}/pay/${encodeURIComponent(token)}`;
  }
  return invoiceCrmAbsoluteUrl(invoiceId);
}

export function invoicePdfPath(invoiceId: string): string {
  return `${invoiceCrmPath(invoiceId)}?download=pdf`;
}

export function invoiceResendPath(invoiceId: string): string {
  return `${invoiceCrmPath(invoiceId)}?action=resend`;
}

export function invoiceRegisterPaymentPath(invoiceId: string): string {
  return `${invoiceCrmPath(invoiceId)}?action=register_payment`;
}

export function invoiceDuplicatePath(invoiceId: string): string {
  return `/customer-invoices/new?duplicateFrom=${encodeURIComponent(invoiceId)}`;
}

export async function copyInvoicePublicUrl(
  invoiceId: string,
  paymentToken?: string | null
): Promise<boolean> {
  const url = invoicePublicUrl(invoiceId, paymentToken);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado');
      return true;
    }
  } catch {
    /* fallback */
  }
  return false;
}

export async function copyInvoiceNumber(invoiceId: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(invoiceId);
      toast.success('Número copiado');
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function openInvoiceInNewTab(invoiceId: string): void {
  if (typeof window === 'undefined') return;
  window.open(invoiceCrmPath(invoiceId), '_blank', 'noopener,noreferrer');
}

export function openInvoicePdfInNewTab(invoiceId: string): void {
  if (typeof window === 'undefined') return;
  window.open(invoicePdfPath(invoiceId), '_blank', 'noopener,noreferrer');
}

export function openInvoiceResendInNewTab(invoiceId: string): void {
  if (typeof window === 'undefined') return;
  window.open(invoiceResendPath(invoiceId), '_blank', 'noopener,noreferrer');
}

export function openInvoiceRegisterPayment(invoiceId: string): void {
  if (typeof window === 'undefined') return;
  window.open(invoiceRegisterPaymentPath(invoiceId), '_blank', 'noopener,noreferrer');
}
