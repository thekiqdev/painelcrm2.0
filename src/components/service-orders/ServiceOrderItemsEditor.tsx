import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Briefcase, Package, Plus, Search, Trash2 } from "lucide-react";
import type { Product } from "@/types/products";
import { resolvePublicCatalogUnitPrice } from "@/types/products";
import type { ServiceOrderItem, ServiceOrderItemKind } from "@/types/serviceOrders";
import { formatAppMoney } from "@/lib/i18n/formatApp";
import { cn } from "@/lib/utils";

function newLineId(): string {
  return crypto.randomUUID();
}

function toCentsFromMajor(major: number): number {
  return Math.max(0, Math.round(major * 100));
}

function majorFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

function lineGrossCents(item: ServiceOrderItem): number {
  const qty = Math.max(0, Number(item.quantity) || 0);
  const unit = Math.max(0, Number(item.unit_price_cents) || 0);
  return Math.max(0, Math.round(qty * unit));
}

function lineSubtotal(item: ServiceOrderItem): number {
  const disc = Math.max(0, Number(item.discount_cents) || 0);
  return Math.max(0, lineGrossCents(item) - disc);
}

type DiscountMode = "fixed" | "percent";

function discountCentsFromPercent(grossCents: number, percent: number): number {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return Math.max(0, Math.min(grossCents, Math.round((grossCents * p) / 100)));
}

function percentFromDiscountCents(grossCents: number, discountCents: number): number {
  if (grossCents <= 0) return 0;
  const pct = (Math.max(0, discountCents) / grossCents) * 100;
  return Math.round(pct * 100) / 100;
}

export function summarizeServiceOrderItems(items: ServiceOrderItem[]): {
  servicesCents: number;
  productsCents: number;
  totalCents: number;
} {
  let servicesCents = 0;
  let productsCents = 0;
  for (const it of items) {
    const sub = lineSubtotal(it);
    if (it.kind === "service") servicesCents += sub;
    else productsCents += sub;
  }
  return { servicesCents, productsCents, totalCents: servicesCents + productsCents };
}

export interface ServiceOrderItemsEditorProps {
  items: ServiceOrderItem[];
  onChange: (next: ServiceOrderItem[]) => void;
  catalog: Product[];
  disabled?: boolean;
  currency?: string;
  className?: string;
}

/**
 * Itens da OS: seções Serviços e Produtos — manual ou cópia do catálogo.
 */
export function ServiceOrderItemsEditor({
  items,
  onChange,
  catalog,
  disabled = false,
  currency = "BRL",
  className,
}: ServiceOrderItemsEditorProps) {
  const [pickerOpen, setPickerOpen] = useState<ServiceOrderItemKind | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  /** Modo de digitação do desconto por linha (UI); persistido sempre em `discount_cents`. */
  const [discountModeByKey, setDiscountModeByKey] = useState<Record<string, DiscountMode>>({});
  const [percentDraftByKey, setPercentDraftByKey] = useState<Record<string, string>>({});

  const services = useMemo(() => items.filter((i) => i.kind === "service"), [items]);
  const products = useMemo(() => items.filter((i) => i.kind === "product"), [items]);
  const totals = useMemo(() => summarizeServiceOrderItems(items), [items]);

  const filteredCatalog = useMemo(() => {
    if (!pickerOpen) return [];
    const q = pickerQuery.trim().toLowerCase();
    return catalog
      .filter((p) => p.type === pickerOpen && p.status !== "inactive")
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.sku?.toLowerCase().includes(q) ?? false) ||
          (p.short_description?.toLowerCase().includes(q) ?? false)
        );
      })
      .slice(0, 80);
  }, [catalog, pickerOpen, pickerQuery]);

  const replaceKind = useCallback(
    (kind: ServiceOrderItemKind, kindItems: ServiceOrderItem[]) => {
      const other = items.filter((i) => i.kind !== kind);
      onChange([...other, ...kindItems.map((it, idx) => ({ ...it, sort_order: idx }))]);
    },
    [items, onChange],
  );

  const updateInKind = useCallback(
    (kind: ServiceOrderItemKind, indexInKind: number, patch: Partial<ServiceOrderItem>) => {
      const kindItems = items.filter((i) => i.kind === kind);
      const nextKind = kindItems.map((it, i) => {
        if (i !== indexInKind) return it;
        const merged = { ...it, ...patch };
        const rowKey = String(it.id ?? `${kind}-${indexInKind}`);
        const mode = discountModeByKey[rowKey] ?? "fixed";
        let discount_cents = Math.max(0, Number(merged.discount_cents) || 0);
        if (mode === "percent" && patch.discount_cents === undefined) {
          const pct = Number(percentDraftByKey[rowKey]);
          if (Number.isFinite(pct)) {
            const gross = Math.max(
              0,
              Math.round(
                Math.max(0.01, Number(merged.quantity) || 0.01) *
                  Math.max(0, Number(merged.unit_price_cents) || 0),
              ),
            );
            discount_cents = discountCentsFromPercent(gross, pct);
          }
        }
        const normalized = {
          ...merged,
          quantity: Math.max(0.01, Number(merged.quantity) || 0.01),
          unit_price_cents: Math.max(0, Number(merged.unit_price_cents) || 0),
          discount_cents,
        };
        return {
          ...normalized,
          subtotal_cents: lineSubtotal(normalized),
        };
      });
      replaceKind(kind, nextKind);
    },
    [items, replaceKind, discountModeByKey, percentDraftByKey],
  );

  const removeInKind = useCallback(
    (kind: ServiceOrderItemKind, indexInKind: number) => {
      const kindItems = items.filter((i) => i.kind === kind).filter((_, i) => i !== indexInKind);
      replaceKind(kind, kindItems);
    },
    [items, replaceKind],
  );

  const addManual = useCallback(
    (kind: ServiceOrderItemKind) => {
      const kindItems = items.filter((i) => i.kind === kind);
      replaceKind(kind, [
        ...kindItems,
        {
          id: newLineId(),
          kind,
          name: kind === "service" ? "Novo serviço" : "Novo produto",
          unit: "UN",
          quantity: 1,
          unit_price_cents: 0,
          discount_cents: 0,
          subtotal_cents: 0,
        },
      ]);
    },
    [items, replaceKind],
  );

  const addFromCatalog = useCallback(
    (product: Product) => {
      const kind: ServiceOrderItemKind = product.type === "service" ? "service" : "product";
      const major = resolvePublicCatalogUnitPrice(product);
      const kindItems = items.filter((i) => i.kind === kind);
      replaceKind(kind, [
        ...kindItems,
        {
          id: newLineId(),
          kind,
          product_id: product.id,
          name: product.name,
          description: product.short_description ?? null,
          unit: "UN",
          quantity: 1,
          unit_price_cents: toCentsFromMajor(Number(major) || 0),
          discount_cents: 0,
        },
      ]);
      setPickerOpen(null);
      setPickerQuery("");
    },
    [items, replaceKind],
  );

  const renderSection = (kind: ServiceOrderItemKind, title: string, rows: ServiceOrderItem[]) => (
    <div className="space-y-3 rounded-lg border border-border/70 bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-wide">{title}</h3>
        <div className="flex flex-wrap gap-2">
          <Popover
            open={pickerOpen === kind}
            onOpenChange={(open) => {
              setPickerOpen(open ? kind : null);
              if (!open) setPickerQuery("");
            }}
          >
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={disabled}>
                {kind === "service" ? (
                  <Briefcase className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Package className="mr-1.5 h-3.5 w-3.5" />
                )}
                Catálogo
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <div className="border-b p-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="h-8 pl-7 text-sm"
                    placeholder="Buscar…"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                  />
                </div>
              </div>
              <ScrollArea className="h-56">
                <div className="p-1">
                  {filteredCatalog.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                      Nenhum item no catálogo
                    </p>
                  ) : (
                    filteredCatalog.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="flex w-full flex-col rounded-md px-2 py-2 text-left hover:bg-muted"
                        onClick={() => addFromCatalog(p)}
                      >
                        <span className="text-sm font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatAppMoney(
                            toCentsFromMajor(Number(resolvePublicCatalogUnitPrice(p)) || 0),
                            currency,
                          )}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
          <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => addManual(kind)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Manual
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma linha. Adicione do catálogo ou manualmente.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={row.id ?? `${kind}-${index}`}
              className="grid gap-2 rounded-md border border-border/50 bg-background/60 p-2 sm:grid-cols-12 sm:items-end"
            >
              <div className={cn("space-y-1", kind === "product" ? "sm:col-span-3" : "sm:col-span-3")}>
                <Label className="text-xs">Nome</Label>
                <Input
                  disabled={disabled}
                  value={row.name}
                  onChange={(e) => updateInKind(kind, index, { name: e.target.value })}
                />
              </div>
              {kind === "product" ? (
                <div className="space-y-1 sm:col-span-1">
                  <Label className="text-xs">Und.</Label>
                  <Input
                    disabled={disabled}
                    value={row.unit ?? "UN"}
                    onChange={(e) => updateInKind(kind, index, { unit: e.target.value })}
                  />
                </div>
              ) : null}
              <div className="space-y-1 sm:col-span-1">
                <Label className="text-xs">Qtd.</Label>
                <Input
                  type="number"
                  min={0.01}
                  step="0.01"
                  disabled={disabled}
                  value={row.quantity}
                  onChange={(e) => updateInKind(kind, index, { quantity: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Vr. unit. (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={disabled}
                  value={majorFromCents(Number(row.unit_price_cents) || 0)}
                  onChange={(e) =>
                    updateInKind(kind, index, { unit_price_cents: toCentsFromMajor(Number(e.target.value)) })
                  }
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Desconto</Label>
                {(() => {
                  const rowKey = String(row.id ?? `${kind}-${index}`);
                  const mode = discountModeByKey[rowKey] ?? "fixed";
                  const gross = lineGrossCents(row);
                  const setMode = (next: DiscountMode) => {
                    setDiscountModeByKey((prev) => ({ ...prev, [rowKey]: next }));
                    if (next === "percent") {
                      const pct = percentFromDiscountCents(gross, Number(row.discount_cents) || 0);
                      setPercentDraftByKey((prev) => ({ ...prev, [rowKey]: String(pct) }));
                    }
                  };
                  return (
                    <div className="flex gap-1">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        max={mode === "percent" ? 100 : undefined}
                        disabled={disabled}
                        className="min-w-0 flex-1"
                        value={
                          mode === "percent"
                            ? (percentDraftByKey[rowKey] ??
                              String(percentFromDiscountCents(gross, Number(row.discount_cents) || 0)))
                            : majorFromCents(Number(row.discount_cents) || 0)
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (mode === "percent") {
                            setPercentDraftByKey((prev) => ({ ...prev, [rowKey]: raw }));
                            updateInKind(kind, index, {
                              discount_cents: discountCentsFromPercent(gross, Number(raw)),
                            });
                          } else {
                            updateInKind(kind, index, {
                              discount_cents: Math.min(
                                gross,
                                toCentsFromMajor(Number(raw)),
                              ),
                            });
                          }
                        }}
                      />
                      <select
                        aria-label="Tipo de desconto"
                        disabled={disabled}
                        className="h-9 w-[4.25rem] shrink-0 rounded-md border border-input bg-background px-1.5 text-xs"
                        value={mode}
                        onChange={(e) => setMode(e.target.value === "percent" ? "percent" : "fixed")}
                      >
                        <option value="fixed">R$</option>
                        <option value="percent">%</option>
                      </select>
                    </div>
                  );
                })()}
              </div>
              <div className={cn("space-y-1", kind === "product" ? "sm:col-span-2" : "sm:col-span-3")}>
                <Label className="text-xs">Subtotal</Label>
                <div className="flex h-9 items-center rounded-md border border-transparent px-2 text-sm font-medium tabular-nums">
                  {formatAppMoney(lineSubtotal(row), currency)}
                </div>
              </div>
              <div className="sm:col-span-1 sm:justify-self-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  aria-label="Remover linha"
                  onClick={() => removeInKind(kind, index)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className={cn("space-y-4", className)}>
      {renderSection("service", "Serviços", services)}
      {renderSection("product", "Produtos", products)}
      <div className="flex flex-col items-end gap-0.5 text-sm">
        <div className="text-muted-foreground">Serviços: {formatAppMoney(totals.servicesCents, currency)}</div>
        <div className="text-muted-foreground">Produtos: {formatAppMoney(totals.productsCents, currency)}</div>
        <div className="text-base font-semibold">Total: {formatAppMoney(totals.totalCents, currency)}</div>
      </div>
    </div>
  );
}
