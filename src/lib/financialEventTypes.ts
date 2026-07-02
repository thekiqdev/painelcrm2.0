import type { FinancialBadgeVariant } from './financialStatusBadge';

/** Tipos canônicos de evento financeiro da assinatura. */
export type FinancialEventType =
  | 'payment'
  | 'invoice_generated'
  | 'invoice_due'
  | 'invoice_failed'
  | 'invoice_cancelled'
  | 'invoice_reprocessed'
  | 'invoice_refunded'
  | 'upcoming_cycle'
  | 'manual_charge'
  | 'charge_attempt';

export type FinancialEventSurface =
  | 'calendar'
  | 'timeline'
  | 'history'
  | 'upcoming'
  | 'kpi'
  | 'insights';

export type FinancialEvent = {
  id: string;
  type: FinancialEventType;
  /** Data exibida no calendário / timeline (paridade com histórico). */
  ymd: string;
  /** Vencimento do ciclo (âncora de paridade entre superfícies). */
  dueYmd: string | null;
  amountCents: number | null;
  competence: string | null;
  invoiceId: string | null;
  cycleId: string | null;
  statusLabel: string;
  statusBadge: FinancialBadgeVariant;
  gateway: string | null;
  notes: string | null;
  paidAt: string | null;
  clientName: string | null;
  lastUpdatedAt: string | null;
  cycleKey: string;
};

export type FinancialEventStoreSnapshot = {
  events: FinancialEvent[];
  builtAt: string;
  subscriptionId: string;
};

export const HISTORY_EVENT_TYPES: FinancialEventType[] = [
  'payment',
  'invoice_generated',
  'invoice_due',
  'invoice_failed',
  'invoice_cancelled',
  'invoice_reprocessed',
  'invoice_refunded',
  'manual_charge',
  'charge_attempt',
];

export const UPCOMING_EVENT_TYPES: FinancialEventType[] = [
  'upcoming_cycle',
  'invoice_failed',
  'invoice_due',
];

export const KPI_PAYMENT_TYPES: FinancialEventType[] = ['payment'];
export const KPI_OPEN_TYPES: FinancialEventType[] = ['invoice_due', 'invoice_generated', 'manual_charge'];
