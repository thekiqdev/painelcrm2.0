import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { WizardState } from "../types";
import type { Member } from "@/components/shared/types";
import type { Client } from "@/services/clients";
import type { Team } from "@/services/teams";

const PROJECT_TYPE_LABELS: Record<string, string> = {
  simple: "Projeto simples",
  areas: "Projeto com áreas",
  advanced: "Projeto avançado",
  template: "Usar template",
};

interface Step4ReviewProps {
  state: WizardState;
  clients: Client[];
  members: Member[];
  teams?: Team[];
}

export function Step4Review({ state, clients, members, teams = [] }: Step4ReviewProps) {
  const client = state.basicConfig.clientId
    ? clients.find((c) => c.id === state.basicConfig.clientId)
    : null;
  const responsibles = members.filter((m) =>
    state.basicConfig.responsibleIds.includes(m.id)
  );
  const selectedTeams = teams.filter((t) =>
    (state.basicConfig.teamIds ?? []).includes(t.id)
  );

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Revise os dados e clique em &quot;Criar projeto&quot; para finalizar.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Modelo e nome</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Tipo:</span>{" "}
              {state.projectType
                ? PROJECT_TYPE_LABELS[state.projectType] ?? state.projectType
                : "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Nome:</span>{" "}
              {state.basicConfig.name || "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cliente e datas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Cliente:</span>{" "}
              {client ? client.name : "Nenhum"}
            </p>
            <p>
              <span className="text-muted-foreground">Início:</span>{" "}
              {state.basicConfig.startDate
                ? format(new Date(state.basicConfig.startDate), "PP", {
                    locale: ptBR,
                  })
                : "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Término:</span>{" "}
              {state.basicConfig.endDate
                ? format(new Date(state.basicConfig.endDate), "PP", {
                    locale: ptBR,
                  })
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>
      {state.basicConfig.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Descrição</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {state.basicConfig.description}
            </p>
          </CardContent>
        </Card>
      )}
      {(selectedTeams.length > 0 || responsibles.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Equipes e responsáveis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {selectedTeams.length > 0 && (
              <p className="text-sm">
                <span className="text-muted-foreground">Equipe(s):</span>{" "}
                {selectedTeams.map((t) => t.name).join(", ")}
              </p>
            )}
            {responsibles.length > 0 && (
              <p className="text-sm">
                <span className="text-muted-foreground">Responsáveis:</span>{" "}
                {responsibles.map((m) => m.name).join(", ")}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {state.projectType === "template" && state.templateId && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Template</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Projeto será criado a partir do template selecionado na etapa 3.
            </p>
          </CardContent>
        </Card>
      )}
      {(state.projectType === "areas" || state.projectType === "advanced") &&
        (state.specificConfig.areas ?? []).filter((a) => a.trim()).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Áreas iniciais</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                {(state.specificConfig.areas ?? [])
                  .filter((a) => a.trim())
                  .join(", ")}
              </p>
            </CardContent>
          </Card>
        )}
      {state.projectType === "advanced" &&
        state.specificConfig.createFirstVersion &&
        state.specificConfig.firstVersionName && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Primeira versão</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Nome:</span>{" "}
                {state.specificConfig.firstVersionName}
              </p>
              {state.specificConfig.firstVersionDate && (
                <p>
                  <span className="text-muted-foreground">Data prevista:</span>{" "}
                  {format(
                    new Date(state.specificConfig.firstVersionDate),
                    "PP",
                    { locale: ptBR }
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        )}
    </div>
  );
}
