import type { FinancialPayableItemDto } from "@/services/financial";

/** Data local YYYY-MM-DD (alinhado ao uso diário na UI). */
export function todayYmdLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function compareYmd(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export type PayableQueueBucket = "overdue" | "today" | "this_week" | "later";

export type GroupedPayableQueue = Record<PayableQueueBucket, FinancialPayableItemDto[]>;

const sortQueue = (a: FinancialPayableItemDto, b: FinancialPayableItemDto): number => {
  const c = compareYmd(a.due_date, b.due_date);
  if (c !== 0) return c;
  return a.description.localeCompare(b.description, "pt");
};

/**
 * Filas a pagar (não pagas / não canceladas), ordenadas por vencimento,
 * agrupadas: vencidas → hoje → esta semana → próximas (após o intervalo da semana do resumo).
 */
export function groupPayableQueue(
  items: FinancialPayableItemDto[],
  today: string,
  _weekStart: string,
  weekEnd: string
): GroupedPayableQueue {
  const queue = items.filter((it) => it.operational_status !== "paid" && it.operational_status !== "cancelled");
  const buckets: GroupedPayableQueue = {
    overdue: [],
    today: [],
    this_week: [],
    later: [],
  };

  for (const it of queue) {
    const d = it.due_date;
    if (it.operational_status === "overdue" || compareYmd(d, today) < 0) {
      buckets.overdue.push(it);
    } else if (d === today || it.operational_status === "due_today") {
      buckets.today.push(it);
    } else if (compareYmd(d, today) > 0 && compareYmd(d, weekEnd) <= 0) {
      buckets.this_week.push(it);
    } else {
      buckets.later.push(it);
    }
  }

  (Object.keys(buckets) as PayableQueueBucket[]).forEach((k) => {
    buckets[k].sort(sortQueue);
  });

  return buckets;
}

export function sumCents(items: FinancialPayableItemDto[]): number {
  return items.reduce((s, it) => s + it.amount_cents, 0);
}
