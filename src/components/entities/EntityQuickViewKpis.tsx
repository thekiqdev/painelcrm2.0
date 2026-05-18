import { MessageCircle, Receipt, Ticket, Wallet } from "lucide-react";
import { ENTITY_QUICK_VIEW_PAD } from "./entityQuickViewLayout";
import { StatCard } from "./StatCard";
import { formatBrlFromCents, useEntityQuickViewMetrics } from "./useEntityQuickViewMetrics";
import { cn } from "@/lib/utils";

type Props = {
  entityKind: "client" | "lead";
  entityId: string;
  canViewFinance: boolean;
  canViewTickets: boolean;
  canViewChat: boolean;
  seedTickets?: Array<{ status?: string }> | null;
  className?: string;
};

export function EntityQuickViewKpis({
  entityKind,
  entityId,
  canViewFinance,
  canViewTickets,
  canViewChat,
  seedTickets,
  className,
}: Props) {
  const metrics = useEntityQuickViewMetrics({
    entityKind,
    entityId,
    canViewFinance,
    canViewTickets,
    canViewChat,
    seedTickets,
  });

  const showFinance = entityKind === "client" && canViewFinance;
  const showAny = showFinance || canViewTickets || canViewChat;
  if (!showAny) return null;

  return (
    <section className={cn("border-b border-border/40 pb-3", ENTITY_QUICK_VIEW_PAD, className)}>
      <div className="grid grid-cols-2 gap-2">
        {showFinance ? (
          <StatCard
            label="Total faturado"
            icon={Wallet}
            iconClassName="bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
            loading={metrics.metricsLoading}
            value={formatBrlFromCents(metrics.totalBilledCents)}
          />
        ) : (
          <StatCard
            label="Total faturado"
            icon={Wallet}
            iconClassName="bg-muted text-muted-foreground"
            value="—"
          />
        )}
        {showFinance ? (
          <StatCard
            label="Nº de faturas"
            icon={Receipt}
            iconClassName="bg-violet-500/15 text-violet-700 dark:text-violet-300"
            loading={metrics.metricsLoading}
            value={metrics.invoicesCount}
          />
        ) : (
          <StatCard
            label="Nº de faturas"
            icon={Receipt}
            iconClassName="bg-muted text-muted-foreground"
            value="—"
          />
        )}
        {canViewTickets ? (
          <StatCard
            label="Nº de tickets"
            icon={Ticket}
            iconClassName="bg-amber-500/15 text-amber-800 dark:text-amber-200"
            loading={metrics.metricsLoading}
            value={metrics.ticketsCount}
          />
        ) : null}
        {canViewChat ? (
          <StatCard
            label="Nº de conversas"
            icon={MessageCircle}
            iconClassName="bg-sky-500/15 text-sky-800 dark:text-sky-200"
            loading={metrics.metricsLoading}
            value={metrics.conversationsCount}
          />
        ) : null}
      </div>
    </section>
  );
}

export { useEntityQuickViewMetrics };
