import type { BillingAggregate, BillingContext } from './types';
import { billingContextSourceSignature } from './BillingContext';

const EMPTY_SUBSCRIPTION = {
  id: '',
  status: '',
  amount_cents: 0,
  billing_interval: '',
  next_billing_date: null,
  gateway: null,
} as const;

const EMPTY_SIDEBAR = {
  nextReceiptDate: '—',
  openAmount: '—',
  alertCount: 0,
} as const;

const EMPTY_NEXT_INVOICE = {
  cycleId: null,
  invoiceId: null,
  dueYmd: null,
  statusLabel: '—',
  showGenerate: false,
  isProjected: false,
} as const;

const EMPTY_CAPABILITIES = {
  canGenerate: false,
  supportsGenerate: false,
} as const;

const EMPTY_TECHNICAL = {
  workerStatus: null,
  engineVersion: null,
} as const;

/** Instancia um Aggregate vazio com metadados do contexto. */
export function createEmptyBillingAggregate(context: BillingContext): BillingAggregate {
  return {
    subscriptionId: context.source.subscription.id,
    builtAt: context.builtAt,
    todayYmd: context.todayYmd,
    subscription: { ...EMPTY_SUBSCRIPTION, id: context.source.subscription.id },
    cycles: [],
    invoices: [],
    timeline: [],
    events: [],
    history: [],
    calendar: [],
    sidebar: { ...EMPTY_SIDEBAR },
    nextInvoice: { ...EMPTY_NEXT_INVOICE },
    alerts: [],
    capabilities: { ...EMPTY_CAPABILITIES },
    technical: { ...EMPTY_TECHNICAL },
    sourceSignature: billingContextSourceSignature(context.source),
  };
}

/** Assinatura estável do Aggregate construído (metadados + contadores). */
export function billingAggregateSignature(aggregate: BillingAggregate): string {
  return [
    aggregate.subscriptionId,
    aggregate.todayYmd,
    aggregate.sourceSignature,
    aggregate.cycles.length,
    aggregate.events.length,
    aggregate.history.length,
    aggregate.calendar.length,
    aggregate.alerts.length,
  ].join(':');
}
