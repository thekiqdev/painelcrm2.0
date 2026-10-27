import { describe, expect, it } from 'vitest';
import { calculateNextBillingDate } from './subscriptionService.js';
import {
  evaluateLateRenewalRestart,
  type LateRenewalOpenInvoice,
} from './lateRenewalRestartEligibility.js';

const AUG: LateRenewalOpenInvoice = {
  period_start: '2026-08-29',
  period_end: '2026-09-29',
  status: 'overdue',
};
const SEP: LateRenewalOpenInvoice = {
  period_start: '2026-09-29',
  period_end: '2026-10-29',
  status: 'overdue',
};

describe('evaluateLateRenewalRestart', () => {
  it('caso da tela: dois ciclos abertos e vigência vencida reancoram em 14/10–14/11', () => {
    const decision = evaluateLateRenewalRestart({
      planPeriodEnd: '2026-08-29',
      billingInterval: 'monthly',
      paymentDate: '2026-10-14',
      openRenewals: [AUG, SEP],
      asaasSubscriptionId: null,
    });
    expect(decision).toEqual({
      eligible: true,
      periodStart: '2026-10-14',
      periodEnd: '2026-11-14',
    });
  });

  it('pagamento no vencimento com uma fatura futura não é elegível', () => {
    const decision = evaluateLateRenewalRestart({
      planPeriodEnd: '2026-09-29',
      billingInterval: 'monthly',
      paymentDate: '2026-09-29',
      openRenewals: [
        {
          period_start: '2026-09-29',
          period_end: '2026-10-29',
          status: 'pending',
        },
      ],
      asaasSubscriptionId: null,
    });
    expect(decision).toEqual({ eligible: false, reason: 'plan_period_not_ended' });
  });

  it('vigência ainda futura não é elegível mesmo com duas faturas', () => {
    const decision = evaluateLateRenewalRestart({
      planPeriodEnd: '2026-10-29',
      billingInterval: 'monthly',
      paymentDate: '2026-09-29',
      openRenewals: [AUG, SEP],
      asaasSubscriptionId: null,
    });
    expect(decision).toEqual({ eligible: false, reason: 'plan_period_not_ended' });
  });

  it('atraso curto com uma fatura cujo período ainda não acabou não é elegível', () => {
    const decision = evaluateLateRenewalRestart({
      planPeriodEnd: '2026-09-29',
      billingInterval: 'monthly',
      paymentDate: '2026-10-02',
      openRenewals: [
        {
          period_start: '2026-09-29',
          period_end: '2026-10-29',
          status: 'overdue',
        },
      ],
      asaasSubscriptionId: null,
    });
    expect(decision).toEqual({ eligible: false, reason: 'insufficient_backlog' });
  });

  it('um único ciclo já encerrado não basta para o backlog', () => {
    const decision = evaluateLateRenewalRestart({
      planPeriodEnd: '2026-08-29',
      billingInterval: 'monthly',
      paymentDate: '2026-10-14',
      openRenewals: [AUG],
      asaasSubscriptionId: null,
    });
    expect(decision).toEqual({ eligible: false, reason: 'insufficient_backlog' });
  });

  it('fatura paga não conta como ciclo aberto', () => {
    const decision = evaluateLateRenewalRestart({
      planPeriodEnd: '2026-08-29',
      billingInterval: 'monthly',
      paymentDate: '2026-10-14',
      openRenewals: [AUG, { ...SEP, status: 'paid' }],
      asaasSubscriptionId: null,
    });
    expect(decision).toEqual({ eligible: false, reason: 'insufficient_backlog' });
  });

  it('assinatura Asaas não é elegível mesmo com backlog', () => {
    const decision = evaluateLateRenewalRestart({
      planPeriodEnd: '2026-08-29',
      billingInterval: 'monthly',
      paymentDate: '2026-10-14',
      openRenewals: [AUG, SEP],
      asaasSubscriptionId: 'sub_asaas_xyz',
    });
    expect(decision).toEqual({ eligible: false, reason: 'asaas_subscription' });
  });

  it('intervalo anual usa calculateNextBillingDate', () => {
    const paymentDate = '2026-10-14';
    const decision = evaluateLateRenewalRestart({
      planPeriodEnd: '2025-08-29',
      billingInterval: 'yearly',
      paymentDate,
      openRenewals: [
        { period_start: '2024-10-14', period_end: '2025-10-14', status: 'overdue' },
        { period_start: '2025-10-14', period_end: '2026-10-14', status: 'overdue' },
      ],
      asaasSubscriptionId: null,
    });
    expect(decision).toEqual({
      eligible: true,
      periodStart: paymentDate,
      periodEnd: calculateNextBillingDate(paymentDate, 'yearly', null),
    });
    expect(decision.eligible && decision.periodEnd).toBe('2027-10-14');
  });

  it('data inválida não é elegível', () => {
    const decision = evaluateLateRenewalRestart({
      planPeriodEnd: '2026-08-29',
      billingInterval: 'monthly',
      paymentDate: '14/10/2026',
      openRenewals: [AUG, SEP],
      asaasSubscriptionId: null,
    });
    expect(decision).toEqual({ eligible: false, reason: 'invalid_input' });
  });
});
