import React, { useState, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SystemRichEditor } from "@/components/editor";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X, ChevronDown, ChevronsUpDown, Plus, Check, Search } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { WizardBasicConfig } from "../types";
import type { Member } from "@/components/shared/types";
import type { Client } from "@/services/clients";
import { AddClientDialog } from "@/components/clients/AddClientDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TeamOption {
  id: string;
  name: string;
}

interface Step2BasicConfigProps {
  config: WizardBasicConfig;
  onChange: (config: Partial<WizardBasicConfig>) => void;
  clients: Client[];
  members: Member[];
  teams?: TeamOption[];
  showNameError?: boolean;
  onClientCreated?: (client: Client) => void;
}


export function Step2BasicConfig({
  config,
  onChange,
  clients,
  members,
  teams = [],
  showNameError,
  onClientCreated,
}: Step2BasicConfigProps) {
  const selectedMembers = members.filter((m) => config.responsibleIds.includes(m.id));
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [createClientDialogOpen, setCreateClientDialogOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState("");

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === config.clientId),
    [clients, config.clientId]
  );

  const hasSearch = clientSearchQuery.trim().length > 0;

  const filteredClients = useMemo(() => {
    if (!hasSearch) return [];
    const q = clientSearchQuery.trim().toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company?.toLowerCase().includes(q)) ||
        (c.email?.toLowerCase().includes(q))
    );
  }, [clients, clientSearchQuery, hasSearch]);

  const showCreateOption = clientSearchQuery.trim().length >= 2;

  const handleClientCreated = (client: Client) => {
    onChange({ clientId: client.id });
    onClientCreated?.(client);
    setClientSearchOpen(false);
    setCreateClientDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Preencha os dados básicos do projeto. Apenas o nome é obrigatório.
      </p>

      <div className="space-y-2">
        <Label htmlFor="wizard-name">Nome do projeto *</Label>
        <Input
          id="wizard-name"
          value={config.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Ex.: Site da empresa"
          className={cn("w-full", showNameError && "border-destructive")}
          aria-invalid={showNameError}
          aria-describedby={showNameError ? "wizard-name-error" : undefined}
        />
        {showNameError && (
          <p id="wizard-name-error" className="text-sm text-destructive" role="alert">
            Nome é obrigatório
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="wizard-client">Cliente (opcional)</Label>
        <Popover open={clientSearchOpen} onOpenChange={setClientSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              id="wizard-client"
              variant="outline"
              role="combobox"
              aria-expanded={clientSearchOpen}
              className="w-full justify-between font-normal"
            >
              {selectedClient ? (
                <span>
                  {selectedClient.name}
                  {selectedClient.company ? ` — ${selectedClient.company}` : ""}
                </span>
              ) : (
                <span className="text-muted-foreground">Buscar ou selecionar cliente...</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <Input
                placeholder="Buscar cliente..."
                value={clientSearchQuery}
                onChange={(e) => setClientSearchQuery(e.target.value)}
                className="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                autoFocus
              />
            </div>
            <div className="max-h-[300px] overflow-y-auto p-1">
              {!hasSearch ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Digite para buscar um cliente
                </div>
              ) : (
                <>
                  {showCreateOption && (
                    <button
                      type="button"
                      onClick={() => setCreateClientDialogOpen(true)}
                      className={cn(
                        "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                        "text-primary"
                      )}
                    >
                      <Plus className="mr-2 h-4 w-4 shrink-0" />
                      Criar novo cliente: {clientSearchQuery.trim()}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ clientId: null });
                      setClientSearchOpen(false);
                      setClientSearchQuery("");
                    }}
                    className={cn(
                      "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", !config.clientId ? "opacity-100" : "opacity-0")} />
                    Nenhum
                  </button>
                  {filteredClients.length === 0 && hasSearch && !showCreateOption && (
                    <div className="py-2 text-center text-sm text-muted-foreground">
                      Nenhum cliente encontrado.
                    </div>
                  )}
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChange({ clientId: c.id });
                        setClientSearchOpen(false);
                        setClientSearchQuery("");
                      }}
                      className={cn(
                        "relative flex w-full cursor-pointer select-none items-start rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Check
                        className={cn(
                          "mr-2 mt-0.5 h-4 w-4 shrink-0",
                          config.clientId === c.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col min-w-0">
                        <span>{c.name}</span>
                        {(c.company || c.email) && (
                          <span className="text-xs text-muted-foreground">
                            {[c.company, c.email].filter(Boolean).join(" • ")}
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
        <AddClientDialog
          open={createClientDialogOpen}
          onOpenChange={setCreateClientDialogOpen}
          initialName={clientSearchQuery.trim()}
          onSuccess={handleClientCreated}
        />
      </div>

      {teams.length > 0 && (
        <div className="space-y-2">
          <Label>Equipe responsável (opcional)</Label>
          <Select
            value={config.teamId ?? "none"}
            onValueChange={(v) => onChange({ teamId: v === "none" ? null : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Nenhuma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="wizard-description">Descrição (opcional)</Label>
        <SystemRichEditor
          id="wizard-description"
          value={config.description ?? ""}
          onChange={(html) => onChange({ description: html })}
          placeholder="Descreva o objetivo do projeto..."
          className="min-h-[100px] w-full"
        />
      </div>

      <div className="space-y-2">
        <Label>Responsáveis iniciais (opcional)</Label>
        <div className="flex flex-wrap gap-2">
          {selectedMembers.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm"
            >
              {m.name}
              <button
                type="button"
                onClick={() =>
                  onChange({
                    responsibleIds: config.responsibleIds.filter((id) => id !== m.id),
                  })
                }
                className="rounded p-0.5 hover:bg-muted-foreground/20"
                aria-label={`Remover ${m.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1">
                <ChevronDown className="h-4 w-4" />
                Adicionar
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              {members
                .filter((m) => !config.responsibleIds.includes(m.id))
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() =>
                      onChange({ responsibleIds: [...config.responsibleIds, m.id] })
                    }
                  >
                    {m.name}
                  </button>
                ))}
              {members.filter((m) => !config.responsibleIds.includes(m.id)).length === 0 && (
                <p className="px-2 py-1 text-sm text-muted-foreground">
                  Todos já adicionados
                </p>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <div className="space-y-2">
          <Label>Data de início (opcional)</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full min-w-[200px] justify-start text-left font-normal",
                  !config.startDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {config.startDate
                  ? format(new Date(config.startDate), "PPP", { locale: ptBR })
                  : "Selecionar"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={config.startDate ? new Date(config.startDate) : undefined}
                onSelect={(d) => onChange({ startDate: d ? d.toISOString().split("T")[0] : null })}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-2">
          <Label>Data de término (opcional)</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full min-w-[200px] justify-start text-left font-normal",
                  !config.endDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {config.endDate
                  ? format(new Date(config.endDate), "PPP", { locale: ptBR })
                  : "Selecionar"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={config.endDate ? new Date(config.endDate) : undefined}
                onSelect={(d) => onChange({ endDate: d ? d.toISOString().split("T")[0] : null })}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
