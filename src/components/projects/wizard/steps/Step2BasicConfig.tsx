import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SystemRichEditor } from "@/components/editor";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { WizardBasicConfig } from "../types";
import type { Member } from "@/components/shared/types";
import type { Client } from "@/services/clients";
import { ClientSearchCombobox } from "@/components/clients/ClientSearchCombobox";

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
  const selectedTeams = teams.filter((t) => config.teamIds.includes(t.id));

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

      <ClientSearchCombobox
        id="wizard-client"
        value={config.clientId}
        onChange={(clientId) => onChange({ clientId })}
        clients={clients}
        remoteSearch={false}
        onClientCreated={onClientCreated}
        label="Cliente (opcional)"
        placeholderTrigger="Buscar ou selecionar cliente..."
      />

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

      <div className="grid gap-6 sm:grid-cols-2">
        {teams.length > 0 && (
          <div className="space-y-2">
            <Label>Equipe(s) responsável(eis) (opcional)</Label>
            <div className="flex flex-wrap gap-2">
              {selectedTeams.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm"
                >
                  {t.name}
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        teamIds: config.teamIds.filter((id) => id !== t.id),
                      })
                    }
                    className="rounded p-0.5 hover:bg-muted-foreground/20"
                    aria-label={`Remover ${t.name}`}
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
                  {teams
                    .filter((t) => !config.teamIds.includes(t.id))
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                        onClick={() =>
                          onChange({ teamIds: [...config.teamIds, t.id] })
                        }
                      >
                        {t.name}
                      </button>
                    ))}
                  {teams.filter((t) => !config.teamIds.includes(t.id)).length === 0 && (
                    <p className="px-2 py-1 text-sm text-muted-foreground">
                      Todas já adicionadas
                    </p>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
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
