import type { FinancialEventType } from '@/lib/financialEventTypes';
import type { InvoiceAction, InvoiceActionHandlers, InvoiceActionId } from '@/lib/invoiceAvailableActions';
import { INVOICE_ACTIONABLE } from '@/lib/customerInvoiceActions';
import type { BillingUiCapabilities } from './adapters/uiCapabilitiesAdapter';
import { cycleCanGenerateFromUiCapabilities } from './adapters/uiCapabilitiesAdapter';

export type UiInvoiceActionInput = {
  invoiceId?: string | null;
  canViewInvoices?: boolean;
  invoiceStatus?: string | null;
  eventType?: FinancialEventType | null;
  cycleId?: string | null;
  gateway?: string | null;
};

function isPendingEventType(type: FinancialEventType | null | undefined): boolean {
  if (!type) return false;
  return (
    type === 'invoice_due' ||
    type === 'invoice_generated' ||
    type === 'manual_charge' ||
    type === 'charge_attempt'
  );
}

function isFailedEventType(type: FinancialEventType | null | undefined): boolean {
  return type === 'invoice_failed' || type === 'charge_attempt';
}

const ACTION_LABELS: Record<InvoiceActionId, string> = {
  open: 'Abrir',
  copy_public_link: 'Copiar link',
  send_again: 'Enviar novamente',
  download_pdf: 'Baixar PDF',
  register_payment: 'Confirmar pagamento',
  view_history: 'Ver histórico',
  generate_now: 'Gerar agora',
  change_due: 'Alterar vencimento',
  resolve: 'Resolver',
  reprocess: 'Reprocessar',
  add_note: 'Registrar observação',
};

/**
 * Ações de invoice derivadas de aggregate.capabilities (Sprint 5.0-22B).
 * Substitui resolveInvoiceCapabilities + invoiceAvailableActions na UI montada.
 */
export function resolveUiInvoiceActions(
  caps: BillingUiCapabilities,
  input: UiInvoiceActionInput,
  handlers?: InvoiceActionHandlers,
  ocre?: { canGenerate?: boolean; canReprocess?: boolean; canOpen?: boolean }
): InvoiceAction[] {
  const hasInvoice = Boolean(input.invoiceId?.trim());
  const canView = input.canViewInvoices !== false;
  const status = (input.invoiceStatus ?? '').toLowerCase();
  const actionable =
    hasInvoice && (status ? INVOICE_ACTIONABLE.has(status) : isPendingEventType(input.eventType));
  const paid = hasInvoice && (status === 'paid' || input.eventType === 'payment');
  const failed = isFailedEventType(input.eventType);
  const forecast = !hasInvoice && input.eventType === 'upcoming_cycle';
  const canGenerate =
    ocre?.canGenerate ??
    (cycleCanGenerateFromUiCapabilities(caps, input.cycleId) && (forecast || (failed && !hasInvoice)));

  const actions: InvoiceAction[] = [];

  if (!hasInvoice) {
    if (canGenerate && handlers?.onGenerateBilling) {
      actions.push({ id: 'generate_now', label: ACTION_LABELS.generate_now, primary: true });
    } else if (failed && caps.canRetry && handlers?.onGenerateBilling) {
      actions.push({ id: 'generate_now', label: ACTION_LABELS.generate_now, primary: true });
    }
    return actions;
  }

  if (caps.canOpenInvoice && canView) {
    actions.push({ id: 'open', label: ACTION_LABELS.open });
  }
  if (canView) {
    actions.push({ id: 'copy_public_link', label: ACTION_LABELS.copy_public_link });
  }
  if (canView && actionable && !paid) {
    actions.push({ id: 'register_payment', label: ACTION_LABELS.register_payment });
  }
  if (failed && (ocre?.canReprocess ?? caps.canRetry) && handlers?.onGenerateBilling) {
    actions.push({ id: 'reprocess', label: ACTION_LABELS.reprocess });
  }

  return actions;
}

export function orderedUiInvoiceActions(actions: InvoiceAction[]): InvoiceAction[] {
  const order = new Map(['open', 'copy_public_link', 'register_payment', 'generate_now'].map((id, i) => [id, i]));
  return [...actions].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
}
