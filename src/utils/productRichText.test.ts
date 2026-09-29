import { describe, expect, it } from 'vitest';
import {
  isProductDescriptionHtml,
  productDescriptionDisplayHtml,
  productDescriptionPlainText,
} from './productRichText';

describe('productRichText', () => {
  it('detecta HTML vs texto plano', () => {
    expect(isProductDescriptionHtml('<p>Oi</p>')).toBe(true);
    expect(isProductDescriptionHtml('Oi mundo')).toBe(false);
  });

  it('converte texto plano preservando quebras', () => {
    const html = productDescriptionDisplayHtml('Linha 1\nLinha 2\n\nParágrafo 2');
    expect(html).toContain('<p>');
    expect(html).toContain('<br>');
    expect(html).toContain('Linha 1');
  });

  it('extrai texto plano de HTML', () => {
    expect(productDescriptionPlainText('<p>Boné <strong>azul</strong></p>')).toBe('Boné azul');
  });
});
