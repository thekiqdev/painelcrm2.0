
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
}
