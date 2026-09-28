import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Project, ProjectFinanceItem } from "./types";
import type { Member } from "@/components/shared/types";
import { formatCurrency, formatDate } from "./utils";

const KANBAN_STAGE_PROGRESS: Record<string, number> = {
  backlog: 10,
  "in-progress": 50,
  review: 75,
  done: 100,
};

export function calculateProjectTaskProgress(project: Project): number {
  if (project.lists && project.lists.length > 0) {
    const totalTasks = project.lists.reduce((acc, list) => acc + list.tasks.length, 0);
    if (totalTasks === 0) return 0;
    const completedTasks = project.lists.reduce(
      (acc, list) => acc + list.tasks.filter((task) => task.status === "completed").length,
      0,
    );
    return Math.round((completedTasks / totalTasks) * 100);
  }
  const stage = project.kanbanStage ?? "backlog";
  return KANBAN_STAGE_PROGRESS[stage] ?? 0;
}

export function projectStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Ativo";
    case "completed":
      return "Concluído";
    case "archived":
      return "Arquivado";
    default:
      return status || "—";
  }
}

export function projectStatusBadgeVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "active":
      return "default";
    case "completed":
      return "secondary";
    case "archived":
      return "outline";
    default:
      return "outline";
  }
}

export function resolveProjectResponsibles(
  project: Project,
  members: Member[],
): Member[] {
  const ids = project.responsible_ids ?? [];
  if (ids.length > 0) {
    return ids
      .map((id) => members.find((m) => m.id === id))
      .filter((m): m is Member => Boolean(m));
  }
  return project.members ?? [];
}

export function formatProjectRelativeTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return "—";
  }
}

export type ProjectFinanceSummary = {
  budget: number;
  spent: number;
  balance: number;
};

export function computeProjectFinanceSummary(
  items: ProjectFinanceItem[] | undefined,
): ProjectFinanceSummary | null {
  if (!items || items.length === 0) return null;
  const invoices = items.filter((i) => i.type === "invoice");
  const expenses = items.filter((i) => i.type === "expense");
  const budget = invoices.reduce((sum, i) => sum + i.amount, 0);
  const spent = expenses.reduce((sum, i) => sum + i.amount, 0);
  return { budget, spent, balance: budget - spent };
}

export function formatFinanceCell(summary: ProjectFinanceSummary | null): string {
  if (!summary) return "—";
  return formatCurrency(summary.budget);
}

export function formatFinanceSpent(summary: ProjectFinanceSummary | null): string {
  if (!summary) return "—";
  return formatCurrency(summary.spent);
}

export function formatFinanceBalance(summary: ProjectFinanceSummary | null): string {
  if (!summary) return "—";
  return formatCurrency(summary.balance);
}

export function formatProjectDueDate(dueDate?: string): string {
  if (!dueDate) return "—";
  return formatDate(dueDate);
}

export const PROJECTS_LIST_PAGE_SIZE = 25;
