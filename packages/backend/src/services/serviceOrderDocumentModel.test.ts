import { describe, expect, it } from 'vitest';
import {
  buildServiceOrderDocumentHtml,
  formatMoneyLabel,
  stripServiceOrderBrandNameWhenLogoPresent,
  type ServiceOrderDocumentModel,
} from './serviceOrderDocumentModel.js';

const sample: ServiceOrderDocumentModel = {
  tenant: {
    name: 'Tec Suprema',
    document: '62.710.770/0001-85',
    phone: '(11)94727-4015',
    email: 'tecsupremajhf@gmail.com',
    address: 'Rua da Solidariedade, 32',
    city_uf: 'São Paulo/SP',
    postal_code: '05868-250',
    responsible_name: 'FABIO GOMES',
    logo_url: null,
  },
  service_order: {
    id: '00000000-0000-0000-0000-000000000001',
    number: 138,
    number_label: 'ORDEM DE SERVIÇO Nº 138',
    status: 'draft',
    issued_at_formatted: '22/09/2026',
    period_start_formatted: '22/09/2026 - 18:36',
    period_end_formatted: '____/____/________ - ____:____',
    observations: 'Unidade - IFC',
    currency: 'BRL',
    total_services_cents: 23000,
    total_products_cents: 20000,
    total_cents: 43000,
    document_frozen_at: null,
  },
  client: {
    name: 'OIKOS SOLUCOES AMBIENTAIS LTDA',
    trade_name: 'GRUPO OIKOS',
    document: '17.024.794/0001-26',
    email: 'sonia@grupooikos.com.br',
    phone: '(11)3569-6581',
    address: 'RUA FRADIQUE COUTINHO, 2207 - PINHEIROS',
    city_uf: 'São Paulo/SP',
    postal_code: '05416-012',
  },
  equipment: [
    {
      name: 'LAVA E SECA',
      brand: 'SAMSUNG',
      model: null,
      serial: null,
      defects: 'NÃO ESTÁ SECANDO.',
    },
  ],
  services: [
    { index: 1, name: 'MÃO DE OBRA', unit: 'UN', quantity: 1, unit_price_cents: 23000, subtotal_cents: 23000 },
  ],
  products: [
    { index: 1, name: 'MAÇANETA DA PORTA', unit: 'UN', quantity: 1, unit_price_cents: 8000, subtotal_cents: 8000 },
    { index: 2, name: 'TERMOSTATO', unit: 'UN', quantity: 2, unit_price_cents: 6000, subtotal_cents: 12000 },
  ],
};

describe('serviceOrderDocumentModel', () => {
  it('formats total like the PDF model', () => {
    expect(formatMoneyLabel(43000, 'BRL')).toBe('R$ 430,00');
  });

  it('builds HTML with required sections', () => {
    const html = buildServiceOrderDocumentHtml(sample);
    expect(html).toContain('ORDEM DE SERVIÇO Nº 138');
    expect(html).toContain('OIKOS SOLUCOES AMBIENTAIS LTDA');
    expect(html).toContain('MÃO DE OBRA');
    expect(html).toContain('TERMOSTATO');
    expect(html).toContain('Assinatura do cliente');
    expect(html).toContain('TOTAL: R$ 430,00');
    expect(html).toContain('os-brand');
    expect(html).toContain('Tec Suprema');
  });

  it('omits company name in header when logo is present', () => {
    const html = buildServiceOrderDocumentHtml({
      ...sample,
      tenant: { ...sample.tenant, logo_url: 'data:image/png;base64,abc' },
    });
    expect(html).toContain('os-logo');
    expect(html).not.toContain('os-brand');
  });

  it('strips legacy os-brand from snapshots that already have logo', () => {
    const legacy =
      '<div class="os-header-brand"><img class="os-logo" src="x"/><p class="os-brand">Empresa X</p></div>';
    expect(stripServiceOrderBrandNameWhenLogoPresent(legacy)).not.toContain('os-brand');
    expect(stripServiceOrderBrandNameWhenLogoPresent(legacy)).toContain('os-logo');
  });
});
