import type {
  CrmSubscriptionBillingInterval,
  CrmSubscriptionContractHistoryRow,
  CrmSubscriptionHistoryChangeType,
} from "@/services/crmSubscriptions";

const LIFECYCLE_TYPES = new Set<CrmSubscriptionHistoryChangeType>(["pause", "resume", "reactivate"]);

export function isLifecycleHistoryChangeType(
  type: CrmSubscriptionHistoryChangeType
): type is "pause" | "resume" | "reactivate" {
  return LIFECYCLE_TYPES.has(type);
}

const INTERVAL_LABELS: Record<CrmSubscriptionBillingInterval, string> = {
  weekly: "Semanal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  semi_annual: "Semestral",
  yearly: "Anual",
};

export function billingIntervalLabelPt(interval: string): string {
  return INTERVAL_LABELS[interval as CrmSubscriptionBillingInterval] ?? interval;
}

export function contractChangeTypeLabelPt(type: CrmSubscriptionContractHistoryRow["change_type"]): string {
  const m: Record<CrmSubscriptionHistoryChangeType, string> = {
    upgrade: "Upgrade",
    downgrade: "Downgrade",
    interval_change: "Mudança de periodicidade",
    description_change: "Mudança de descrição",
    contract_update: "Alteração de contrato",
    pause: "Pausada",
    resume: "Retomada",
    reactivate: "Reativada",
  };
  return m[type] ?? type;
}

export function contractEffectiveAtLabelPt(
  effectiveAt: CrmSubscriptionContractHistoryRow["effective_at"]
): string {
  if (!effectiveAt) return "—";
  return effectiveAt === "immediate" ? "Imediata" : "Próximo ciclo";
}

export function contractStatusLabelPt(status: CrmSubscriptionContractHistoryRow["status"]): string {
  const m: Record<CrmSubscriptionContractHistoryRow["status"], string> = {
    pending: "Pendente",
    applied: "Aplicado",
    cancelled: "Cancelado",
  };
  return m[status] ?? status;
}

export function formatContractAmount(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
