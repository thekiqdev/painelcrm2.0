import { describe, expect, it } from 'vitest';
import { buildPublicPayPayloadMeta } from './publicPayPayloadMeta.js';

describe('buildPublicPayPayloadMeta', () => {
  it('retorna none quando não há URLs nem PIX', () => {
    expect(buildPublicPayPayloadMeta({})).toEqual({
      has_payment_payload: false,
      payment_options_summary: 'none',
    });
  });

  it('detecta PIX só com copia e cola', () => {
    expect(buildPublicPayPayloadMeta({ pixCopyPaste: '  emv123  ' })).toEqual({
      has_payment_payload: true,
      payment_options_summary: 'pix',
    });
  });

  it('detecta PIX com QR string não vazia', () => {
    expect(buildPublicPayPayloadMeta({ pixQrCode: 'data:image/png;base64,abc' })).toEqual({
      has_payment_payload: true,
      payment_options_summary: 'pix',
    });
  });

  it('detecta hosted com invoiceUrl', () => {
    expect(
      buildPublicPayPayloadMeta({ invoiceUrl: 'https://gateway.example/pay/1' })
    ).toEqual({
      has_payment_payload: true,
      payment_options_summary: 'hosted',
    });
  });

  it('detecta hosted com boleto', () => {
    expect(buildPublicPayPayloadMeta({ bankSlipUrl: 'https://boleto.pdf' })).toEqual({
      has_payment_payload: true,
      payment_options_summary: 'hosted',
    });
  });

  it('detecta hosted só com linha digitável do boleto', () => {
    expect(
      buildPublicPayPayloadMeta({ bankSlipDigitableLine: '00190000090275928800021932978170187890000005000' })
    ).toEqual({
      has_payment_payload: true,
      payment_options_summary: 'hosted',
    });
  });

  it('detecta pix_and_hosted quando ambos presentes', () => {
    expect(
      buildPublicPayPayloadMeta({
        pixCopyPaste: 'x',
        invoiceUrl: 'https://x',
      })
    ).toEqual({
      has_payment_payload: true,
      payment_options_summary: 'pix_and_hosted',
    });
  });
});
