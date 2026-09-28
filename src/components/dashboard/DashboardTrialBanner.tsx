import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DashboardTrialBannerProps = {
  endsAt: Date;
  className?: string;
};

/**
 * Destaque do período de trial — visual reforçado no mobile.
 */
export function DashboardTrialBanner({ endsAt, className }: DashboardTrialBannerProps) {
  const now = Date.now();
  const endMs = endsAt.getTime();
  const daysLeft = Math.max(0, Math.ceil((endMs - now) / 86400000));
  const dateStr = endsAt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/12 via-amber-500/5 to-transparent p-4 shadow-md sm:p-5 dark:from-amber-500/15 dark:border-amber-400/35",
        className,
      )}
    >
      <div className="flex gap-3 sm:gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300">
          <Clock className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-base font-bold leading-tight text-foreground sm:text-lg">Período de avaliação ativo</p>
          <p className="text-sm leading-snug text-muted-foreground">
            <span className="font-semibold text-foreground">Faltam {daysLeft} dia{daysLeft !== 1 ? "s" : ""}</span> para o fim
            do teste. Término em <strong className="text-foreground">{dateStr}</strong>.
          </p>
          <p className="text-sm text-muted-foreground">
            Ative um plano para continuar usando sem interrupções.
          </p>
          <Button asChild className="mt-1 w-full sm:w-auto" size="default">
            <Link to="/meu-plano">Ver planos</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
