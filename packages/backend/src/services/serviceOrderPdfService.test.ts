import { describe, expect, it } from 'vitest';
import {
  pngBufferFromSignatureData,
  renderServiceOrderPdfBuffer,
} from './serviceOrderPdfService.js';
import type { ServiceOrderDocumentModel } from './serviceOrderDocumentModel.js';

/** PNG 1×1 transparente */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function minimalModel(): ServiceOrderDocumentModel {
  return {
    tenant: {
      name: 'Tenant Teste',
      phone: null,
      email: null,
      document: null,
      responsible_name: null,
      address: null,
      city_uf: null,
      postal_code: null,
      logo_url: null,
    },
    service_order: {
      id: '00000000-0000-0000-0000-000000000001',
      number: 1,
      number_label: 'OS Nº 1',
      status: 'signed',
      issued_at_formatted: '29/10/2026',
      period_start_formatted: '—',
      period_end_formatted: '—',
      observations: '',
      total_services_cents: 0,
      total_products_cents: 0,
      total_cents: 0,
      currency: 'BRL',
      document_frozen_at: null,
    },
    client: {
      name: 'Cliente',
      trade_name: null,
      document: null,
      phone: null,
      email: null,
      address: null,
      city_uf: null,
      postal_code: null,
    },
    equipment: [],
    services: [],
    products: [],
  };
}

describe('pngBufferFromSignatureData', () => {
  it('decodifica base64 puro PNG', () => {
    const buf = pngBufferFromSignatureData({ signature_image_png_base64: TINY_PNG_B64 });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf![0]).toBe(0x89);
  });

  it('aceita data URL', () => {
    const buf = pngBufferFromSignatureData({
      signature_image_png_base64: `data:image/png;base64,${TINY_PNG_B64}`,
    });
    expect(buf?.length).toBeGreaterThan(8);
  });

  it('rejeita lixo', () => {
    expect(pngBufferFromSignatureData({ signature_image_png_base64: 'abc' })).toBeNull();
    expect(pngBufferFromSignatureData(null)).toBeNull();
  });
});

describe('renderServiceOrderPdfBuffer + assinaturas', () => {
  it('gera PDF sem quebrar quando há PNG de cliente e técnico', async () => {
    const buf = await renderServiceOrderPdfBuffer(minimalModel(), {
      signers: [
        {
          role: 'client',
          name: 'Cliente Assinou',
          signed_at: new Date().toISOString(),
          signature_data: { signature_image_png_base64: TINY_PNG_B64 },
        },
        {
          role: 'technician',
          name: 'Técnico Assinou',
          signed_at: new Date().toISOString(),
          signature_data: { signature_image_png_base64: TINY_PNG_B64 },
        },
      ],
    });
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });
});
