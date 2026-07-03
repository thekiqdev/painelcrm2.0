import type { BillingAggregate, BillingContext } from './types';
import { billingContextSourceSignature } from './BillingContext';
import {
  EMPTY_BILLING_SUBSCRIPTION_SNAPSHOT,
  mapSubscriptionSnapshot,
} from './subscriptionSnapshot';

const EMPTY_SIDEBAR = {
  subscriptionStatus: '',
  subscriptionType: '',
  billingInterval: '',
  currency: '',
  amount: 0,
  eventCount: 0,
  lastEventDate: null,
  lastEventType: null,
  metadata: {
    subscriptionId: '',
    tenantId: '',
    customerId: null,
    cancelAtPeriodEnd: false,
    nextBillingDate: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
  },
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
    subscription: {
      ...EMPTY_BILLING_SUBSCRIPTION_SNAPSHOT,
      id: context.source.subscription.id,
    },
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
