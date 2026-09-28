import { customerInvoicesService, type CustomerInvoice } from '@/services/customerInvoices';
import { chatService } from '@/services/chat';

export function buildInvoiceLink(paymentToken: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/pay/${paymentToken}`;
  }
  return `/pay/${paymentToken}`;
}

export async function getOpenInvoicesByClient(clientId: string): Promise<CustomerInvoice[]> {
  const [pending, overdue] = await Promise.all([
    customerInvoicesService.list({ client_id: clientId, status: 'pending', limit: 50 }),
    customerInvoicesService.list({ client_id: clientId, status: 'overdue', limit: 50 }),
  ]);
  const map = new Map<string, CustomerInvoice>();
  [...pending, ...overdue].forEach((inv) => map.set(inv.id, inv));
  return Array.from(map.values()).sort((a, b) => {
    const da = new Date(a.due_date).getTime();
    const db = new Date(b.due_date).getTime();
    return da - db;
  });
}

export async function sendInvoiceLink(conversationId: string, invoice: CustomerInvoice): Promise<void> {
  if (!invoice.payment_token) throw new Error('Fatura sem link de pagamento');
  const link = buildInvoiceLink(invoice.payment_token);
  const message = `Olá! Segue o link para pagamento da sua fatura:\n${link}`;
  await chatService.sendMessage(conversationId, message);
}

export function openInvoiceCreation(clientId: string, navigate: (path: string) => void): void {
  navigate(`/customer-invoices/new?client_id=${encodeURIComponent(clientId)}`);
}
