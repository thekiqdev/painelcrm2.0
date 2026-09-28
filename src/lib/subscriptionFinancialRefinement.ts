import type { FinancialCalendarKind } from './subscriptionFinancialExperience';
import type { FinancialHistoryFilter, FinancialKpiKey } from './subscriptionFinancialExperience';
import type { FinancialAlert, FinancialAlertKind } from './subscriptionFinancialExperience';
import type { UpcomingReceipt } from './subscriptionFinancialExperience';
import { resolveKpiNavigation } from './subscriptionFinancialConsistency';

export const UPCOMING_VISIBLE_DEFAULT = 4;
export const UPCOMING_EXPAND_BATCH = 8;
export const UPCOMING_SCROLL_MAX_PX = 320;

export type KpiClickAction =
  | { type: 'scroll_history'; filter: FinancialHistoryFilter }
  | { type: 'open_invoice'; invoiceId: string }
  | { type: 'scroll_to'; targetId: string }
  | { type: 'none' };

export type ErrorResolveModalContent = {
  title: string;
  reason: string;
  solution: string;
  actionLabel: string;
};

export function sliceUpcomingReceipts(
  receipts: UpcomingReceipt[],
  showAll: boolean
): { visible: UpcomingReceipt[]; hiddenCount: number; canExpand: boolean } {
  if (showAll || receipts.length <= UPCOMING_VISIBLE_DEFAULT) {
    return { visible: receipts, hiddenCount: 0, canExpand: false };
  }
  return {
    visible: receipts.slice(0, UPCOMING_VISIBLE_DEFAULT),
    hiddenCount: receipts.length - UPCOMING_VISIBLE_DEFAULT,
    canExpand: true,
  };
}

export function upcomingExpandLabel(hiddenCount: number): string {
  const n = Math.min(hiddenCount, UPCOMING_EXPAND_BATCH);
  return `Mostrar mais ${n} ciclo${n === 1 ? '' : 's'}`;
}

export function paymentEventChipLabel(kind: FinancialCalendarKind): string {
  const map: Record<FinancialCalendarKind, string> = {
    paid: 'Pago',
    invoiced: 'Emitida',
    due: 'Vencimento',
    overdue: 'Atrasada',
    failed: 'Falhou',
    cancelled: 'Cancelada',
    reprocessed: 'Reprocessada',
  };
  return map[kind];
}

export function paymentEventChipVariant(
  kind: FinancialCalendarKind
): 'paid' | 'invoiced' | 'due' | 'overdue' | 'failed' | 'cancelled' | 'muted' {
  if (kind === 'paid') return 'paid';
  if (kind === 'failed') return 'failed';
  if (kind === 'invoiced') return 'invoiced';
  if (kind === 'due') return 'due';
  if (kind === 'overdue') return 'overdue';
  if (kind === 'cancelled') return 'cancelled';
  return 'muted';
}

export function resolveKpiClickAction(
  key: FinancialKpiKey,
  latestPaidInvoiceId: string | null | undefined,
  nextReceiptYmd?: string | null
): KpiClickAction {
  const nav = resolveKpiNavigation(key, latestPaidInvoiceId, nextReceiptYmd);
  if (nav.type === 'history') return { type: 'scroll_history', filter: nav.filter };
  if (nav.type === 'open_invoice') return { type: 'open_invoice', invoiceId: nav.invoiceId };
  if (nav.type === 'scroll') return { type: 'scroll_to', targetId: nav.targetId };
  return { type: 'none' };
}

export function isKpiClickable(key: FinancialKpiKey): boolean {
  return (
    key === 'received' ||
    key === 'open' ||
    key === 'last_payment' ||
    key === 'next_receipt' ||
    key === 'status'
  );
}

export function exclusiveAccordionKey(
  currentOpen: string | null,
  toggledKey: string
): string | null {
  return currentOpen === toggledKey ? null : toggledKey;
}

export function resolveErrorModalContent(alert: FinancialAlert): ErrorResolveModalContent {
  const byKind: Record<FinancialAlertKind, ErrorResolveModalContent> = {
    billing_missing: {
      title: 'Cobrança não foi criada',
      reason: 'A cobrança do ciclo atual ainda não foi emitida automaticamente.',
      solution: 'Gere a cobrança manualmente para continuar o fluxo de recebimento.',
      actionLabel: 'Gerar agora',
    },
    client_overdue: {
      title: 'Cliente em atraso',
      reason: alert.message,
      solution: 'Envie um lembrete ao cliente ou confirme o pagamento na fatura em aberto.',
      actionLabel: 'Ver cobranças em aberto',
    },
    gateway_failed: {
      title: 'Pagamento recusado',
      reason: 'O gateway não confirmou esta cobrança.',
      solution: 'Revise o meio de pagamento do cliente ou tente gerar novamente.',
      actionLabel: 'Tentar novamente',
    },
  };
  return byKind[alert.kind];
}

export function calendarHoverSummary(
  day: number,
  dateLabel: string,
  title: string,
  amountLabel: string | null
): string {
  const parts = [`${day} — ${dateLabel}`, title];
  if (amountLabel) parts.push(amountLabel);
  return parts.join(' · ');
}

export function shouldUseUpcomingInternalScroll(
  itemCount: number,
  showAll: boolean
): boolean {
  if (!showAll) return false;
  return itemCount > UPCOMING_VISIBLE_DEFAULT + 2;
}

export function upcomingListMaxHeightPx(useScroll: boolean): number | undefined {
  return useScroll ? UPCOMING_SCROLL_MAX_PX : undefined;
}

export function swipeMonthDirection(deltaX: number, threshold = 48): 'prev' | 'next' | null {
  if (deltaX > threshold) return 'prev';
  if (deltaX < -threshold) return 'next';
  return null;
}

export function historyFilterFromHash(hash: string): FinancialHistoryFilter | null {
  const m = hash.match(/^#financial-history-(all|paid|pending|overdue|cancelled|refunded)$/);
  return m ? (m[1] as FinancialHistoryFilter) : null;
}

export function invoiceOpensNewTabProps(): { target: '_blank'; rel: 'noopener noreferrer' } {
  return { target: '_blank', rel: 'noopener noreferrer' };
}

export function keyboardActivatesClick(key: string): boolean {
  return key === 'Enter' || key === ' ';
}

export function focusTrapSelector(): string {
  return '[data-focus-trap-root] button, [data-focus-trap-root] a, [data-focus-trap-root] [href]';
}
