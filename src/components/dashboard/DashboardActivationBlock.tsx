import React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Check,
  CreditCard,
  FileText,
  MessageCircle,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { dashboardService, type ActivationMissionApplicableRow } from "@/services/dashboard";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const ACTIVATION_CHECKLIST_KEY = ["dashboard", "activation-checklist"] as const;

/** Textos gamificados (URLs seguem o backend). */
const MISSION_COPY: Record<
  string,
  { title: string; description: string; actionLabel: string }
> = {
  whatsapp: {
    title: "Conectar WhatsApp",
    description: "Atenda clientes direto pelo chat integrado ao CRM.",
    actionLabel: "Conectar agora",
  },
  first_client: {
    title: "Criar primeiro cliente",
    description: "Organize seus contatos e histórico em um só lugar.",
    actionLabel: "Criar cliente",
  },
  payment_gateway: {
    title: "Configurar recebimentos",
    description: "Receba por PIX, boleto ou cartão.",
    actionLabel: "Configurar",
  },
  first_invoice: {
    title: "Criar primeira cobrança",
    description: "Teste seu fluxo financeiro emitindo uma cobrança.",
    actionLabel: "Criar cobrança",
  },
  invite_users: {
    title: "Convidar a equipe",
    description: "Adicione colaboradores quando seu plano permitir mais acessos.",
    actionLabel: "Gerenciar usuários",
  },
};

const MISSION_ICON: Record<string, LucideIcon> = {
  whatsapp: MessageCircle,
  first_client: UserPlus,
  payment_gateway: CreditCard,
  first_invoice: FileText,
  invite_users: Users,
};

function mergeMissionDisplay(m: ActivationMissionApplicableRow) {
  const o = MISSION_COPY[m.id];
  return {
    ...m,
    title: o?.title ?? m.title,
    description: o?.description ?? m.description,
    actionLabel: o?.actionLabel ?? m.actionLabel,
  };
}

/**
 * Missões iniciais — onboarding gamificado; conclusão via API (activation checklist).
 */
export function DashboardActivationBlock({ className }: { className?: string }) {
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

  if (data.dismissed) {
    return null;
  }

  const applicableTotal = data.applicableTotal;
  const completedCount = data.completedCount;
  const progressPercent = data.progressPercent;

  const rowsFull: ActivationMissionApplicableRow[] =
    data.applicableMissions && data.applicableMissions.length > 0
      ? data.applicableMissions.map((m) => mergeMissionDisplay(m))
      : data.pendingMissions.map((m) => ({
          ...m,
          completed: false,
        }));

  const allDone = applicableTotal > 0 && completedCount >= applicableTotal;

  if (applicableTotal === 0 && rowsFull.length === 0) {
    return null;
  }

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-primary/25 bg-gradient-to-b from-primary/[0.07] to-card shadow-md",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 z-10 h-9 w-9 text-muted-foreground hover:text-foreground"
        aria-label="Fechar missões iniciais"
        disabled={dismissMutation.isPending}
        onClick={() => dismissMutation.mutate()}
      >
        <X className="h-4 w-4" />
      </Button>

      <CardHeader className="space-y-3 pb-3 pr-11 pt-5 sm:pr-12">
        <div className="flex items-start gap-2.5">
          <span className="text-2xl leading-none" aria-hidden>
            🚀
          </span>
          <div className="space-y-1">
            <CardTitle className="text-lg leading-tight sm:text-xl">Complete as missões iniciais</CardTitle>
            <CardDescription className="text-sm leading-snug">
              Configure seu sistema e comece a vender mais rápido.
            </CardDescription>
          </div>
        </div>

        {!allDone ? (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                Progresso:{" "}
                <span className="font-semibold text-foreground">
                  {completedCount} de {applicableTotal} concluída{applicableTotal === 1 ? "" : "s"}
                </span>
              </span>
              <span className="font-bold tabular-nums text-primary">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-3 bg-muted/80 [&>div]:bg-gradient-to-r [&>div]:from-primary [&>div]:to-violet-500 [&>div]:transition-all [&>div]:duration-500" />
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-center">
            <p className="text-lg font-bold text-foreground">
              <span aria-hidden>🎉</span> Sistema pronto!
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Agora você já pode vender, atender e cobrar pelo PainelCRM.
            </p>
            <Button asChild variant="secondary" className="mt-4" size="sm">
              <Link to="/dashboard">Explorar dashboard</Link>
            </Button>
          </div>
        )}
      </CardHeader>

      {!allDone ? (
        <CardContent className="pb-5 pt-0">
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            {rowsFull.map((m) => {
              const Icon = MISSION_ICON[m.id] ?? Sparkles;
              const done = m.completed;
              return (
                <li
                  key={m.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors",
                    done ? "border-emerald-500/25 bg-emerald-500/[0.06] opacity-95" : "border-border/80 hover:border-primary/25",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                        done ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary",
                      )}
                    >
                      {done ? <Check className="h-6 w-6" strokeWidth={2.5} /> : <Icon className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-semibold leading-snug text-foreground">{m.title}</p>
                      <p className="text-sm leading-snug text-muted-foreground">{m.description}</p>
                    </div>
                  </div>
                  {done ? (
                    <Button variant="outline" size="sm" className="w-full border-emerald-500/30 text-emerald-700 dark:text-emerald-300" disabled>
                      <Check className="mr-2 h-4 w-4" />
                      Concluído
                    </Button>
                  ) : (
                    <Button size="sm" className="mt-auto w-full font-semibold shadow-sm" asChild>
                      <Link to={m.actionHref}>{m.actionLabel}</Link>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}
