import { describe, expect, it } from 'vitest';
import { parseAsaasWebhookPayload } from './asaasWebhookParser.js';
import {
  isAsaasSubscriptionEvent,
  ASAAS_SUBSCRIPTION_WEBHOOK_EVENT_NAMES,
  ASAAS_EVENT,
} from '../asaasEvents.js';

describe('parseAsaasWebhookPayload — Pix Automático 1º pagamento', () => {
  it('usa pixQrCodeId como conciliation quando conciliationIdentifier ausente', () => {
    const parsed = parseAsaasWebhookPayload({
      id: 'evt_test',
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_auto_generated',
        status: 'RECEIVED',
        billingType: 'PIX',
        externalReference: null,
        pixQrCodeId: 'KAIQUESILVASANTOS400000677984172ASA',
        description: 'Cobrança gerada automaticamente a partir de Pix recebido.',
      },
    });
    expect(parsed.referenceId).toBe('pay_auto_generated');
    expect(parsed.metadata?.conciliationIdentifier).toBe(
      'KAIQUESILVASANTOS400000677984172ASA'
    );
    expect(parsed.metadata?.pixQrCodeId).toBe('KAIQUESILVASANTOS400000677984172ASA');
  });

  it('prioriza conciliationIdentifier explícito', () => {
    const parsed = parseAsaasWebhookPayload({
      id: 'evt_test2',
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_1',
        status: 'RECEIVED',
        billingType: 'PIX',
        conciliationIdentifier: 'ASAAS000000000000000000000000550ASA',
        pixQrCodeId: 'OTHER',
      },
    });
    expect(parsed.metadata?.conciliationIdentifier).toBe(
      'ASAAS000000000000000000000000550ASA'
    );
    expect(parsed.metadata?.pixQrCodeId).toBe('OTHER');
  });
});

describe('CA S0 — Assinatura Asaas no parser/eventos', () => {
  it('extrai payment.subscription como asaasSubscriptionId', () => {
    const parsed = parseAsaasWebhookPayload({
      id: 'evt_sub_pay',
      event: 'PAYMENT_CONFIRMED',
      payment: {
        id: 'pay_sub_1',
        status: 'CONFIRMED',
        billingType: 'CREDIT_CARD',
        subscription: 'sub_m5gdy1upm25fbwgx',
      },
    });
    expect(parsed.metadata?.asaasSubscriptionId).toBe('sub_m5gdy1upm25fbwgx');
    expect(parsed.metadata?.paymentMethod).toBe('CREDIT_CARD');
    expect(parsed.metadata?.eventType).toBe('PAYMENT_CONFIRMED');
  });

  it('extrai dueDate, value e externalReference da cobrança da assinatura', () => {
    const parsed = parseAsaasWebhookPayload({
      id: 'evt_sub_pay2',
      event: 'PAYMENT_CREATED',
      payment: {
        id: 'pay_sub_2',
        status: 'PENDING',
        billingType: 'CREDIT_CARD',
        subscription: 'sub_abc',
        dueDate: '2026-10-01',
        value: 199.9,
        externalReference: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
    });
    expect(parsed.metadata?.dueDate).toBe('2026-10-01');
    expect(parsed.metadata?.amountCents).toBe(19990);
    expect(parsed.metadata?.externalReference).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });

  it('reconhece eventos SUBSCRIPTION_* e captura recusada', () => {
    expect(isAsaasSubscriptionEvent('SUBSCRIPTION_CREATED')).toBe(true);
    expect(isAsaasSubscriptionEvent('PAYMENT_CREATED')).toBe(false);
    expect(ASAAS_SUBSCRIPTION_WEBHOOK_EVENT_NAMES).toContain('SUBSCRIPTION_DELETED');
    expect(ASAAS_EVENT.PAYMENT_CREDIT_CARD_CAPTURE_REFUSED).toBe(
      'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED'
    );
  });
});
