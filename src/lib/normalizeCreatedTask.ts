import type { ProjectTask } from '@/services/projects';
import type { ClientTask } from '@/services/clients';
import type { NormalizedTaskStatusApi, Task } from '@/services/tasks';

function projectStatusToNormalized(status: string): NormalizedTaskStatusApi {
  const s = String(status ?? '').toLowerCase();
  if (s === 'todo') return 'todo';
  if (s === 'in_progress') return 'in_progress';
  if (s === 'review' || s === 'waiting' || s === 'blocked') return 'waiting';
  if (s === 'done' || s === 'completed') return 'done';
  return 'todo';
}

function clientLeadStatusToNormalized(status: string): NormalizedTaskStatusApi {
  const s = String(status ?? '').toLowerCase();
  if (s.includes('conclu')) return 'done';
  if (s.includes('andamento') || s === 'em andamento') return 'in_progress';
  return 'todo';
}

/** Converte resposta de project_tasks para linha compatível com lista unificada em /tasks. */
export function normalizeCreatedProjectTask(
  api: ProjectTask,
  projectName: string,
  assigneeName: string | null
): Task {
  const due = api.due_date ? api.due_date.slice(0, 10) : null;
  return {
    id: api.id,
    title: api.title,
    description: api.description ?? undefined,
    date: due,
    time: null,
    status: api.status,
    normalized_status: projectStatusToNormalized(api.status),
    priority: (['low', 'medium', 'high'].includes(String(api.priority))
      ? api.priority
      : 'medium') as Task['priority'],
    user_id: undefined,
    assignee_id: api.assignee_id,
    assignee: assigneeName,
    assigneeAvatar: assigneeName
      ? assigneeName
          .split(/\s+/)
          .filter(Boolean)
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : null,
    checklist: Array.isArray(api.checklist) ? api.checklist : [],
    origin: 'project',
    origin_id: api.id,
    project_id: api.project_id,
    project_name: projectName,
    client_id: null,
    client_name: null,
    lead_id: null,
    lead_name: null,
    deal: null,
  };
}

export function normalizeCreatedClientTask(row: ClientTask, clientName: string): Task {
  const due = row.due_date ? String(row.due_date).slice(0, 10) : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    date: due,
    time: null,
    status: row.status,
    normalized_status: clientLeadStatusToNormalized(row.status),
    priority: 'medium',
    user_id: undefined,
    assignee_id: null,
    assignee: null,
    assigneeAvatar: null,
    checklist: [],
    origin: 'client',
    origin_id: row.id,
    project_id: null,
    project_name: null,
    client_id: row.client_id,
    client_name: clientName,
    lead_id: null,
    lead_name: null,
    deal: null,
    clientId: row.client_id,
    client: clientName,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function normalizeCreatedLeadTask(
  row: {
    id: string;
    lead_id: string;
    title: string;
    description?: string | null;
    status?: string | null;
    due_date?: string | null;
    created_at?: string;
    updated_at?: string;
  },
  leadName: string
): Task {
  const due = row.due_date ? String(row.due_date).slice(0, 10) : null;
  const st = row.status ?? 'Pendente';
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    date: due,
    time: null,
    status: st,
    normalized_status: clientLeadStatusToNormalized(st),
    priority: 'medium',
    user_id: undefined,
    assignee_id: null,
    assignee: null,
    assigneeAvatar: null,
    checklist: [],
    origin: 'lead',
    origin_id: row.id,
    project_id: null,
    project_name: null,
    client_id: null,
    client_name: null,
    lead_id: row.lead_id,
    lead_name: leadName,
    deal: null,
  };
}
