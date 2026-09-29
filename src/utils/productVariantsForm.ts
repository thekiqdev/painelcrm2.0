/**
 * PV Sprint 2 — helpers de eixos Cor/Tamanho e grade de variantes (front).
 */

import type { ProductVariant, ProductVariation } from '@/types/products';

export const VARIANT_AXIS_COR = 'Cor' as const;
export const VARIANT_AXIS_TAMANHO = 'Tamanho' as const;

export type VariantAxisName = typeof VARIANT_AXIS_COR | typeof VARIANT_AXIS_TAMANHO;

export const COLOR_SWATCH_MAP: Record<string, string> = {
  Branco: '#FFFFFF',
  Preto: '#000000',
  Azul: '#0066CC',
  'Azul claro': '#7EC8E3',
  Vermelho: '#FF0000',
  Verde: '#00CC66',
  Amarelo: '#FFCC00',
  Rosa: '#FF69B4',
  Cinza: '#808080',
  Marrom: '#8B4513',
  Roxo: '#9933CC',
  Laranja: '#FF8800',
  Bege: '#F5F5DC',
};

export const SIZE_SUGGESTIONS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'] as const;

/** Nome limpo (remove sufixo `|hex` legado). */
export function cleanOptionValue(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  if (t.includes('|')) return t.split('|')[0]!.trim();
  return t;
}

export function colorHexForValue(value: string): string | null {
  const name = cleanOptionValue(value);
  return COLOR_SWATCH_MAP[name] ?? null;
}

export function getAxisValues(axes: ProductVariation[] | undefined, name: VariantAxisName): string[] {
  const axis = (axes || []).find((a) => a.name === name);
  if (!axis) return [];
  return axis.values.map(cleanOptionValue).filter(Boolean);
}

export function setAxisValues(
  axes: ProductVariation[] | undefined,
  name: VariantAxisName,
  values: string[]
): ProductVariation[] {
  const cleaned = values.map(cleanOptionValue).filter(Boolean);
  const others = (axes || []).filter((a) => a.name !== name);
  return [...others, { name, values: cleaned }];
}

export function isAxisEnabled(axes: ProductVariation[] | undefined, name: VariantAxisName): boolean {
  return getAxisValues(axes, name).length > 0 || (axes || []).some((a) => a.name === name);
}

/** Reconstrói eixos a partir das variantes (edição). */
export function axesFromVariants(variants: ProductVariant[] | undefined): ProductVariation[] {
  if (!variants?.length) return [];
  const cor = new Set<string>();
  const tam = new Set<string>();
  let hasCor = false;
  let hasTam = false;

  for (const v of variants) {
    const n1 = v.option1_name;
    const n2 = v.option2_name;
    if (n1 === VARIANT_AXIS_COR || n2 === VARIANT_AXIS_COR) hasCor = true;
    if (n1 === VARIANT_AXIS_TAMANHO || n2 === VARIANT_AXIS_TAMANHO) hasTam = true;

    if (n1 === VARIANT_AXIS_COR) cor.add(cleanOptionValue(v.option1_value));
    if (n2 === VARIANT_AXIS_COR && v.option2_value) cor.add(cleanOptionValue(v.option2_value));
    if (n1 === VARIANT_AXIS_TAMANHO) tam.add(cleanOptionValue(v.option1_value));
    if (n2 === VARIANT_AXIS_TAMANHO && v.option2_value) tam.add(cleanOptionValue(v.option2_value));
  }

  const axes: ProductVariation[] = [];
  if (hasCor || cor.size > 0) {
    axes.push({ name: VARIANT_AXIS_COR, values: Array.from(cor) });
  }
  if (hasTam || tam.size > 0) {
    axes.push({ name: VARIANT_AXIS_TAMANHO, values: Array.from(tam) });
  }
  return axes;
}

export type GenerateCombinationsResult = {
  variants: ProductVariant[];
  error?: string;
};

/**
 * Gera grade cartesiana Cor × Tamanho (1 ou 2 eixos).
 * Ordem canônica: option1=Cor (se houver), senão Tamanho; option2=Tamanho se ambos.
 */
export function generateVariantCombinations(
  axes: ProductVariation[] | undefined
): GenerateCombinationsResult {
  const colors = getAxisValues(axes, VARIANT_AXIS_COR);
  const sizes = getAxisValues(axes, VARIANT_AXIS_TAMANHO);

  if (colors.length === 0 && sizes.length === 0) {
    return { variants: [], error: 'Marque Cor e/ou Tamanho e adicione ao menos um valor' };
  }

  const variants: ProductVariant[] = [];
  let position = 0;

  if (colors.length > 0 && sizes.length > 0) {
    for (const c of colors) {
      for (const s of sizes) {
        variants.push({
          option1_name: VARIANT_AXIS_COR,
          option1_value: c,
          option2_name: VARIANT_AXIS_TAMANHO,
          option2_value: s,
          stock_quantity: 0,
          images: [],
          is_active: true,
          position: position++,
        });
      }
    }
  } else if (colors.length > 0) {
    for (const c of colors) {
      variants.push({
        option1_name: VARIANT_AXIS_COR,
        option1_value: c,
        option2_name: null,
        option2_value: null,
        stock_quantity: 0,
        images: [],
        is_active: true,
        position: position++,
      });
    }
  } else {
    for (const s of sizes) {
      variants.push({
        option1_name: VARIANT_AXIS_TAMANHO,
        option1_value: s,
        option2_name: null,
        option2_value: null,
        stock_quantity: 0,
        images: [],
        is_active: true,
        position: position++,
      });
    }
  }

  return { variants };
}

function comboKey(v: Pick<ProductVariant, 'option1_value' | 'option2_value'>): string {
  return `${cleanOptionValue(v.option1_value)}||${cleanOptionValue(v.option2_value || '')}`;
}

/** Preserva id/sku/preço/estoque/foto/ativo ao regenerar a grade. */
export function mergeGeneratedWithExisting(
  generated: ProductVariant[],
  existing: ProductVariant[] | undefined,
  defaults?: { price?: number | null }
): ProductVariant[] {
  const byKey = new Map((existing || []).map((v) => [comboKey(v), v]));
  return generated.map((g, i) => {
    const prev = byKey.get(comboKey(g));
    if (prev) {
      return {
        ...g,
        id: prev.id,
        sku: prev.sku,
        price: prev.price,
        discount_price: prev.discount_price,
        stock_quantity: prev.stock_quantity ?? 0,
        min_stock_quantity: prev.min_stock_quantity,
        images: prev.images?.length ? prev.images : [],
        is_active: prev.is_active !== false,
        external_id: prev.external_id,
        position: i,
      };
    }
    return {
      ...g,
      price: defaults?.price ?? undefined,
      position: i,
    };
  });
}

export function aggregateStockFromVariants(variants: ProductVariant[] | undefined): number {
  return (variants || [])
    .filter((v) => v.is_active !== false)
    .reduce((sum, v) => sum + (Number(v.stock_quantity) || 0), 0);
}

export function aggregateMinPriceFromVariants(variants: ProductVariant[] | undefined): number | undefined {
  const prices = (variants || [])
    .filter((v) => v.is_active !== false)
    .map((v) => (v.price == null || Number.isNaN(Number(v.price)) ? null : Number(v.price)))
    .filter((p): p is number => p != null);
  if (prices.length === 0) return undefined;
  return Math.min(...prices);
}

export function variantRowLabel(v: ProductVariant): string {
  const a = cleanOptionValue(v.option1_value);
  const b = v.option2_value ? cleanOptionValue(v.option2_value) : '';
  return b ? `${a} × ${b}` : a;
}
