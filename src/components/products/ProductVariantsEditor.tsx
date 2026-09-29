import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, X, Upload, Image as ImageIcon } from 'lucide-react';
import type { ProductVariant, ProductVariation } from '@/types/products';
import { uploadCatalogImageFile, normalizeCatalogMediaUrlForBrowser } from '@/services/catalogMediaUpload';
import { useToast } from '@/hooks/use-toast';
import {
  COLOR_SWATCH_MAP,
  SIZE_SUGGESTIONS,
  VARIANT_AXIS_COR,
  VARIANT_AXIS_TAMANHO,
  colorHexForValue,
  generateVariantCombinations,
  getAxisValues,
  mergeGeneratedWithExisting,
  setAxisValues,
  variantRowLabel,
  aggregateMinPriceFromVariants,
  aggregateStockFromVariants,
  type VariantAxisName,
} from '@/utils/productVariantsForm';

type Props = {
  variations: ProductVariation[];
  variants: ProductVariant[];
  defaultPrice?: number;
  onChange: (next: { variations: ProductVariation[]; variants: ProductVariant[] }) => void;
};

function AxisChipEditor({
  axisName,
  enabled,
  values,
  suggestions,
  onToggle,
  onChangeValues,
}: {
  axisName: VariantAxisName;
  enabled: boolean;
  values: string[];
  suggestions: string[];
  onToggle: (on: boolean) => void;
  onChangeValues: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const addValue = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChangeValues([...values, v]);
    setDraft('');
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Checkbox
          id={`axis-${axisName}`}
          checked={enabled}
          onCheckedChange={(c) => onToggle(c === true)}
        />
        <Label htmlFor={`axis-${axisName}`} className="text-base font-medium cursor-pointer">
          {axisName}
        </Label>
      </div>

      {enabled && (
        <>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <Badge
                key={s}
                variant="outline"
                className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                onClick={() => addValue(s)}
              >
                {axisName === VARIANT_AXIS_COR && COLOR_SWATCH_MAP[s] && (
                  <span
                    className="inline-block w-3 h-3 rounded mr-1.5 border border-border"
                    style={{ backgroundColor: COLOR_SWATCH_MAP[s] }}
                  />
                )}
                <Plus className="h-3 w-3 mr-1" />
                {s}
              </Badge>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Novo valor de ${axisName.toLowerCase()}…`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addValue(draft);
                }
              }}
            />
            <Button type="button" variant="outline" onClick={() => addValue(draft)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {values.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {values.map((v) => (
                <Badge key={v} variant="secondary" className="flex items-center gap-1.5 pr-1">
                  {axisName === VARIANT_AXIS_COR && colorHexForValue(v) && (
                    <span
                      className="inline-block w-3 h-3 rounded border border-border"
                      style={{ backgroundColor: colorHexForValue(v)! }}
                    />
                  )}
                  {v}
                  <button
                    type="button"
                    className="ml-1 rounded p-0.5 hover:bg-muted"
                    onClick={() => onChangeValues(values.filter((x) => x !== v))}
                    aria-label={`Remover ${v}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ProductVariantsEditor({
  variations,
  variants,
  defaultPrice,
  onChange,
}: Props) {
  const { toast } = useToast();
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  const corEnabled = (variations || []).some((a) => a.name === VARIANT_AXIS_COR);
  const tamEnabled = (variations || []).some((a) => a.name === VARIANT_AXIS_TAMANHO);
  const corValues = getAxisValues(variations, VARIANT_AXIS_COR);
  const tamValues = getAxisValues(variations, VARIANT_AXIS_TAMANHO);

  const updateAxes = (nextAxes: ProductVariation[]) => {
    onChange({ variations: nextAxes, variants });
  };

  const toggleAxis = (name: VariantAxisName, on: boolean) => {
    if (on) {
      if (!(variations || []).some((a) => a.name === name)) {
        updateAxes([...(variations || []), { name, values: [] }]);
      }
    } else {
      updateAxes((variations || []).filter((a) => a.name !== name));
    }
  };

  const handleGenerate = () => {
    const { variants: generated, error } = generateVariantCombinations(variations);
    if (error) {
      toast({ title: 'Grade', description: error, variant: 'destructive' });
      return;
    }
    const merged = mergeGeneratedWithExisting(generated, variants, { price: defaultPrice });
    onChange({ variations, variants: merged });
    toast({
      title: 'Combinações geradas',
      description: `${merged.length} variante(s) na grade.`,
    });
  };

  const patchVariant = (index: number, patch: Partial<ProductVariant>) => {
    const next = variants.map((v, i) => (i === index ? { ...v, ...patch } : v));
    onChange({ variations, variants: next });
  };

  const handleVariantImage = async (index: number, file: File | null) => {
    if (!file) return;
    setUploadingIdx(index);
    try {
      const url = await uploadCatalogImageFile(file, 'product');
      patchVariant(index, { images: [url] });
    } catch (e) {
      toast({
        title: 'Upload',
        description: e instanceof Error ? e.message : 'Falha ao enviar imagem',
        variant: 'destructive',
      });
    } finally {
      setUploadingIdx(null);
      const el = fileRefs.current[index];
      if (el) el.value = '';
    }
  };

  const stockSum = aggregateStockFromVariants(variants);
  const priceMin = aggregateMinPriceFromVariants(variants);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grade de variantes</CardTitle>
        <p className="text-sm text-muted-foreground">
          Escolha Cor e/ou Tamanho, adicione valores e gere as combinações. Cada linha tem SKU,
          preço, estoque e foto.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <AxisChipEditor
          axisName={VARIANT_AXIS_COR}
          enabled={corEnabled}
          values={corValues}
          suggestions={Object.keys(COLOR_SWATCH_MAP)}
          onToggle={(on) => toggleAxis(VARIANT_AXIS_COR, on)}
          onChangeValues={(vals) => updateAxes(setAxisValues(variations, VARIANT_AXIS_COR, vals))}
        />
        <AxisChipEditor
          axisName={VARIANT_AXIS_TAMANHO}
          enabled={tamEnabled}
          values={tamValues}
          suggestions={[...SIZE_SUGGESTIONS]}
          onToggle={(on) => toggleAxis(VARIANT_AXIS_TAMANHO, on)}
          onChangeValues={(vals) =>
            updateAxes(setAxisValues(variations, VARIANT_AXIS_TAMANHO, vals))
          }
        />

        <Button type="button" onClick={handleGenerate} className="w-full sm:w-auto">
          Gerar combinações
        </Button>

        {variants.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>
                Estoque total (ativas): <strong className="text-foreground">{stockSum}</strong>
              </span>
              <span>
                A partir de:{' '}
                <strong className="text-foreground">
                  {priceMin != null
                    ? priceMin.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : '—'}
                </strong>
              </span>
            </div>

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-2 font-medium">Combinação</th>
                    <th className="p-2 font-medium">SKU</th>
                    <th className="p-2 font-medium">Preço</th>
                    <th className="p-2 font-medium">Promo</th>
                    <th className="p-2 font-medium">Estoque</th>
                    <th className="p-2 font-medium">Foto</th>
                    <th className="p-2 font-medium">Ativo</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v, index) => {
                    const img = v.images?.[0];
                    return (
                      <tr key={`${v.id || ''}-${variantRowLabel(v)}-${index}`} className="border-t">
                        <td className="p-2 whitespace-nowrap font-medium">{variantRowLabel(v)}</td>
                        <td className="p-2">
                          <Input
                            className="h-8 w-28"
                            value={v.sku || ''}
                            onChange={(e) =>
                              patchVariant(index, { sku: e.target.value || null })
                            }
                            placeholder="SKU"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            className="h-8 w-24"
                            type="number"
                            step="0.01"
                            min="0"
                            value={v.price ?? ''}
                            onChange={(e) =>
                              patchVariant(index, {
                                price: e.target.value ? parseFloat(e.target.value) : null,
                              })
                            }
                            placeholder="0,00"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            className="h-8 w-24"
                            type="number"
                            step="0.01"
                            min="0"
                            value={v.discount_price ?? ''}
                            onChange={(e) =>
                              patchVariant(index, {
                                discount_price: e.target.value
                                  ? parseFloat(e.target.value)
                                  : null,
                              })
                            }
                            placeholder="—"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            className="h-8 w-20"
                            type="number"
                            min="0"
                            value={v.stock_quantity ?? 0}
                            onChange={(e) =>
                              patchVariant(index, {
                                stock_quantity: e.target.value
                                  ? parseInt(e.target.value, 10)
                                  : 0,
                              })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            {img ? (
                              <img
                                src={normalizeCatalogMediaUrlForBrowser(img)}
                                alt=""
                                className="h-8 w-8 rounded object-cover border"
                              />
                            ) : (
                              <span className="h-8 w-8 rounded border flex items-center justify-center text-muted-foreground">
                                <ImageIcon className="h-3.5 w-3.5" />
                              </span>
                            )}
                            <input
                              ref={(el) => {
                                fileRefs.current[index] = el;
                              }}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                handleVariantImage(index, e.target.files?.[0] ?? null)
                              }
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8"
                              disabled={uploadingIdx === index}
                              onClick={() => fileRefs.current[index]?.click()}
                            >
                              <Upload className="h-3.5 w-3.5" />
                            </Button>
                            {img && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-1"
                                onClick={() => patchVariant(index, { images: [] })}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          <Switch
                            checked={v.is_active !== false}
                            onCheckedChange={(checked) =>
                              patchVariant(index, { is_active: checked })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
