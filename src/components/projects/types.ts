
export interface ProjectFile {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedBy?: Member;
  uploadedAt: string;
  url: string;
}

export interface ProjectList {
  id: string;
  name: string;
  tasks: Task[];
  order: number;
}

export type TaskStatus = "todo" | "in-progress" | "review" | "completed";
export type Priority = "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dueDate?: string;
  assignee?: Member;
  tags?: string[];
  labels?: string[];
  checklist?: ChecklistItem[];
  /** Campos customizados (ex.: tagColors para cores das etiquetas). */
  customFields?: Record<string, unknown>;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

// Add ProjectFinanceItem type
export interface ProjectFinanceItem {
  id: string;
  type: "invoice" | "expense";
  description: string;
  amount: number;
  date: string;
  status: "draft" | "pending" | "paid" | "overdue";
  category?: string;
  dueDate?: string;
  invoiceNumber?: string;
  items?: any[];
  notes?: string;
}

// Interface Project
import { Member } from "@/components/shared/types";
import type { ProjectVersion } from "@/services/projects";

export interface ProjectArea {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  responsible_ids?: string[];
  team_ids?: string[];
  created_at?: string;
  updated_at?: string;
}

export type ProjectType = "simple" | "areas" | "advanced" | "template";

export interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  dueDate?: string;
  members: Member[];
  tags?: string[];
  lists: ProjectList[];
  files?: ProjectFile[];
  financeItems: ProjectFinanceItem[];
  kanbanStage?: string;
  project_type?: ProjectType;
  client_id?: string | null;
  /** Nome do cliente quando disponível na listagem/detalhe. */
  clientName?: string | null;
  areas?: ProjectArea[];
  versions?: ProjectVersion[];
  /** Equipe responsável (opcional). */
  team_id?: string | null;
  teamName?: string | null;
  /** IDs dos responsáveis selecionados no projeto (disponíveis para áreas). */
  responsible_ids?: string[];
  /** IDs das equipes selecionadas no projeto (disponíveis para áreas). */
  team_ids?: string[];
}
