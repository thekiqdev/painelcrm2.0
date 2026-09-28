import type { Task, TaskOriginApi } from "@/services/tasks";

export type KanbanColumnId = "todo" | "in_progress" | "waiting" | "done";

export const KANBAN_COLUMNS: { id: KanbanColumnId; label: string }[] = [
  { id: "todo", label: "A fazer" },
  { id: "in_progress", label: "Em andamento" },
  { id: "waiting", label: "Aguardando" },
  { id: "done", label: "Concluído" },
];

const COL_SET = new Set<KanbanColumnId>(["todo", "in_progress", "waiting", "done"]);

/** Coluna visível a partir do DTO unificado (espelha o backend). */
export function taskKanbanColumn(task: Pick<Task, "normalized_status" | "status" | "origin">): KanbanColumnId {
  const ns = task.normalized_status;
  if (ns && COL_SET.has(ns)) return ns;

  const raw = String(task.status ?? "").trim().toLowerCase();
  const o = task.origin ?? "standalone";

  if (o === "standalone") {
    if (raw === "pending") return "todo";
    if (raw === "in_progress") return "in_progress";
    if (raw === "waiting") return "waiting";
    if (raw === "completed") return "done";
    if (raw === "cancelled") return "done";
    return "todo";
  }

  if (o === "project") {
    if (raw === "todo") return "todo";
    if (raw === "in_progress") return "in_progress";
    if (raw === "review" || raw === "waiting" || raw === "blocked") return "waiting";
    if (raw === "done" || raw === "completed") return "done";
    return "todo";
  }

  if (raw === "pending" || raw === "pendente") return "todo";
  if (raw === "completed" || raw === "concluída" || raw === "concluida" || raw === "concluído" || raw === "concluido")
    return "done";
  if (raw === "in_progress" || raw === "em progresso" || raw === "em andamento") return "in_progress";
  if (raw === "waiting" || raw === "aguardando" || raw === "revisão" || raw === "revisao") return "waiting";
  return "todo";
}

export function mapKanbanColumnToStandaloneStatus(column: KanbanColumnId): string {
  switch (column) {
    case "todo":
      return "pending";
    case "in_progress":
      return "in_progress";
    case "waiting":
      return "waiting";
    case "done":
      return "completed";
    default:
      return "pending";
  }
}

/** Coluna “Aguardando” no projeto: revisão (padrão do board). */
export function mapKanbanColumnToProjectStatus(column: KanbanColumnId): string {
  switch (column) {
    case "todo":
      return "todo";
    case "in_progress":
      return "in_progress";
    case "waiting":
      return "review";
    case "done":
      return "done";
    default:
      return "todo";
  }
}

/** Status em client_tasks / lead_tasks (PT-BR usado no CRM). */
export function mapKanbanColumnToClientLeadStatus(column: KanbanColumnId): string {
  switch (column) {
    case "todo":
      return "Pendente";
    case "in_progress":
      return "Em andamento";
    case "waiting":
      return "Em andamento";
    case "done":
      return "Concluído";
    default:
      return "Pendente";
  }
}

export function isOriginKanbanSupported(origin: TaskOriginApi | undefined): boolean {
  return (
    origin === "standalone" ||
    origin === "project" ||
    origin === "client" ||
    origin === "lead"
  );
}
