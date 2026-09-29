/**
 * PV Sprint 4 — helpers de seleção de variantes na vitrine pública.
 */

import type { PublicCatalogVariant } from '@/types/products';
import { resolvePublicCatalogUnitPrice } from '@/types/products';

export function uniqueAxisValues(
  variants: PublicCatalogVariant[],
  axis: 'option1' | 'option2'
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    const val = axis === 'option1' ? v.option1_value : v.option2_value;
    if (!val || seen.has(val)) continue;
    seen.add(val);
    out.push(val);
  }
  return out;
}

export function variantAxisLabels(variants: PublicCatalogVariant[]): {
  option1?: string;
  option2?: string;
} {
  const first = variants[0];
  if (!first) return {};
  return {
    option1: first.option1_name,
    option2: first.option2_name || undefined,
  };
}

export function findVariantByOptions(
  variants: PublicCatalogVariant[],
  option1: string | null,
  option2: string | null
): PublicCatalogVariant | null {
  if (!option1) return null;
  return (
    variants.find((v) => {
      if (v.option1_value !== option1) return false;
      if (option2) return v.option2_value === option2;
      return !v.option2_value;
    }) ?? null
  );
}

/** Valores de option2 disponíveis para um option1 (só ativas com estoque se track). */
export function availableOption2Values(
  variants: PublicCatalogVariant[],
  option1: string,
  opts?: { requireStock?: boolean }
): string[] {
  const requireStock = opts?.requireStock === true;
  const vals: string[] = [];
  const seen = new Set<string>();
  for (const v of variants) {
    if (v.option1_value !== option1 || !v.option2_value) continue;
    if (requireStock && (v.stock_quantity ?? 0) <= 0) continue;
    if (seen.has(v.option2_value)) continue;
    seen.add(v.option2_value);
    vals.push(v.option2_value);
  }
  return vals;
}

export function isVariantPurchasable(
  variant: PublicCatalogVariant | null,
  trackInventory: boolean
): boolean {
  if (!variant) return false;
  if (!trackInventory) return true;
  return (variant.stock_quantity ?? 0) > 0;
}

export function variantDisplayLabel(v: PublicCatalogVariant): string {
  const a = v.option1_value;
  const b = v.option2_value;
  return b ? `${a} × ${b}` : a;
}

export function resolveVariantUnitPrice(variant: PublicCatalogVariant): number | null {
  return resolvePublicCatalogUnitPrice(variant);
}
