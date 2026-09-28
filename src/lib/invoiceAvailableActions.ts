import type { FinancialEventType } from './financialEventTypes';
import {
  resolveInvoiceCapabilities,
  type InvoiceCapabilities,
  type InvoiceCapabilitiesInput,
} from './invoiceCapabilities';

export type InvoiceActionId =
  | 'open'
  | 'copy_public_link'
  | 'send_again'
  | 'download_pdf'
  | 'register_payment'
  | 'view_history'
  | 'generate_now'
  | 'change_due'
  | 'resolve'
  | 'reprocess'
  | 'add_note';

export type InvoiceAction = {
  id: InvoiceActionId;
  label: string;
  primary?: boolean;
};

export type InvoiceActionHandlers = {
  onGenerateBilling?: (target?: { cycleId?: string | null }) => void;
  onChangeDue?: () => void;
  onViewHistory?: () => void;
  onAddNote?: () => void;
};

const ACTION_LABELS: Record<InvoiceActionId, string> = {
  open: 'Abrir cobrança',
  copy_public_link: 'Copiar link público',
  send_again: 'Enviar novamente',
  download_pdf: 'Baixar PDF',
  register_payment: 'Registrar pagamento',
  view_history: 'Ver histórico',
  generate_now: 'Gerar agora',
  change_due: 'Alterar vencimento',
  resolve: 'Resolver',
  reprocess: 'Reprocessar',
  add_note: 'Registrar observação',
};

function pushUnique(actions: InvoiceAction[], id: InvoiceActionId, primary = false): void {
  if (actions.some((a) => a.id === id)) return;
  actions.push({ id, label: ACTION_LABELS[id], primary });
}

export function buildActionsFromCapabilities(
  caps: InvoiceCapabilities,
  handlers?: InvoiceActionHandlers
): InvoiceAction[] {
  const actions: InvoiceAction[] = [];

  if (caps.supportsOpen) pushUnique(actions, 'open', true);
  if (caps.supportsPublicUrl) pushUnique(actions, 'copy_public_link');
  if (caps.supportsEmail) pushUnique(actions, 'send_again');
  if (caps.supportsPdf) pushUnique(actions, 'download_pdf');
  if (caps.supportsRegisterPayment) pushUnique(actions, 'register_payment');
  if (caps.supportsGenerate && handlers?.onGenerateBilling) {
    pushUnique(actions, 'generate_now', !caps.supportsOpen);
  }
  if (caps.supportsChangeDue && handlers?.onChangeDue) pushUnique(actions, 'change_due');
  if (caps.supportsResolve && handlers?.onGenerateBilling) pushUnique(actions, 'resolve', true);
  if (caps.supportsReprocess && handlers?.onGenerateBilling) pushUnique(actions, 'reprocess');
  if (caps.supportsViewHistory && handlers?.onViewHistory) pushUnique(actions, 'view_history');
  if (handlers?.onAddNote) pushUnique(actions, 'add_note');

  return actions;
}

export function resolveInvoiceAvailableActions(
  input: InvoiceCapabilitiesInput,
  handlers?: InvoiceActionHandlers
): InvoiceAction[] {
  return buildActionsFromCapabilities(resolveInvoiceCapabilities(input), handlers);
}

export function resolveEventAvailableActions(
  input: InvoiceCapabilitiesInput & { eventType: FinancialEventType },
  handlers?: InvoiceActionHandlers
): InvoiceAction[] {
  return resolveInvoiceAvailableActions(input, handlers);
}

export function invoiceStatusFromEventType(type: FinancialEventType): string | null {
  if (type === 'payment') return 'paid';
  if (type === 'invoice_due' || type === 'invoice_generated' || type === 'manual_charge') {
    return 'pending';
  }
  if (type === 'invoice_failed') return 'failed';
  if (type === 'invoice_cancelled') return 'cancelled';
  if (type === 'invoice_refunded') return 'refunded';
  return null;
}

export function capabilitiesForFinancialEvent(
  eventType: FinancialEventType,
  invoiceId: string | null,
  canViewInvoices: boolean,
  gateway: string | null
): InvoiceCapabilities {
  return resolveInvoiceCapabilities({
    invoiceId,
    canViewInvoices,
    eventType,
    invoiceStatus: invoiceStatusFromEventType(eventType),
    gateway,
  });
}
