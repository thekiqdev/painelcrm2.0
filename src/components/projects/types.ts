
import { Member } from "@/components/shared/types";

export type ProjectStatus = "active" | "completed" | "archived";
export type TaskStatus = "todo" | "in-progress" | "review" | "completed";
export type Priority = "low" | "medium" | "high";

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  dueDate?: string;
  assignee?: Member;
  labels?: string[];
  checklist?: ChecklistItem[];
  tags?: string[];
}

export interface ProjectList {
  id: string;
  name: string;
  tasks: Task[];
  order: number;
}

export interface ProjectFile {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedBy: Member;
  uploadedAt: string;
  url: string;
}

export interface ProjectFinanceItem {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  date: string;
  status: "paid" | "pending" | "overdue";
  category?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  dueDate?: string;
  members: Member[];
  lists: ProjectList[];
  files: ProjectFile[];
  financeItems: ProjectFinanceItem[];
}
