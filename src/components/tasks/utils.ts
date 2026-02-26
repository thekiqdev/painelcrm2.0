import { format } from "date-fns";
import type { UnifiedTaskPriority, UnifiedTask, UnifiedChecklistItem } from "@/lib/taskUnified";

export function getUnifiedPriorityColor(priority: UnifiedTaskPriority): string {
  switch (priority) {
    case "high":
      return "text-red-500";
    case "medium":
      return "text-amber-500";
    case "low":
      return "text-blue-500";
    default:
      return "text-muted-foreground";
  }
}

export function getUnifiedPriorityBorder(priority: UnifiedTaskPriority): string {
  switch (priority) {
    case "high":
      return "border-l-red-500";
    case "medium":
      return "border-l-amber-500";
    case "low":
      return "border-l-blue-500";
    default:
      return "border-l-muted-foreground";
  }
}

/** Classes para exibir prioridade como etiqueta (badge) na barra de contexto. */
export function getUnifiedPriorityBadgeClass(priority: UnifiedTaskPriority): string {
  switch (priority) {
    case "high":
      return "bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30";
    case "medium":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30";
    case "low":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30";
    default:
      return "bg-muted text-muted-foreground border border-border";
  }
}

export function formatUnifiedDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy");
  } catch {
    return "";
  }
}

export function formatUnifiedTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "";
  return timeStr.slice(0, 5);
}

export function getChecklistProgressFromItems(checklist: UnifiedChecklistItem[]): number {
  if (!checklist.length) return 0;
  const completed = checklist.filter((item) => item.completed).length;
  return Math.round((completed / checklist.length) * 100);
}

export function getUnifiedStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pendente",
    todo: "A fazer",
    "in-progress": "Em andamento",
    review: "Revisão",
    completed: "Concluída",
  };
  return labels[status] ?? status;
}
