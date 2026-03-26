import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Plus, Check, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Client } from "@/services/clients";
import { clientsService } from "@/services/clients";
import { AddClientDialog } from "@/components/clients/AddClientDialog";

export interface ClientSearchComboboxProps {
  /** ID do cliente selecionado ou null/"limpar". */
  value: string | null;
  onChange: (clientId: string | null) => void;
  /** Texto do botão quando há cliente (nome + detalhe opcional). */
  selectedLabel?: string;
  /**
   * `true`: busca via GET /api/clients?q= (debounce). `false`: filtra `clients` no browser.
   * Fase 2 — B1/B3.
   */
  remoteSearch?: boolean;
  /** Lista para modo local (ex.: wizard de projeto já carrega todos). */
  clients?: Client[];
  onClientCreated?: (client: Client) => void;
  id?: string;
  disabled?: boolean;
  label?: string;
  placeholderTrigger?: string;
  className?: string;
  /** Usa o campo principal como busca (sem segundo input no dropdown). */
  searchInTrigger?: boolean;
}

/**
 * Busca de cliente com opção de criar novo (espelha fluxo do wizard de projetos — Fase 2 B2/B3).
 */
export function ClientSearchCombobox({
  value,
  onChange,
  selectedLabel,
  remoteSearch = false,
  clients: clientsProp = [],
  onClientCreated,
  id = "client-search",
  disabled = false,
  label = "Cliente",
  placeholderTrigger = "Buscar ou selecionar cliente...",
  className,
  searchInTrigger = false,
}: ClientSearchComboboxProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState<Client[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);

  const selectedFromLocal = useMemo(
    () => clientsProp.find((c) => c.id === value),
    [clientsProp, value]
  );

  const hasSearch = query.trim().length > 0;

  const sortedLocalClients = useMemo(() => {
    if (remoteSearch) return [];
    return [...clientsProp].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" })
    );
  }, [clientsProp, remoteSearch]);

  const filteredLocal = useMemo(() => {
    if (remoteSearch) return [];
    if (!hasSearch) return sortedLocalClients;
    const q = query.trim().toLowerCase();
    const digits = query.replace(/\D/g, "");
    return sortedLocalClients.filter((c) => {
      const matchText =
        c.name.toLowerCase().includes(q) ||
        (c.company?.toLowerCase().includes(q) ?? false) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.phone?.replace(/\D/g, "").includes(digits) && digits.length >= 3);
      const matchCpf =
        digits.length >= 4 && (c.cpf_cnpj?.replace(/\D/g, "").includes(digits) ?? false);
      return matchText || matchCpf;
    });
  }, [sortedLocalClients, query, hasSearch, remoteSearch]);

  const listClients = remoteSearch ? remoteResults : filteredLocal;

  const fetchRemote = useCallback(async (q: string) => {
    const t = q.trim();
    if (!t) {
      setRemoteResults([]);
      return;
    }
    setRemoteLoading(true);
    try {
      const data = await clientsService.getClients({ q: t });
      setRemoteResults(data);
    } catch {
      setRemoteResults([]);
    } finally {
      setRemoteLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!remoteSearch || !open) return;
    if (!hasSearch) {
      setRemoteResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      void fetchRemote(query);
    }, 320);
    return () => window.clearTimeout(t);
  }, [query, remoteSearch, open, hasSearch, fetchRemote]);

  const showCreateOption = query.trim().length >= 2 && onClientCreated != null;

  const handleCreated = (client: Client) => {
    onChange(client.id);
    onClientCreated?.(client);
    setOpen(false);
    setQuery("");
    setRemoteResults([]);
    setCreateOpen(false);
  };

  const triggerText =
    selectedLabel ||
    (selectedFromLocal
      ? `${selectedFromLocal.name}${selectedFromLocal.company ? ` — ${selectedFromLocal.company}` : ""}`
      : value
        ? "Cliente selecionado"
        : null);

  /** Com seleção e query vazia, mostra o rótulo no próprio campo (ex.: label vindo do pai antes do sync). */
  const resolvedTriggerInputValue = useMemo(() => {
    if (!searchInTrigger) return "";
    if (query.length > 0) return query;
    if (!value) return "";
    if (selectedLabel) return selectedLabel;
    if (selectedFromLocal) {
      return `${selectedFromLocal.name}${selectedFromLocal.company ? ` — ${selectedFromLocal.company}` : ""}`;
    }
    return "";
  }, [searchInTrigger, query, value, selectedLabel, selectedFromLocal]);

  return (
    <div className={cn("space-y-2", className)}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <Popover open={open} onOpenChange={setOpen}>
        {searchInTrigger ? (
          /**
           * Não usar `PopoverTrigger` com input: o Trigger injeta `onClick` → toggle e,
           * com `asChild` no wrapper, o clique no input propaga e abre/fecha em sequência (flicker).
           * `PopoverAnchor` posiciona o painel sem alternar estado no clique.
           */
          <PopoverAnchor asChild>
            <div className="relative">
              <Input
                ref={inputRef}
                id={id}
                value={resolvedTriggerInputValue}
                role="combobox"
                aria-expanded={open}
                onChange={(e) => {
                  const v = e.target.value;
                  if (value && selectedFromLocal) {
                    const prevFull =
                      selectedLabel ||
                      `${selectedFromLocal.name}${selectedFromLocal.company ? ` — ${selectedFromLocal.company}` : ""}`;
                    if (v !== prevFull) onChange(null);
                  }
                  setQuery(v);
                  if (!open) setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                placeholder={!value ? placeholderTrigger : undefined}
                disabled={disabled}
                className="pr-8"
                autoComplete="off"
              />
              <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
            </div>
          </PopoverAnchor>
        ) : (
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className="w-full justify-between font-normal"
            >
              {triggerText ? (
                <span className="truncate text-left">{triggerText}</span>
              ) : (
                <span className="text-muted-foreground">{placeholderTrigger}</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
        )}
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          onOpenAutoFocus={searchInTrigger ? (e) => e.preventDefault() : undefined}
          onCloseAutoFocus={
            searchInTrigger
              ? (e) => {
                  e.preventDefault();
                  inputRef.current?.focus();
                }
              : undefined
          }
        >
          {!searchInTrigger && (
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <Input
                placeholder="Nome, e-mail, telefone ou CPF..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                autoFocus
              />
              {remoteSearch && remoteLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : null}
            </div>
          )}
          <div className="max-h-[300px] overflow-y-auto p-1">
            {!hasSearch && remoteSearch ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {remoteSearch
                  ? "Digite para buscar no servidor (máx. 50 resultados)"
                  : "Digite para buscar um cliente"}
              </div>
            ) : (
              <>
                {showCreateOption && (
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className={cn(
                      "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                      "text-primary"
                    )}
                  >
                    <Plus className="mr-2 h-4 w-4 shrink-0" />
                    Criar novo cliente: {query.trim()}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                    setQuery("");
                    setRemoteResults([]);
                  }}
                  className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", !value ? "opacity-100" : "opacity-0")} />
                  Limpar seleção
                </button>
                {listClients.length === 0 && hasSearch && !remoteLoading && (
                  <div className="py-2 text-center text-sm text-muted-foreground">
                    Nenhum cliente encontrado.
                  </div>
                )}
                {listClients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                      setQuery(searchInTrigger ? `${c.name}${c.company ? ` — ${c.company}` : ""}` : "");
                      setRemoteResults([]);
                    }}
                    className="relative flex w-full cursor-pointer select-none items-start rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  >
                    <Check
                      className={cn(
                        "mr-2 mt-0.5 h-4 w-4 shrink-0",
                        value === c.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span>{c.name}</span>
                      {(c.company || c.email || c.phone) && (
                        <span className="text-xs text-muted-foreground">
                          {[c.company, c.email, c.phone].filter(Boolean).join(" • ")}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {onClientCreated ? (
        <AddClientDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          initialName={query.trim()}
          onSuccess={handleCreated}
        />
      ) : null}
    </div>
  );
}
