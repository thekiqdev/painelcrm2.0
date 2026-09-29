import React, { useEffect, useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { PublicCatalogProduct, PublicCatalogVariant } from '@/types/products';
import {
  availableOption2Values,
  findVariantByOptions,
  isVariantPurchasable,
  uniqueAxisValues,
  variantAxisLabels,
} from '@/utils/publicProductVariants';
import { cn } from '@/lib/utils';

type Props = {
  product: PublicCatalogProduct;
  value: PublicCatalogVariant | null;
  onChange: (variant: PublicCatalogVariant | null) => void;
};

export function PublicProductVariantSelector({ product, value, onChange }: Props) {
  const variants = product.variants ?? [];
  const labels = variantAxisLabels(variants);
  const colors = uniqueAxisValues(variants, 'option1');
  const hasOption2 = Boolean(labels.option2);
  const track = product.track_inventory !== false;

  const [opt1, setOpt1] = useState<string>(() => value?.option1_value || colors[0] || '');
  const [opt2, setOpt2] = useState<string>(() => value?.option2_value || '');

  const opt2Choices = useMemo(() => {
    if (!opt1 || !hasOption2) return [] as string[];
    return availableOption2Values(variants, opt1);
  }, [opt1, hasOption2, variants]);

  // Ao trocar Cor, garante Tamanho válido
  useEffect(() => {
    if (!hasOption2) return;
    if (opt2 && opt2Choices.includes(opt2)) return;
    setOpt2(opt2Choices[0] || '');
  }, [opt1, hasOption2, opt2, opt2Choices]);

  // Propaga variante selecionada
  useEffect(() => {
    if (!opt1) {
      onChange(null);
      return;
    }
    if (hasOption2) {
      onChange(opt2 ? findVariantByOptions(variants, opt1, opt2) : null);
      return;
    }
    onChange(findVariantByOptions(variants, opt1, null));
    // Intentionally omit onChange to avoid loops when parent recreates the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opt1, opt2, hasOption2, variants]);

  if (!product.has_variants || variants.length === 0) return null;

  const selectedOk = isVariantPurchasable(value, track);

  return (
    <div className="space-y-4 text-left">
      {labels.option1 && (
        <div className="space-y-2">
          <Label>{labels.option1}</Label>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setOpt1(c)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm transition-colors',
                  opt1 === c
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:border-primary/50'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasOption2 && labels.option2 && (
        <div className="space-y-2">
          <Label>{labels.option2}</Label>
          <div className="flex flex-wrap gap-2">
            {opt2Choices.map((s) => {
              const v = opt1 ? findVariantByOptions(variants, opt1, s) : null;
              const soldOut = track && v != null && (v.stock_quantity ?? 0) <= 0;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={soldOut}
                  onClick={() => setOpt2(s)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm transition-colors',
                    opt2 === s
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:border-primary/50',
                    soldOut && 'opacity-40 line-through cursor-not-allowed'
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {value && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {value.sku && <Badge variant="outline">SKU {value.sku}</Badge>}
          {track && (
            <span className={selectedOk ? 'text-muted-foreground' : 'text-destructive'}>
              {selectedOk ? `${value.stock_quantity ?? 0} em estoque` : 'Esgotado'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
