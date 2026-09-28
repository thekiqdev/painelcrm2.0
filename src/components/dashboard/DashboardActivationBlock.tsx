import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  CreditCard,
  FileText,
  MessageCircle,
  Sparkles,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { dashboardService, type ActivationMissionApplicableRow } from "@/services/dashboard";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const ACTIVATION_CHECKLIST_KEY = ["dashboard", "activation-checklist"] as const;
const PERCENT_ANIMATION_MS = 750;

/** Ordem de prioridade (alinhada ao backend). */
const MISSION_ORDER = [
  "whatsapp",
  "first_client",
  "payment_gateway",
  "first_invoice",
  "invite_users",
] as const;

const MISSION_COPY: Record<
  string,
  { title: string; description: string; actionLabel: string }
> = {
  whatsapp: {
    title: "WhatsApp conectado",
    description: "Atenda clientes pelo chat integrado ao CRM com histórico centralizado.",
    actionLabel: "Conectar WhatsApp",
  },
  first_client: {
    title: "Adicionar primeiro cliente",
    description: "Organize contatos, negócios e histórico em um só lugar.",
    actionLabel: "Cadastrar cliente",
  },
  payment_gateway: {
    title: "Configurar gateway",
    description: "Receba por PIX, boleto ou cartão com gateway ativo.",
    actionLabel: "Configurar gateway",
  },
  first_invoice: {
    title: "Criar primeira cobrança",
    description: "Emita uma cobrança e valide seu fluxo financeiro.",
    actionLabel: "Nova cobrança",
  },
  invite_users: {
    title: "Equipe configurada",
    description: "Convide colaboradores quando seu plano permitir mais acessos.",
    actionLabel: "Convidar usuário",
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

function sortMissions(rows: ActivationMissionApplicableRow[], pendingFirst: boolean) {
  const orderIndex = (id: string) => {
    const i = MISSION_ORDER.indexOf(id as (typeof MISSION_ORDER)[number]);
    return i === -1 ? 99 : i;
  };
  return [...rows].sort((a, b) => {
    if (pendingFirst && a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    return orderIndex(a.id) - orderIndex(b.id);
  });
}

/** Anima percentual sem alterar o valor vindo da API. */
function useAnimatedPercent(target: number, durationMs = PERCENT_ANIMATION_MS): number {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return display;
}

function ActivationProgressBar({ value, className }: { value: number; className?: string }) {
  const animated = useAnimatedPercent(value);
  return (
    <Progress
      value={animated}
      className={cn(
        "h-2.5 overflow-hidden rounded-full bg-muted/80",
        "[&>div]:bg-gradient-to-r [&>div]:from-primary [&>div]:via-primary/90 [&>div]:to-violet-500",
        "[&>div]:transition-[transform] [&>div]:duration-700 [&>div]:ease-out",
        className,
      )}
      aria-valuenow={animated}
      aria-valuemin={0}
      aria-valuemax={100}
    />
  );
}

type MissionRow = ReturnType<typeof mergeMissionDisplay>;

function MissionStatusBadge({ completed }: { completed: boolean }) {
  if (completed) {
    return (
      <Badge
        variant="outline"
        className="shrink-0 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      >
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Concluído
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="shrink-0 border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    >
      <Circle className="mr-1 h-3 w-3" />
      Pendente
    </Badge>
  );
}

function ActivationMissionCard({ mission, className }: { mission: MissionRow; className?: string }) {
  const Icon = MISSION_ICON[mission.id] ?? Sparkles;
  const done = mission.completed;

  return (
    <article
      className={cn(
        "group flex flex-col gap-4 rounded-2xl border p-4 shadow-sm transition-all duration-300 sm:p-5",
        done
          ? "border-emerald-500/20 bg-emerald-500/[0.04]"
          : "border-border/80 bg-card hover:border-primary/30 hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors",
            done ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary",
          )}
        >
          {done ? <Check className="h-6 w-6" strokeWidth={2.5} /> : <Icon className="h-5 w-5" />}
        </div>
        <MissionStatusBadge completed={done} />
      </div>

      <div className="space-y-1.5">
        <h3 className="text-base font-semibold leading-snug text-foreground">{mission.title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{mission.description}</p>
      </div>

      {done ? (
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <Check className="h-4 w-4 shrink-0" />
          Etapa concluída
        </div>
      ) : (
        <Button size="sm" className="w-full font-semibold shadow-sm" asChild>
          <Link to={mission.actionHref}>
            {mission.actionLabel}
            <ArrowRight className="ml-2 h-4 w-4 opacity-80" />
          </Link>
        </Button>
      )}
    </article>
  );
}

function RecommendedNextStep({ mission }: { mission: MissionRow }) {
  const Icon = MISSION_ICON[mission.id] ?? Zap;
  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.14] via-primary/[0.07] to-transparent p-4 shadow-sm md:hidden">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
        <Zap className="h-3.5 w-3.5" />
        Próxima ação recomendada
      </div>
      <div className="flex gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold leading-snug text-foreground">{mission.title}</p>
          <p className="line-clamp-2 text-sm text-muted-foreground">{mission.description}</p>
        </div>
      </div>
      <Button className="mt-4 w-full font-semibold shadow-md" size="lg" asChild>
        <Link to={mission.actionHref}>
          {mission.actionLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

/**
 * Central de Ativação da operação — UI sobre activationChecklistService (regras inalteradas).
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
      toast.error("Não foi possível ocultar a central. Tente novamente.");
    },
  });

  const progressPercent = data?.progressPercent ?? 0;
  const animatedPercent = useAnimatedPercent(progressPercent);

  const missions = useMemo(() => {
    if (!data || data.dismissed) return [];
    const raw: ActivationMissionApplicableRow[] =
      data.applicableMissions && data.applicableMissions.length > 0
        ? data.applicableMissions
        : data.pendingMissions.map((m) => ({ ...m, completed: false }));
    return sortMissions(raw.map(mergeMissionDisplay), true);
  }, [data]);

  const nextPending = useMemo(() => missions.find((m) => !m.completed), [missions]);

  if (isPending || isError || !data) {
    return null;
  }

  if (data.dismissed) {
    return null;
  }

  const { applicableTotal, completedCount } = data;
  const allDone = applicableTotal > 0 && progressPercent >= 100;

  if (applicableTotal === 0 && missions.length === 0) {
    return null;
  }

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-primary/20 bg-gradient-to-b from-primary/[0.07] via-card to-card shadow-lg",
        className,
      )}
      role="region"
      aria-labelledby="activation-center-title"
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-12 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl"
        aria-hidden
      />

      <CardHeader className="relative space-y-4 pb-2 pt-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Central de Ativação</p>
            <CardTitle id="activation-center-title" className="text-xl leading-tight sm:text-2xl">
              {allDone ? (
                "Operação totalmente configurada"
              ) : (
                <>
                  Sua operação está{" "}
                  <span className="tabular-nums text-primary">{animatedPercent}%</span> pronta
                </>
              )}
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              {allDone
                ? "Todas as etapas essenciais foram concluídas. Explore o PainelCRM com sua operação pronta."
                : "Complete as próximas etapas para aproveitar todo o potencial do PainelCRM."}
            </CardDescription>
          </div>
        </div>

        {!allDone ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{completedCount}</span> de{" "}
                <span className="font-medium text-foreground">{applicableTotal}</span> etapas
              </span>
              <span className="text-lg font-bold tabular-nums text-primary">{animatedPercent}%</span>
            </div>
            <ActivationProgressBar value={progressPercent} />
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="relative space-y-4 pb-6 pt-2">
        {allDone ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08] px-4 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <p className="max-w-md text-sm text-muted-foreground">
              Você concluiu todas as missões aplicáveis ao seu plano. Oculte esta central quando não precisar mais
              dela.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={dismissMutation.isPending}
              onClick={() => dismissMutation.mutate()}
            >
              Ocultar permanentemente
            </Button>
          </div>
        ) : (
          <>
            {nextPending ? <RecommendedNextStep mission={nextPending} /> : null}

            <div>
              <p className="mb-3 hidden text-xs font-semibold uppercase tracking-wide text-muted-foreground md:block">
                Missões da operação
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {missions.map((m) => (
                  <ActivationMissionCard
                    key={m.id}
                    mission={m}
                    className={cn(nextPending?.id === m.id && !m.completed && "hidden md:flex")}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
