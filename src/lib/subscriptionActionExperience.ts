import type { FinancialEventType } from './financialEventTypes';
import {
  resolveInvoiceCapabilities,
  type InvoiceCapabilitiesInput,
} from './invoiceCapabilities';
import type { InvoiceAction, InvoiceActionHandlers, InvoiceActionId } from './invoiceAvailableActions';
import type { FinancialHistoryRow } from './billingSubscriptionExperience';
import type { FinancialAlert, FinancialAlertKind } from './subscriptionFinancialExperience';
import {
  historyFinancialStatusLabel,
  isRecoverableCycleFailure,
  mapHistoryFinancialStatus,
} from './subscriptionRenewalRecovery';

/** Histórico sem expansão de linha (Sprint 4.1G). */
export const HISTORY_ROW_EXPANSION_ENABLED = false;

/** Ordem fixa de ícones quando existe invoice. */
export const DIRECT_INVOICE_ACTION_ORDER: InvoiceActionId[] = [
  'open',
  'copy_public_link',
  'register_payment',
];

export const DIRECT_ACTION_LABELS: Partial<Record<InvoiceActionId, string>> = {
  open: 'Abrir',
  copy_public_link: 'Copiar link',
  register_payment: 'Confirmar pagamento',
  generate_now: 'Gerar agora',
};

export const ACTION_ORIENTED_PAGE_BLOCKS = [
  'header',
  'kpis',
  'calendar_sidebar',
  'financial_history',
  'insights',
  'settings',
  'technical',
] as const;

export const REMOVED_ACTION_EXPERIENCE_SECTIONS = [
  'financial-upcoming-agenda',
  'history-row-expansion',
  'invoice-actions-menu',
] as const;

export function directActionLabel(id: InvoiceActionId): string {
  return DIRECT_ACTION_LABELS[id] ?? id;
}

export function shouldShowGenerateOnly(input: InvoiceCapabilitiesInput): boolean {
  return !input.invoiceId?.trim();
}

export function resolveDirectInvoiceActions(
  input: InvoiceCapabilitiesInput,
  handlers?: InvoiceActionHandlers
): InvoiceAction[] {
  const caps = resolveInvoiceCapabilities(input);

  if (!input.invoiceId?.trim()) {
    if (caps.supportsGenerate && handlers?.onGenerateBilling) {
      return [{ id: 'generate_now', label: directActionLabel('generate_now'), primary: true }];
    }
    if (caps.supportsResolve && handlers?.onGenerateBilling) {
      return [{ id: 'generate_now', label: directActionLabel('generate_now'), primary: true }];
    }
    return [];
  }

  const actions: InvoiceAction[] = [];
  if (caps.supportsOpen) {
    actions.push({ id: 'open', label: directActionLabel('open') });
  }
  if (caps.supportsPublicUrl) {
    actions.push({ id: 'copy_public_link', label: directActionLabel('copy_public_link') });
  }
  if (caps.supportsRegisterPayment) {
    actions.push({ id: 'register_payment', label: directActionLabel('register_payment') });
  }
  return actions;
}

export function orderedDirectActions(actions: InvoiceAction[]): InvoiceAction[] {
  const order = new Map(DIRECT_INVOICE_ACTION_ORDER.map((id, i) => [id, i]));
  return [...actions].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
}

export function historyStatusDisplayLabel(row: FinancialHistoryRow, todayYmd?: string): string {
  if (row.statusPt === 'Prevista' || row.eventType === 'upcoming_cycle') return 'Prevista';
  if (row.statusPt && !['Pendente', 'Aguardando'].includes(row.statusPt)) return row.statusPt;

  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const hist = mapHistoryFinancialStatus(
    {
      operational_state: row.visual === 'failed' ? 'failed' : row.visual === 'paid' ? 'paid' : 'awaiting_generation',
      invoice_id: row.invoiceId,
      invoice_status: row.visual === 'paid' ? 'paid' : row.invoiceId ? 'pending' : null,
      due_date: row.dueYmd,
      cycle_date: row.dueYmd,
      cycle_status: row.visual === 'failed' ? 'failed' : null,
    },
    today
  );
  if (hist === 'pendente' || hist === 'prevista') return historyFinancialStatusLabel(hist);
  if (row.visual === 'failed' || (row.visual === 'overdue' && !row.invoiceId)) {
    return historyFinancialStatusLabel('falhou');
  }
  return row.statusPt;
}

export function alertPrimaryActionLabel(kind: FinancialAlertKind, hasMissingInvoice: boolean): string {
  if (kind === 'billing_missing' || hasMissingInvoice) return 'Gerar agora';
  return 'Resolver agora';
}

export function alertShowsTechnicalDetail(alert: FinancialAlert): boolean {
  return Boolean(alert.technicalDetail?.trim());
}

export function historyRowCanGenerate(row: FinancialHistoryRow, todayYmd?: string): boolean {
  if (typeof row.canGenerateNow === 'boolean') return row.canGenerateNow;

  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  if (row.invoiceId) return false;
  if (row.visual === 'future' || row.visual === 'generated') return true;
  if (row.visual === 'failed') {
    return isRecoverableCycleFailure(
      {
        operational_state: 'failed',
        invoice_id: null,
        due_date: row.dueYmd,
        cycle_date: row.dueYmd,
        cycle_status: 'failed',
      },
      today
    );
  }
  return false;
}

export function capabilitiesInputFromHistoryRow(
  row: FinancialHistoryRow,
  canViewInvoices: boolean
): InvoiceCapabilitiesInput & { eventType: FinancialEventType | null } {
  let eventType: FinancialEventType | null = row.eventType ?? null;
  if (!eventType) {
    if (row.visual === 'paid') eventType = 'payment';
    else if (row.visual === 'failed') eventType = 'invoice_failed';
    else if (row.visual === 'cancelled') eventType = 'invoice_cancelled';
    else if (row.invoiceId) eventType = 'invoice_due';
    else if (row.visual === 'future') eventType = 'upcoming_cycle';
  }

  let invoiceStatus: string | null = null;
  if (row.visual === 'paid' || row.statusPt === 'Pago' || eventType === 'payment') {
    invoiceStatus = 'paid';
  } else if (row.visual === 'cancelled' || eventType === 'invoice_cancelled') {
    invoiceStatus = 'cancelled';
  } else if (row.visual === 'overdue' || row.statusPt === 'Atrasada') {
    invoiceStatus = 'overdue';
  } else if (row.invoiceId) {
    invoiceStatus = 'pending';
  }

  return {
    invoiceId: row.invoiceId,
    canViewInvoices,
    eventType,
    invoiceStatus,
    gateway: row.gateway,
  };
}

export function calendarPopoverFields(ev: {
  competence: string | null;
  amountCents: number | null;
  statusLabel: string;
  dueYmd: string | null;
  ymd: string;
}): Array<{ label: string; key: string }> {
  return [
    { label: 'Competência', key: 'competence' },
    { label: 'Valor', key: 'amount' },
    { label: 'Status', key: 'status' },
    { label: 'Data de vencimento', key: 'due' },
  ];
}

export function usesDirectIconsNotMenu(): boolean {
  return true;
}

export function validateActionExperienceLayout(sectionIds: string[]): boolean {
  if (sectionIds.includes('financial-upcoming-agenda')) return false;
  if (sectionIds.includes('history-row-expansion') && !HISTORY_ROW_EXPANSION_ENABLED) return false;
  return sectionIds.includes('financial-history') && sectionIds.includes('financial-calendar');
}
