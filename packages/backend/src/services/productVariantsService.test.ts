import { describe, expect, it } from 'vitest';
import {
  aggregateParentFromVariants,
  collectVariantImageUrls,
  normalizeVariantAxisName,
  normalizeVariantInput,
  ProductVariantsValidationError,
} from './productVariantsService.js';

describe('productVariantsService — normalize', () => {
  it('mapeia aliases Color/Size para Cor/Tamanho', () => {
    expect(normalizeVariantAxisName('Color')).toBe('Cor');
    expect(normalizeVariantAxisName('size')).toBe('Tamanho');
    expect(normalizeVariantAxisName('Cor')).toBe('Cor');
  });

  it('rejeita eixo fora do MVP', () => {
    expect(() => normalizeVariantAxisName('Peso')).toThrow(ProductVariantsValidationError);
  });

  it('normaliza variante Cor×Tamanho', () => {
    const v = normalizeVariantInput({
      option1_name: 'color',
      option1_value: ' Azul ',
      option2_name: 'Size',
      option2_value: 'M',
      sku: '  BON-1  ',
      stock_quantity: 3,
      price: 69.9,
    });
    expect(v.option1_name).toBe('Cor');
    expect(v.option1_value).toBe('Azul');
    expect(v.option2_name).toBe('Tamanho');
    expect(v.option2_value).toBe('M');
    expect(v.sku).toBe('BON-1');
  });

  it('permite só um eixo', () => {
    const v = normalizeVariantInput({
      option1_name: 'Cor',
      option1_value: 'Preto',
      stock_quantity: 1,
    });
    expect(v.option2_name).toBeNull();
    expect(v.option2_value).toBeNull();
  });

  it('rejeita option2 incompleto', () => {
    expect(() =>
      normalizeVariantInput({
        option1_name: 'Cor',
        option1_value: 'Azul',
        option2_name: 'Tamanho',
      })
    ).toThrow(/option2/);
  });
});

describe('productVariantsService — aggregates', () => {
  it('soma estoque e min preço só das ativas (fixture bone)', () => {
    const { stock_quantity, price } = aggregateParentFromVariants([
      { option1_name: 'Cor', option1_value: 'Azul', option2_name: 'Tamanho', option2_value: 'P', price: 69.9, stock_quantity: 2, is_active: true },
      { option1_name: 'Cor', option1_value: 'Azul', option2_name: 'Tamanho', option2_value: 'M', price: 69.9, stock_quantity: 3, is_active: true },
      { option1_name: 'Cor', option1_value: 'Preto', option2_name: 'Tamanho', option2_value: 'P', price: 74.9, stock_quantity: 1, is_active: true },
      { option1_name: 'Cor', option1_value: 'Preto', option2_name: 'Tamanho', option2_value: 'M', price: 74.9, stock_quantity: 4, is_active: true },
      { option1_name: 'Cor', option1_value: 'Off', option2_name: 'Tamanho', option2_value: 'G', price: 10, stock_quantity: 99, is_active: false },
    ]);
    expect(stock_quantity).toBe(10);
    expect(price).toBe(69.9);
  });
});

describe('productVariantsService — images', () => {
  it('coleta URLs das variantes', () => {
    expect(
      collectVariantImageUrls([
        { images: ['https://a.jpg', 'https://b.jpg'] },
        { images: null },
        { images: ['https://c.jpg'] },
      ])
    ).toEqual(['https://a.jpg', 'https://b.jpg', 'https://c.jpg']);
  });
});
