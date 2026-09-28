import type { BillingAggregate, BillingContext } from './types';
import { billingContextSourceSignature } from './BillingContext';
import {
  EMPTY_BILLING_SUBSCRIPTION_SNAPSHOT,
  mapSubscriptionSnapshot,
} from './subscriptionSnapshot';

const EMPTY_SIDEBAR = {
  nextReceiptDate: '—',
  openAmount: 'R$ 0,00',
  lastPaymentDate: '—',
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

const EMPTY_CAPABILITIES = {
  canGenerate: false,
  canRetry: false,
  canCancel: false,
  canRefund: false,
  canPause: false,
  canResume: false,
  canReactivate: false,
  canDeleteInvoice: false,
  canOpenInvoice: false,
  canOpenSubscription: false,
  metadata: {
    subscriptionId: '',
    subscriptionStatus: '',
    cycleCount: 0,
    eventCount: 0,
    historyCount: 0,
    calendarCount: 0,
    alertCount: 0,
    hasNextInvoice: false,
    failedEventCount: 0,
    paymentEventCount: 0,
    eventsWithInvoiceCount: 0,
  },
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
    nextInvoice: null,
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
