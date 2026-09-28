import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ProjectType } from "../types";
import { LayoutDashboard, Layers, Rocket, FileStack } from "lucide-react";

const MODEL_OPTIONS: {
  type: ProjectType;
  title: string;
  description: string;
  capabilities: string[];
  icon: React.ElementType;
}[] = [
  {
    type: "simple",
    title: "Projeto simples",
    description: "Fluxo direto de tarefas com Kanban padrão",
    capabilities: ["Tarefas", "Etapas", "Sem áreas", "Sem versões"],
    icon: LayoutDashboard,
  },
  {
    type: "areas",
    title: "Projeto com áreas",
    description: "Organização por times ou domínios",
    capabilities: ["Áreas", "Tarefas", "Etapas", "Controle de acesso por área"],
    icon: Layers,
  },
  {
    type: "advanced",
    title: "Projeto avançado",
    description: "Gestão contínua com releases e backlog",
    capabilities: ["Áreas", "Versões", "Backlog", "Roadmap futuro"],
    icon: Rocket,
  },
  {
    type: "template",
    title: "Usar template",
    description: "Iniciar projeto a partir de template pronto",
    capabilities: ["Templates do sistema", "Templates criados por você"],
    icon: FileStack,
  },
];

interface Step1SelectModelProps {
  selectedType: ProjectType | null;
  onSelect: (type: ProjectType) => void;
}

export function Step1SelectModel({ selectedType, onSelect }: Step1SelectModelProps) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Escolha o modelo do projeto. Você poderá configurar detalhes nas próximas etapas.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {MODEL_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = selectedType === option.type;
          return (
            <Card
              key={option.type}
              role="button"
              tabIndex={0}
              className={cn(
                "cursor-pointer transition-all hover:border-crm-primary/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-crm-primary focus-visible:ring-offset-2",
                isSelected && "border-crm-primary ring-2 ring-crm-primary/30 bg-crm-primary/5"
              )}
              onClick={() => onSelect(option.type)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(option.type);
                }
              }}
              aria-pressed={isSelected}
              aria-label={`Selecionar ${option.title}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      isSelected ? "bg-crm-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">{option.title}</CardTitle>
                    <CardDescription className="mt-1">{option.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  {option.capabilities.map((cap) => (
                    <li key={cap} className="rounded bg-muted/80 px-2 py-0.5">
                      {cap}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
