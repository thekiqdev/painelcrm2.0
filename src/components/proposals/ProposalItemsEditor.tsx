import React, { useMemo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Package, Briefcase, Plus, Search } from "lucide-react";
import type { ProposalItem } from "@/services/proposals";
import type { Product } from "@/types/products";
import { resolvePublicCatalogUnitPrice } from "@/types/products";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

function newLineId(): string {
  return crypto.randomUUID();
}

function computeLineTotal(qty: number, unit: number, discount: number): number {
  const gross = Math.max(0, qty) * Math.max(0, unit);
  const d = Math.max(0, discount);
  return Math.round(Math.max(0, gross - d) * 100) / 100;
}

export function summarizeProposalLines(items: ProposalItem[]): {
  gross: number;
  discountSum: number;
  total: number;
} {
  let gross = 0;
  let discountSum = 0;
  let total = 0;
  for (const it of items) {
    const qty = Math.max(0, Number(it.quantity) || 0);
    const unit = Math.max(0, Number(it.unitPrice) || 0);
    const disc = Math.max(0, Number(it.discount) || 0);
    gross += qty * unit;
    discountSum += disc;
    total += computeLineTotal(qty, unit, disc);
  }
  return {
    gross: Math.round(gross * 100) / 100,
    discountSum: Math.round(discountSum * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

export interface ProposalItemsEditorProps {
  items: ProposalItem[];
  onChange: (next: ProposalItem[]) => void;
  catalog: Product[];
  disabled?: boolean;
  className?: string;
  /** z-index para popovers acima de shells full screen mobile (ex.: `z-[260]`). */
  popoverContentClassName?: string;
}

/**
 * Linhas da proposta: manual ou cópia de produto/serviço do catálogo (sem vínculo após inserção).
 */
export function ProposalItemsEditor({
  items,
  onChange,
  catalog,
  disabled = false,
  className,
  popoverContentClassName,
}: ProposalItemsEditorProps) {
  const isMobile = useIsMobile();
  const [pickerOpen, setPickerOpen] = useState<"product" | "service" | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");

  const filteredCatalog = useMemo(() => {
    const type = pickerOpen === "product" ? "product" : pickerOpen === "service" ? "service" : null;
    if (!type) return [];
    const q = pickerQuery.trim().toLowerCase();
    return catalog
      .filter((p) => p.type === type && p.status !== "inactive")
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

  const updateRow = useCallback(
    (index: number, patch: Partial<ProposalItem>) => {
      const next = items.map((it, i) => {
        if (i !== index) return it;
        const merged = { ...it, ...patch };
        const qty = Math.max(0, Number(merged.quantity) || 0);
        const unit = Math.max(0, Number(merged.unitPrice) || 0);
        const disc = Math.max(0, Number(merged.discount) || 0);
        return {
          ...merged,
          quantity: qty,
          unitPrice: unit,
          discount: disc,
          total: computeLineTotal(qty, unit, disc),
        };
      });
      onChange(next);
    },
    [items, onChange]
  );

  const removeRow = useCallback(
    (index: number) => {
      onChange(items.filter((_, i) => i !== index));
    },
    [items, onChange]
  );

  const addManual = useCallback(() => {
    onChange([
      ...items,
      {
        id: newLineId(),
        description: "",
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        total: 0,
      },
    ]);
  }, [items, onChange]);

  const insertFromCatalog = useCallback(
    (p: Product) => {
      const unit =
        resolvePublicCatalogUnitPrice({
          price: p.price ?? null,
          discount_price: p.discount_price ?? null,
        }) ?? 0;
      const desc =
        [p.name, p.short_description || p.description || ""].filter(Boolean).join(" — ") || p.name;
      onChange([
        ...items,
        {
          id: newLineId(),
          description: desc.slice(0, 2000),
          quantity: 1,
          unitPrice: unit,
          discount: 0,
          total: computeLineTotal(1, unit, 0),
        },
      ]);
      setPickerOpen(null);
      setPickerQuery("");
    },
    [items, onChange]
  );

  const popoverCn = cn("w-80 p-0", popoverContentClassName);

  return (
    <div className={cn("space-y-3", className)}>
      <div className={cn(isMobile ? "grid grid-cols-1 gap-2" : "flex flex-wrap gap-2")}>
        <Button
          type="button"
          variant={isMobile ? "default" : "secondary"}
          size={isMobile ? "default" : "sm"}
          disabled={disabled}
          onClick={addManual}
          className={cn(
            isMobile && "h-12 w-full justify-center gap-2 rounded-xl text-sm font-semibold shadow-sm",
          )}
        >
          <Plus className={cn("shrink-0", isMobile ? "h-5 w-5" : "h-4 w-4")} />
          Linha manual
        </Button>
        <Popover
          open={pickerOpen === "product"}
          onOpenChange={(o) => {
            setPickerOpen(o ? "product" : null);
            if (!o) setPickerQuery("");
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size={isMobile ? "default" : "sm"}
              disabled={disabled}
              className={cn(
                isMobile && "h-12 w-full justify-center gap-2 rounded-xl border-2 text-sm font-semibold",
              )}
            >
              <Package className={cn("shrink-0", isMobile ? "h-5 w-5" : "h-4 w-4")} />
              {isMobile ? "Produto (catálogo)" : "Produto do catálogo"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className={popoverCn} align="start">
            <div className="p-2 border-b flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                className="h-8"
                placeholder="Buscar produto..."
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
              />
            </div>
            <ScrollArea className="h-56">
              {filteredCatalog.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">Nenhum produto encontrado.</p>
              ) : (
                <ul className="p-1">
                  {filteredCatalog.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="w-full text-left text-sm px-2 py-2 rounded hover:bg-muted"
                        onClick={() => insertFromCatalog(p)}
                      >
                        <span className="font-medium block truncate">{p.name}</span>
                        {p.short_description && (
                          <span className="text-xs text-muted-foreground line-clamp-1">
                            {p.short_description}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <Popover
          open={pickerOpen === "service"}
          onOpenChange={(o) => {
            setPickerOpen(o ? "service" : null);
            if (!o) setPickerQuery("");
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size={isMobile ? "default" : "sm"}
              disabled={disabled}
              className={cn(
                isMobile && "h-12 w-full justify-center gap-2 rounded-xl border-2 text-sm font-semibold",
              )}
            >
              <Briefcase className={cn("shrink-0", isMobile ? "h-5 w-5" : "h-4 w-4")} />
              {isMobile ? "Serviço (catálogo)" : "Serviço do catálogo"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className={popoverCn} align="start">
            <div className="p-2 border-b flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                className="h-8"
                placeholder="Buscar serviço..."
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
              />
            </div>
            <ScrollArea className="h-56">
              {filteredCatalog.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">Nenhum serviço encontrado.</p>
              ) : (
                <ul className="p-1">
                  {filteredCatalog.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="w-full text-left text-sm px-2 py-2 rounded hover:bg-muted"
                        onClick={() => insertFromCatalog(p)}
                      >
                        <span className="font-medium block truncate">{p.name}</span>
                        {p.short_description && (
                          <span className="text-xs text-muted-foreground line-clamp-1">
                            {p.short_description}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>

      <div className="hidden rounded-md border overflow-x-auto md:block">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted text-xs font-medium">
            <div className="col-span-4">Descrição</div>
            <div className="col-span-2 text-center">Qtd</div>
            <div className="col-span-2 text-right">Unit. (R$)</div>
            <div className="col-span-2 text-right">Desc. (R$)</div>
            <div className="col-span-1 text-right">Total</div>
            <div className="col-span-1" />
          </div>
          {items.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground text-center">
              Nenhuma linha. Adicione itens manuais ou do catálogo — ou informe um valor único abaixo (quando não houver
              linhas).
            </div>
          ) : (
            items.map((item, index) => (
              <div
                key={String(item.id ?? index)}
                className="grid grid-cols-12 gap-2 px-3 py-2 border-t items-center text-sm"
              >
                <div className="col-span-4">
                  <Label className="sr-only">Descrição linha {index + 1}</Label>
                  <Input
                    disabled={disabled}
                    value={item.description}
                    onChange={(e) => updateRow(index, { description: e.target.value })}
                    placeholder="Descrição do item"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="sr-only">Quantidade</Label>
                  <Input
                    disabled={disabled}
                    type="number"
                    min={0}
                    step={1}
                    value={item.quantity}
                    onChange={(e) => updateRow(index, { quantity: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="sr-only">Valor unitário</Label>
                  <Input
                    disabled={disabled}
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.unitPrice}
                    onChange={(e) => updateRow(index, { unitPrice: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="sr-only">Desconto linha</Label>
                  <Input
                    disabled={disabled}
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.discount ?? 0}
                    onChange={(e) => updateRow(index, { discount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="col-span-1 text-right font-medium tabular-nums">
                  {item.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    className="text-destructive"
                    onClick={() => removeRow(index)}
                    title="Remover linha"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/15 px-4 py-8 text-center text-sm leading-relaxed text-muted-foreground">
            Nenhum item nesta proposta. Use os botões acima para adicionar linhas ou informe um valor único no campo
            abaixo (quando não houver linhas).
          </div>
        ) : (
          items.map((item, index) => (
            <div
              key={String(item.id ?? index)}
              className="rounded-2xl border border-border bg-card p-3 shadow-sm dark:bg-card/90"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Item {index + 1}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-destructive"
                  disabled={disabled}
                  onClick={() => removeRow(index)}
                  aria-label="Remover item"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Descrição</Label>
                  <Input
                    disabled={disabled}
                    value={item.description}
                    onChange={(e) => updateRow(index, { description: e.target.value })}
                    placeholder="Descrição do item"
                    className="mt-1 h-11"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Qtd</Label>
                    <Input
                      disabled={disabled}
                      type="number"
                      min={0}
                      step={1}
                      value={item.quantity}
                      onChange={(e) => updateRow(index, { quantity: parseFloat(e.target.value) || 0 })}
                      className="mt-1 h-11 text-right"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Valor un. (R$)</Label>
                    <Input
                      disabled={disabled}
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.unitPrice}
                      onChange={(e) => updateRow(index, { unitPrice: parseFloat(e.target.value) || 0 })}
                      className="mt-1 h-11 text-right font-mono text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Desconto (R$)</Label>
                  <Input
                    disabled={disabled}
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.discount ?? 0}
                    onChange={(e) => updateRow(index, { discount: parseFloat(e.target.value) || 0 })}
                    className="mt-1 h-11 text-right font-mono text-sm"
                  />
                </div>
                <div className="flex items-center justify-between border-t border-border/60 pt-3">
                  <span className="text-sm text-muted-foreground">Total da linha</span>
                  <span className="text-base font-semibold tabular-nums">
                    {item.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
