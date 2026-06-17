import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PERIOD_PRESETS } from "./subscriptionsListUtils";

type PeriodRange = { from: string; to: string } | null | undefined;

type Props = {
  preset: string;
  from: string;
  to: string;
  period: PeriodRange;
  onPresetChange: (preset: string) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onApplyCustom: () => void;
};

export function SubscriptionsPeriodFilter({
  preset,
  from,
  to,
  period,
  onPresetChange,
  onFromChange,
  onToChange,
  onApplyCustom,
}: Props) {
  const isCustom = preset === "custom";

  return (
    <div className="rounded-xl border bg-card shadow-sm p-3 md:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4 shrink-0" aria-hidden />
          <span>Período</span>
        </div>
        {period && (
          <span className="text-[11px] md:text-xs text-muted-foreground text-right tabular-nums">
            {format(new Date(`${period.from}T12:00:00`), "dd/MM/yy", { locale: ptBR })}
            {" – "}
            {format(new Date(`${period.to}T12:00:00`), "dd/MM/yy", { locale: ptBR })}
          </span>
        )}
      </div>

      {/* Mobile: chips */}
      <div className="md:hidden flex flex-wrap gap-1.5">
        {PERIOD_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onPresetChange(p.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              !isCustom && preset === p.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/80 text-muted-foreground hover:bg-muted"
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPresetChange("custom")}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            isCustom ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/80 text-muted-foreground hover:bg-muted"
          )}
        >
          Personalizado
        </button>
      </div>

      {/* Desktop: select */}
      <div className="hidden md:flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Intervalo</Label>
          <Select
            value={isCustom ? "custom" : preset}
            onValueChange={(v) => {
              if (v === "custom") {
                onPresetChange("custom");
              } else {
                onPresetChange(v);
              }
            }}
          >
            <SelectTrigger className="w-[200px] mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isCustom && (
          <>
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} className="w-[150px] mt-1" />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} className="w-[150px] mt-1" />
            </div>
            <Button type="button" variant="secondary" onClick={onApplyCustom} className="mb-0.5">
              Aplicar
            </Button>
          </>
        )}
      </div>

      {/* Mobile: custom dates */}
      {isCustom && (
        <div className="md:hidden grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} className="mt-1 h-9" />
          </div>
          <Button type="button" variant="secondary" onClick={onApplyCustom} className="col-span-2 h-9">
            Aplicar período
          </Button>
        </div>
      )}
    </div>
  );
}
