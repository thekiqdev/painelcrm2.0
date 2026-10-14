/**
 * RC S1 — elegibilidade do restart de renovação em atraso.
 * Função pura: não lê nem grava banco. S2/S3 é que aplicam o efeito.
 */
import type { BillingInterval } from './billingService.js';
import { calculateNextBillingDate } from './subscriptionService.js';

/** Mesmos status abertos de `SAAS_PLAN_SIBLING_OPEN_STATUSES`, sem importar o CRUD. */
export const LATE_RENEWAL_OPEN_STATUSES = [
  'pending',
  'waiting_payment',
  'processing',
  'overdue',
] as const;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const INTERVALS = new Set<BillingInterval>([
  'weekly',
  'monthly',
  'quarterly',
  'semi_annual',
  'yearly',
]);

export type LateRenewalOpenInvoice = {
  period_start: string | null;
  period_end: string | null;
  status: string;
};

export type LateRenewalRestartInput = {
  planPeriodEnd: string | null;
  billingInterval: BillingInterval;
  /** YYYY-MM-DD da baixa / do restart. */
  paymentDate: string;
  openRenewals: LateRenewalOpenInvoice[];
  /** Preenchido = cartão gerenciado no Asaas; fora do restart (D-RC.8). */
  asaasSubscriptionId: string | null;
};

export type LateRenewalRestartIneligibleReason =
  | 'invalid_input'
  | 'asaas_subscription'
  | 'plan_period_not_ended'
  | 'insufficient_backlog';

export type LateRenewalRestartDecision =
  | { eligible: true; periodStart: string; periodEnd: string }
  | { eligible: false; reason: LateRenewalRestartIneligibleReason };

function isYmd(value: string | null | undefined): value is string {
  return typeof value === 'string' && YMD.test(value);
}

/**
 * D-RC.2: vigência já acabou e há mais de um ciclo `plan_renewal` aberto,
 * com pelo menos um período já encerrado antes da data do pagamento.
 * D-RC.4: período novo começa na data do pagamento; o fim usa `calculateNextBillingDate`.
 */
export function evaluateLateRenewalRestart(
  input: LateRenewalRestartInput
): LateRenewalRestartDecision {
  const paymentDate = input.paymentDate.trim();
  const planPeriodEnd = input.planPeriodEnd?.trim() ?? '';
  if (!isYmd(paymentDate) || !INTERVALS.has(input.billingInterval)) {
    return { eligible: false, reason: 'invalid_input' };
  }
  if (planPeriodEnd !== '' && !isYmd(planPeriodEnd)) {
    return { eligible: false, reason: 'invalid_input' };
  }

  if ((input.asaasSubscriptionId ?? '').trim() !== '') {
    return { eligible: false, reason: 'asaas_subscription' };
  }

  if (planPeriodEnd === '' || planPeriodEnd >= paymentDate) {
    return { eligible: false, reason: 'plan_period_not_ended' };
  }

  const open = input.openRenewals.filter((row) =>
    (LATE_RENEWAL_OPEN_STATUSES as readonly string[]).includes(row.status)
  );
  const elapsed = open.filter((row) => isYmd(row.period_end) && row.period_end < paymentDate);
  if (open.length < 2 || elapsed.length < 1) {
    return { eligible: false, reason: 'insufficient_backlog' };
  }

  try {
    const periodEnd = calculateNextBillingDate(paymentDate, input.billingInterval, null);
    return { eligible: true, periodStart: paymentDate, periodEnd };
  } catch {
    return { eligible: false, reason: 'invalid_input' };
  }
}
