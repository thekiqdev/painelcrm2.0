import { describe, expect, it } from 'vitest';
import {
  mergeGatewayPaymentFieldsForSave,
  mergePublicPayAllowedMethods,
  normalizeEnabledSlugList,
  resolveAutomaticInvoicePaymentMethod,
  pickFirstUiMethodByPreference,
} from './gatewayPaymentMethodPolicy.js';

describe('gatewayPaymentMethodPolicy', () => {
  it('normalizeEnabledSlugList dedupes and defaults', () => {
    expect(normalizeEnabledSlugList(['pix', 'PIX', 'boleto'])).toEqual(['pix', 'boleto']);
    expect(normalizeEnabledSlugList([]).length).toBe(3);
  });

  it('mergeGatewayPaymentFieldsForSave rejects explicit empty enabled list', () => {
    expect(() =>
      mergeGatewayPaymentFieldsForSave({
        existingEnabledRaw: ['pix', 'boleto'],
        existingDefault: 'pix',
        bodyEnabled: [],
        bodyDefault: undefined,
      })
    ).toThrow(/pelo menos um método/);
  });

  it('mergePublicPayAllowedMethods falls back to gateway when nothing matches stored', () => {
    const row = { enabled_payment_methods: ['credit_card'], default_payment_method: null };
    expect(mergePublicPayAllowedMethods(['PIX', 'BOLETO'], row)).toEqual(['CREDIT_CARD']);
  });

  it('resolveAutomaticInvoicePaymentMethod falls back when subscription method disabled', () => {
    const row = { enabled_payment_methods: ['boleto'], default_payment_method: null };
    expect(resolveAutomaticInvoicePaymentMethod('PIX', row)).toBe('BOLETO');
  });

  it('pickFirstUiMethodByPreference follows pix → boleto → card', () => {
    expect(pickFirstUiMethodByPreference(['CREDIT_CARD', 'BOLETO'])).toBe('BOLETO');
  });
});
