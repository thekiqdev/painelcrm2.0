import { describe, expect, it } from 'vitest';
import {
  summarizeSubscriptionCreateForLog,
  toAsaasSubscriptionCreateRequest,
  toAsaasSubscriptionCreditCardUpdateRequest,
  toAsaasSubscriptionCycle,
  toAsaasSubscriptionUpdateRequest,
} from './asaasSubscriptionMapper.js';

describe('asaasSubscriptionMapper (CA S1)', () => {
  it('mapeia ciclos comerciais → Asaas', () => {
    expect(toAsaasSubscriptionCycle('monthly')).toBe('MONTHLY');
    expect(toAsaasSubscriptionCycle('semi_annual')).toBe('SEMIANNUALLY');
    expect(toAsaasSubscriptionCycle('yearly')).toBe('YEARLY');
  });

  it('create com token: sem PAN no body; value em reais', () => {
    const body = toAsaasSubscriptionCreateRequest({
      customerId: 'cus_1',
      amountCents: 5990,
      nextDueDate: '2026-09-28',
      cycle: 'monthly',
      remoteIp: '203.0.113.10',
      creditCardToken: 'tok-abc',
      externalReference: 'tenant-1',
      description: 'Plano Pro',
    });
    expect(body).toMatchObject({
      customer: 'cus_1',
      billingType: 'CREDIT_CARD',
      value: 59.9,
      cycle: 'MONTHLY',
      nextDueDate: '2026-09-28',
      creditCardToken: 'tok-abc',
      remoteIp: '203.0.113.10',
      externalReference: 'tenant-1',
    });
    expect(body.creditCard).toBeUndefined();
  });

  it('create com PAN sanitiza dígitos e exige remoteIp', () => {
    const body = toAsaasSubscriptionCreateRequest({
      customerId: 'cus_1',
      amountCents: 10000,
      nextDueDate: '2026-09-28T12:00:00Z',
      cycle: 'monthly',
      remoteIp: '198.51.100.1',
      creditCard: {
        holderName: ' Nome ',
        number: '5162 3062 1937 8829',
        expiryMonth: '05',
        expiryYear: '2030',
        ccv: '318',
      },
      creditCardHolderInfo: {
        name: ' Nome ',
        email: ' a@b.com ',
        cpfCnpj: '249.715.637-92',
        postalCode: '89223-005',
        addressNumber: '277',
        phone: '(47) 3801-0919',
        mobilePhone: null,
      },
    });
    expect(body.nextDueDate).toBe('2026-09-28');
    expect(body.creditCard?.number).toBe('5162306219378829');
    expect(body.creditCardHolderInfo?.cpfCnpj).toBe('24971563792');
    expect(body.creditCardToken).toBeUndefined();
  });

  it('create falha sem token/PAN ou sem remoteIp', () => {
    expect(() =>
      toAsaasSubscriptionCreateRequest({
        customerId: 'cus_1',
        amountCents: 100,
        nextDueDate: '2026-09-28',
        cycle: 'monthly',
        remoteIp: '1.1.1.1',
      })
    ).toThrow(/creditCardToken|creditCard/);
    expect(() =>
      toAsaasSubscriptionCreateRequest({
        customerId: 'cus_1',
        amountCents: 100,
        nextDueDate: '2026-09-28',
        cycle: 'monthly',
        remoteIp: '',
        creditCardToken: 'tok',
      })
    ).toThrow(/remoteIp/);
  });

  it('update e creditCard update', () => {
    expect(
      toAsaasSubscriptionUpdateRequest({
        amountCents: 50000,
        updatePendingPayments: true,
        status: 'INACTIVE',
      })
    ).toEqual({
      value: 500,
      updatePendingPayments: true,
      status: 'INACTIVE',
    });
    const cc = toAsaasSubscriptionCreditCardUpdateRequest({
      remoteIp: '203.0.113.9',
      creditCardToken: 'tok-2',
    });
    expect(cc).toEqual({ remoteIp: '203.0.113.9', creditCardToken: 'tok-2' });
  });

  it('summarizeCreateForLog não inclui PAN', () => {
    const body = toAsaasSubscriptionCreateRequest({
      customerId: 'cus_1',
      amountCents: 1000,
      nextDueDate: '2026-09-28',
      cycle: 'monthly',
      remoteIp: '1.2.3.4',
      creditCard: {
        holderName: 'A',
        number: '4111111111111111',
        expiryMonth: '01',
        expiryYear: '2030',
        ccv: '123',
      },
      creditCardHolderInfo: {
        name: 'A',
        email: 'a@b.com',
        cpfCnpj: '24971563792',
        postalCode: '01310100',
        addressNumber: '1',
        phone: '11999999999',
      },
    });
    const summary = summarizeSubscriptionCreateForLog(body);
    expect(JSON.stringify(summary)).not.toMatch(/4111111111111111/);
    expect(JSON.stringify(summary)).not.toMatch(/123/);
    expect(summary.hasCreditCardPan).toBe(true);
    expect(summary.hasCreditCardToken).toBe(false);
  });
});
