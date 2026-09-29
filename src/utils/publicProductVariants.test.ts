import { describe, expect, it } from 'vitest';
import {
  findVariantByOptions,
  uniqueAxisValues,
  variantDisplayLabel,
  availableOption2Values,
  isVariantPurchasable,
} from './publicProductVariants';
import { formatPublicCatalogListPrice } from '@/types/products';
import type { PublicCatalogVariant } from '@/types/products';

const sample: PublicCatalogVariant[] = [
  {
    id: '1',
    option1_name: 'Cor',
    option1_value: 'Azul',
    option2_name: 'Tamanho',
    option2_value: 'P',
    price: 69.9,
    stock_quantity: 2,
  },
  {
    id: '2',
    option1_name: 'Cor',
    option1_value: 'Azul',
    option2_name: 'Tamanho',
    option2_value: 'M',
    price: 69.9,
    stock_quantity: 0,
  },
  {
    id: '3',
    option1_name: 'Cor',
    option1_value: 'Preto',
    option2_name: 'Tamanho',
    option2_value: 'P',
    price: 74.9,
    stock_quantity: 1,
  },
];

describe('publicProductVariants', () => {
  it('uniqueAxisValues', () => {
    expect(uniqueAxisValues(sample, 'option1')).toEqual(['Azul', 'Preto']);
    expect(uniqueAxisValues(sample, 'option2')).toEqual(['P', 'M']);
  });

  it('findVariantByOptions', () => {
    expect(findVariantByOptions(sample, 'Azul', 'M')?.id).toBe('2');
    expect(findVariantByOptions(sample, 'Preto', 'M')).toBeNull();
  });

  it('availableOption2Values com estoque', () => {
    expect(availableOption2Values(sample, 'Azul', { requireStock: true })).toEqual(['P']);
    expect(availableOption2Values(sample, 'Azul')).toEqual(['P', 'M']);
  });

  it('isVariantPurchasable', () => {
    expect(isVariantPurchasable(sample[1]!, true)).toBe(false);
    expect(isVariantPurchasable(sample[1]!, false)).toBe(true);
  });

  it('variantDisplayLabel', () => {
    expect(variantDisplayLabel(sample[0]!)).toBe('Azul × P');
  });
});

describe('formatPublicCatalogListPrice', () => {
  it('mostra a partir de para variável', () => {
    expect(
      formatPublicCatalogListPrice({
        id: '1',
        name: 'X',
        type: 'product',
        currency: 'BRL',
        images: [],
        features: [],
        price: 69.9,
        has_variants: true,
        price_max: 74.9,
      })
    ).toMatch(/A partir de/);
  });
});
