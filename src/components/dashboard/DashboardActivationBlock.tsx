import React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sparkles, X } from "lucide-react";
import { dashboardService } from "@/services/dashboard";
import { toast } from "sonner";

const ACTIVATION_CHECKLIST_KEY = ["dashboard", "activation-checklist"] as const;

/**
 * Primeiros passos: missões de ativação com progresso, conclusão automática (via API) e deep links.
 * Não é onboarding obrigatório — pode ser dispensado (persistido em profiles.hide_dashboard_activation_checklist).
 */
export function DashboardActivationBlock() {
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: ACTIVATION_CHECKLIST_KEY,
    queryFn: () => dashboardService.getActivationChecklist(),
    staleTime: 60 * 1000,
  });

  const dismissMutation = useMutation({
    mutationFn: () => dashboardService.dismissActivationChecklist(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACTIVATION_CHECKLIST_KEY });
    },
    onError: () => {
      toast.error("Não foi possível ocultar o bloco. Tente novamente.");
    },
  });

  if (isPending || isError || !data) {
    return null;
  }

  if (data.dismissed || data.pendingMissions.length === 0) {
    return null;
  }

  const { applicableTotal, completedCount, progressPercent, pendingMissions } = data;

  return (
    <Card className="border-primary/20 bg-primary/5 relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-8 w-8 text-muted-foreground hover:text-foreground"
        aria-label="Fechar primeiros passos"
        disabled={dismissMutation.isPending}
        onClick={() => dismissMutation.mutate()}
      >
        <X className="h-4 w-4" />
      </Button>
      <CardHeader className="pb-2 pr-12">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <CardTitle className="text-lg">Primeiros passos</CardTitle>
        </div>
        <CardDescription>
          Tarefas rápidas para ativar sua conta e começar a usar o CRM com pagamentos e atendimento integrados.
        </CardDescription>
        <div className="pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {completedCount} de {applicableTotal} concluído{applicableTotal === 1 ? "" : "s"}
            </span>
            <span className="font-medium tabular-nums">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pendingMissions.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm"
            >
              <div className="font-medium text-foreground leading-snug">{m.title}</div>
              <p className="text-sm text-muted-foreground flex-1">{m.description}</p>
              <Button variant="default" size="sm" className="w-fit mt-auto" asChild>
                <Link to={m.actionHref}>{m.actionLabel}</Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
