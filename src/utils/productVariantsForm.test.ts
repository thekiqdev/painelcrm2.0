import { describe, expect, it } from 'vitest';
import {
  VARIANT_AXIS_COR,
  VARIANT_AXIS_TAMANHO,
  axesFromVariants,
  cleanOptionValue,
  generateVariantCombinations,
  mergeGeneratedWithExisting,
  aggregateStockFromVariants,
  aggregateMinPriceFromVariants,
} from './productVariantsForm';

describe('productVariantsForm', () => {
  it('cleanOptionValue remove |hex legado', () => {
    expect(cleanOptionValue('Azul|#0066CC')).toBe('Azul');
    expect(cleanOptionValue(' Preto ')).toBe('Preto');
  });

  it('gera 2×2 Cor×Tamanho', () => {
    const { variants, error } = generateVariantCombinations([
      { name: VARIANT_AXIS_COR, values: ['Azul', 'Preto'] },
      { name: VARIANT_AXIS_TAMANHO, values: ['P', 'M'] },
    ]);
    expect(error).toBeUndefined();
    expect(variants).toHaveLength(4);
    expect(variants[0]).toMatchObject({
      option1_name: 'Cor',
      option1_value: 'Azul',
      option2_name: 'Tamanho',
      option2_value: 'P',
    });
  });

  it('gera só Tamanho', () => {
    const { variants } = generateVariantCombinations([
      { name: VARIANT_AXIS_TAMANHO, values: ['P', 'M', 'G'] },
    ]);
    expect(variants).toHaveLength(3);
    expect(variants[0]?.option1_name).toBe('Tamanho');
    expect(variants[0]?.option2_name).toBeNull();
  });

  it('merge preserva id e estoque', () => {
    const { variants: gen } = generateVariantCombinations([
      { name: VARIANT_AXIS_COR, values: ['Azul'] },
      { name: VARIANT_AXIS_TAMANHO, values: ['P', 'M'] },
    ]);
    const merged = mergeGeneratedWithExisting(gen, [
      {
        id: 'uuid-1',
        option1_name: 'Cor',
        option1_value: 'Azul',
        option2_name: 'Tamanho',
        option2_value: 'P',
        stock_quantity: 7,
        sku: 'AZ-P',
        price: 10,
      },
    ]);
    expect(merged[0]?.id).toBe('uuid-1');
    expect(merged[0]?.stock_quantity).toBe(7);
    expect(merged[0]?.sku).toBe('AZ-P');
    expect(merged[1]?.id).toBeUndefined();
  });

  it('axesFromVariants reconstrói Cor e Tamanho', () => {
    const axes = axesFromVariants([
      {
        option1_name: 'Cor',
        option1_value: 'Azul',
        option2_name: 'Tamanho',
        option2_value: 'P',
      },
      {
        option1_name: 'Cor',
        option1_value: 'Preto',
        option2_name: 'Tamanho',
        option2_value: 'M',
      },
    ]);
    expect(axes.find((a) => a.name === 'Cor')?.values.sort()).toEqual(['Azul', 'Preto']);
    expect(axes.find((a) => a.name === 'Tamanho')?.values.sort()).toEqual(['M', 'P']);
  });

  it('aggregates batem com fixture bone', () => {
    const variants = [
      { option1_name: 'Cor', option1_value: 'A', price: 69.9, stock_quantity: 2, is_active: true },
      { option1_name: 'Cor', option1_value: 'B', price: 69.9, stock_quantity: 3, is_active: true },
      { option1_name: 'Cor', option1_value: 'C', price: 74.9, stock_quantity: 1, is_active: true },
      { option1_name: 'Cor', option1_value: 'D', price: 74.9, stock_quantity: 4, is_active: true },
    ];
    expect(aggregateStockFromVariants(variants)).toBe(10);
    expect(aggregateMinPriceFromVariants(variants)).toBe(69.9);
  });
});
