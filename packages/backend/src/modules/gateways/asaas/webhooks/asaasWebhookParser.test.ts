import { describe, expect, it } from 'vitest';
import { parseAsaasWebhookPayload } from './asaasWebhookParser.js';

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
