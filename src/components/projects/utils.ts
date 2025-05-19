
import { format } from "date-fns";
import { Priority, Task } from "./types";

// Get priority color
export const getPriorityColor = (priority: Priority) => {
  switch(priority) {
    case "high": return "text-red-500";
    case "medium": return "text-amber-500";
    case "low": return "text-blue-500";
    default: return "text-muted-foreground";
  }
};

// Format date
export const formatDate = (dateStr?: string) => {
  if (!dateStr) return "";
  return format(new Date(dateStr), "dd/MM/yyyy");
};

// Format currency
export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
};

// Calculate checklist progress
export const getChecklistProgress = (task: Task) => {
  const checklist = task.checklist || [];
  if (checklist.length === 0) return 0;
  const completed = checklist.filter(item => item.completed).length;
  return Math.round((completed / checklist.length) * 100);
};
