import type { Task } from '@/services/tasks';

/** Contexto de criação — um único formulário, vários destinos de API. */
export type TaskFormContext =
  | { origin: 'standalone' }
  | {
      origin: 'project';
      projectId: string;
      listId: string;
      areaId?: string | null;
      projectName?: string | null;
      /** Opcional: filtro de responsáveis por equipe (igual fluxo antigo do projeto). */
      teams?: { id: string; name: string }[];
    }
  | { origin: 'client'; clientId: string; clientName?: string | null }
  | { origin: 'lead'; leadId: string; leadName?: string | null }
  | {
      origin: 'chat';
      conversationId: string;
      clientId?: string | null;
      leadId?: string | null;
      clientName?: string | null;
      leadName?: string | null;
    };

export interface TaskFormValues {
  title: string;
  description: string;
  assignee_id: string | null;
  assignee_name: string | null;
  priority: 'low' | 'medium' | 'high';
  /** Standalone: pending | completed. Lead: Pendente | ... Client: texto livre / Pendente. Project: ignorado no create (todo). */
  status: string;
  due_date: string | null;
  due_time: string | null;
  checklist: { id: string; text: string; completed: boolean }[];
  /** Standalone: opcional */
  deal: string | null;
  client_id: string | null;
  client_name: string | null;
}

export type TaskFormSuccessResult =
  | { origin: 'standalone'; task: Task }
  | { origin: 'project'; apiTask: import('@/services/projects').ProjectTask; listId: string }
  | { origin: 'client'; task: Task }
  | { origin: 'lead'; task: Task }
  | { origin: 'chat'; task: Task };
