import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { WizardSpecificConfig } from "../types";
import { Step3Areas } from "./Step3Areas";

interface Step3AdvancedProps {
  config: WizardSpecificConfig;
  onChange: (partial: Partial<WizardSpecificConfig>) => void;
}

export function Step3Advanced({ config, onChange }: Step3AdvancedProps) {
  return (
    <div className="space-y-8">
      <Step3Areas config={config} onChange={onChange} />
      <div className="space-y-4 rounded-lg border p-4">
        <h4 className="font-medium">Primeira versão (release)</h4>
        <p className="text-sm text-muted-foreground">
          Opcional: criar a primeira versão do projeto agora para planejamento.
        </p>
        <div className="flex gap-4 items-center">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="first-version"
              checked={config.createFirstVersion === true}
              onChange={() => onChange({ createFirstVersion: true })}
              className="rounded-full border-input"
            />
            <span>Sim</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="first-version"
              checked={config.createFirstVersion !== true}
              onChange={() =>
                onChange({
                  createFirstVersion: false,
                  firstVersionName: undefined,
                  firstVersionDate: undefined,
                })
              }
              className="rounded-full border-input"
            />
            <span>Não</span>
          </label>
        </div>
        {config.createFirstVersion && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first-version-name">Nome da versão</Label>
              <Input
                id="first-version-name"
                value={config.firstVersionName ?? ""}
                onChange={(e) => onChange({ firstVersionName: e.target.value })}
                placeholder="Ex.: v1.0, Sprint 1"
              />
            </div>
            <div className="space-y-2">
              <Label>Data prevista (opcional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !config.firstVersionDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {config.firstVersionDate
                      ? format(new Date(config.firstVersionDate), "PPP", {
                          locale: ptBR,
                        })
                      : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={
                      config.firstVersionDate
                        ? new Date(config.firstVersionDate)
                        : undefined
                    }
                    onSelect={(d) =>
                      onChange({
                        firstVersionDate: d
                          ? d.toISOString().split("T")[0]
                          : undefined,
                      })
                    }
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
