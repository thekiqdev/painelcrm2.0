import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatYmdBrSafe } from '@/lib/billingSafeDate';
import type { CrmSubscriptionListItem } from "@/services/crmSubscriptions";

export const HIDE_ENDED_STORAGE_KEY = "crm_subscriptions_hide_ended";

export const PERIOD_PRESETS = [
  { label: "Semana", value: "current_week" },
  { label: "Mês", value: "current_month" },
  { label: "Trimestre", value: "current_quarter" },
  { label: "Semestre", value: "current_semester" },
  { label: "Ano", value: "full_year" },
] as const;

export function readStoredHideEnded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(HIDE_ENDED_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

export function isSubscriptionEnded(row: CrmSubscriptionListItem): boolean {
  return row.status === "cancelled";
}

export function formatAmount(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function formatAmountPerMonth(cents: number): string {
  return `${formatAmount(cents)}/mês`;
}

export function formatAmountPerYear(cents: number): string {
  return `${formatAmount(cents)}/ano`;
}

export function monthLabel(ym: string): string {
  if (!ym || ym.length < 7) return ym;
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return format(d, "MMM/yy", { locale: ptBR });
}

export function intervalLabel(interval: string): string {
  const m: Record<string, string> = {
    weekly: "Semanal",
    monthly: "Mensal",
    quarterly: "Trimestral",
    semi_annual: "Semestral",
    yearly: "Anual",
  };
  return m[interval] ?? interval;
}

export type SubscriptionStatusFilter = "all" | "active" | "paused" | "cancelled";

export function subscriptionStatusUi(row: CrmSubscriptionListItem): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  filterKey: SubscriptionStatusFilter;
} {
  if (row.status === "cancelled") {
    return { label: "Cancelada", variant: "secondary", filterKey: "cancelled" };
  }
  if (row.status === "paused") {
    return { label: "Pausada", variant: "outline", filterKey: "paused" };
  }
  if (row.status !== "active") {
    return { label: row.status, variant: "outline", filterKey: "all" };
  }
  if (row.cancel_at_period_end) {
    return { label: "Encerra ao fim do período", variant: "outline", filterKey: "active" };
  }
  return { label: "Ativa", variant: "default", filterKey: "active" };
}

export function matchesSubscriptionStatusFilter(
  row: CrmSubscriptionListItem,
  filter: SubscriptionStatusFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "active") return row.status === "active";
  if (filter === "paused") return row.status === "paused";
  if (filter === "cancelled") return row.status === "cancelled";
  return true;
}

export function formatYmdBr(ymd: string | null | undefined): string {
  return formatYmdBrSafe(ymd);
}

export function matchesSubscriptionSearch(row: CrmSubscriptionListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.client_name,
    row.plan_label,
    intervalLabel(row.billing_interval),
    subscriptionStatusUi(row).label,
    row.status,
    row.link_checkout ? "por link" : "",
    formatAmount(row.amount_cents),
    row.next_billing_date?.slice(0, 10),
    formatYmdBr(row.next_billing_date),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
