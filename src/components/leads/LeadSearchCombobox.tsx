import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLeadPickerRow, searchLeadsForPicker, type LeadPickerRow } from "@/services/leadsPicker";

export interface LeadSearchComboboxProps {
  value: string | null;
  onChange: (leadId: string | null) => void;
  id?: string;
  disabled?: boolean;
  label?: string;
  placeholderTrigger?: string;
  className?: string;
}

export function LeadSearchCombobox({
  value,
  onChange,
  id = "lead-search",
  disabled = false,
  label = "Lead",
  placeholderTrigger = "Buscar lead (nome, e-mail, telefone...)",
  className,
}: LeadSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState<LeadPickerRow[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [resolved, setResolved] = useState<LeadPickerRow | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);

  const hasSearch = query.trim().length >= 2;

  useEffect(() => {
    if (!value) {
      setResolved(null);
      setResolveLoading(false);
      return;
    }
    let cancelled = false;
    setResolveLoading(true);
    void getLeadPickerRow(value)
      .then((row) => {
        if (!cancelled) setResolved(row);
      })
      .finally(() => {
        if (!cancelled) setResolveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  const fetchRemote = useCallback(async (q: string) => {
    const t = q.trim();
    if (t.length < 2) {
      setRemoteResults([]);
      return;
    }
    setRemoteLoading(true);
    try {
      const data = await searchLeadsForPicker(t);
      setRemoteResults(data);
    } catch {
      setRemoteResults([]);
    } finally {
      setRemoteLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !hasSearch) {
      if (!hasSearch) setRemoteResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      void fetchRemote(query);
    }, 320);
    return () => window.clearTimeout(t);
  }, [query, open, hasSearch, fetchRemote]);

  const displayLead = useMemo(() => resolved, [resolved]);

  const triggerLabel = displayLead && value
    ? `${displayLead.name}${displayLead.company ? ` — ${displayLead.company}` : ""}`
    : value
      ? "Lead selecionado"
      : null;

  return (
    <div className={cn("space-y-2", className)}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-auto min-h-10 w-full justify-start gap-2 py-2 font-normal"
          >
            {resolveLoading && value && !displayLead ? (
              <span className="flex items-center gap-2 truncate text-left text-muted-foreground">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                Carregando lead…
              </span>
            ) : triggerLabel ? (
              <span className="truncate text-left">{triggerLabel}</span>
            ) : (
              <span className="text-muted-foreground">{placeholderTrigger}</span>
            )}
            <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
          <Input
            placeholder="Digite ao menos 2 caracteres…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2"
            autoComplete="off"
          />
          <div className="max-h-[240px] overflow-y-auto text-sm">
            {remoteLoading ? (
              <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando…
              </div>
            ) : !hasSearch ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Digite para buscar leads ativos.</p>
            ) : remoteResults.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Nenhum lead encontrado.</p>
            ) : (
              <ul className="space-y-0.5">
                {remoteResults.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="w-full rounded-md px-2 py-2 text-left hover:bg-muted"
                      onClick={() => {
                        onChange(row.id);
                        setResolved(row);
                        setOpen(false);
                        setQuery("");
                        setRemoteResults([]);
                      }}
                    >
                      <span className="font-medium block truncate">{row.name}</span>
                      <span className="text-xs text-muted-foreground truncate block">
                        {[row.company, row.email, row.phone].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 w-full text-muted-foreground"
              onClick={() => {
                onChange(null);
                setResolved(null);
                setQuery("");
              }}
            >
              Limpar seleção
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
