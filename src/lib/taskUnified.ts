/**
 * Tipo unificado de tarefa para a UI (Etapa 1 do plano de card/visualização).
 * Usado em Tarefas (global) e Projetos; campos opcionais conforme a origem.
 */

export type UnifiedTaskStatus =
  | 'pending'
  | 'todo'
  | 'in-progress'
  | 'review'
  | 'completed';

export type UnifiedTaskPriority = 'low' | 'medium' | 'high';

export interface UnifiedChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface UnifiedTaskAttachment {
  id?: string;
  name?: string;
  url?: string;
  [key: string]: unknown;
}

/** Origem da tarefa: define qual API usar para atualizar/excluir. */
export type UnifiedTaskSource = 'global' | 'project';

export interface UnifiedTask {
  id: string;
  title: string;
  description: string | null;
  status: UnifiedTaskStatus;
  priority: UnifiedTaskPriority;
  /** Data de vencimento (ISO ou YYYY-MM-DD). */
  dueDate: string | null;
  /** Hora de vencimento (global task). */
  dueTime: string | null;
  startDate: string | null;
  startTime: string | null;
  endTime: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  checklist: UnifiedChecklistItem[];
  tags: string[];
  labels: string[];
  /** Contexto projeto. */
  listId: string | null;
  projectId: string | null;
  areaId: string | null;
  /** Contexto global. */
  clientId: string | null;
  clientName: string | null;
  deal: string | null;
  estimatedEffortHours: number | null;
  estimatedStoryPoints: number | null;
  attachments: UnifiedTaskAttachment[];
  taskType: string | null;
  severity: string | null;
  meetingLink: string | null;
  meetingLocation: string | null;
  billable: boolean;
  hourlyRate: number | null;
  budgetCap: number | null;
  customFields: Record<string, unknown>;
  recurrenceRule: unknown;
  createdAt: string | null;
  updatedAt: string | null;
  /** Qual API usar: tarefas globais ou tarefas de projeto. */
  source: UnifiedTaskSource;
}

const DEFAULT_PRIORITY: UnifiedTaskPriority = 'medium';
const DEFAULT_STATUS: UnifiedTaskStatus = 'todo';

function normalizeStatus(status: string | undefined): UnifiedTaskStatus {
  if (!status) return DEFAULT_STATUS;
  const s = status.toLowerCase();
  if (s === 'pending' || s === 'todo' || s === 'in-progress' || s === 'review' || s === 'completed') {
    return s as UnifiedTaskStatus;
  }
  if (s === 'in_progress') return 'in-progress';
  return DEFAULT_STATUS;
}

function normalizePriority(priority: string | undefined): UnifiedTaskPriority {
  if (!priority) return DEFAULT_PRIORITY;
  const p = priority.toLowerCase();
  if (p === 'high' || p === 'medium' || p === 'low') return p as UnifiedTaskPriority;
  return DEFAULT_PRIORITY;
}

function normalizeChecklist(items: unknown[] | undefined): UnifiedChecklistItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => ({
    id: item?.id ?? `item-${Math.random().toString(36).slice(2)}`,
    text: item?.text ?? item?.title ?? String(item ?? ''),
    completed: Boolean(item?.completed),
  }));
}

/**
 * Mapeia uma tarefa de projeto (API ProjectTask) para UnifiedTask.
 */
export function projectTaskToUnified(
  task: {
    id: string;
    list_id: string;
    project_id: string;
    area_id?: string | null;
    title: string;
    description?: string | null;
    status?: string;
    priority?: string;
    due_date?: string | null;
    assignee_id?: string | null;
    tags?: string[] | unknown;
    start_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    estimated_effort_hours?: number | null;
    estimated_story_points?: number | null;
    checklist?: unknown[] | unknown;
    attachments?: unknown[] | unknown;
    task_type?: string | null;
    severity?: string | null;
    meeting_link?: string | null;
    meeting_location?: string | null;
    billable?: boolean;
    hourly_rate?: number | null;
    budget_cap?: number | null;
    custom_fields?: Record<string, unknown> | null;
    recurrence_rule?: unknown;
    created_at?: string | null;
    updated_at?: string | null;
  },
  assignee?: { id: string; name: string; avatar?: string } | null
): UnifiedTask {
  const tags = Array.isArray(task.tags) ? task.tags : [];
  const attachments = Array.isArray(task.attachments) ? task.attachments : [];
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    status: normalizeStatus(task.status),
    priority: normalizePriority(task.priority),
    dueDate: task.due_date ?? null,
    dueTime: null,
    startDate: task.start_date ?? null,
    startTime: task.start_time ?? null,
    endTime: task.end_time ?? null,
    assigneeId: task.assignee_id ?? null,
    assigneeName: assignee?.name ?? null,
    assigneeAvatar: assignee?.avatar ?? null,
    checklist: normalizeChecklist(
      typeof task.checklist === 'object' && task.checklist !== null && Array.isArray(task.checklist)
        ? task.checklist
        : []
    ),
    tags,
    labels: [],
    listId: task.list_id,
    projectId: task.project_id,
    areaId: task.area_id ?? null,
    clientId: null,
    clientName: null,
    deal: null,
    estimatedEffortHours: task.estimated_effort_hours ?? null,
    estimatedStoryPoints: task.estimated_story_points ?? null,
    attachments: attachments as UnifiedTaskAttachment[],
    taskType: task.task_type ?? null,
    severity: task.severity ?? null,
    meetingLink: task.meeting_link ?? null,
    meetingLocation: task.meeting_location ?? null,
    billable: task.billable ?? false,
    hourlyRate: task.hourly_rate ?? null,
    budgetCap: task.budget_cap ?? null,
    customFields: task.custom_fields ?? {},
    recurrenceRule: task.recurrence_rule ?? null,
    createdAt: task.created_at ?? null,
    updatedAt: task.updated_at ?? null,
    source: 'project',
  };
}

/**
 * Mapeia uma tarefa global (API Task) para UnifiedTask.
 */
export function globalTaskToUnified(
  task: {
    id: string;
    title: string;
    description?: string | null;
    date?: string | null;
    time?: string | null;
    status?: string;
    priority?: string;
    clientId?: string | null;
    client?: string | null;
    deal?: string | null;
    assignee?: string | null;
    assigneeAvatar?: string | null;
    checklist?: { id: string; text: string; completed: boolean }[] | unknown;
    origin?: string;
    normalized_status?: string;
    assignee_id?: string | null;
    project_id?: string | null;
    project_name?: string | null;
    client_name?: string | null;
    lead_id?: string | null;
    lead_name?: string | null;
  }
): UnifiedTask {
  const done =
    task.normalized_status === 'done' ||
    String(task.status ?? '').toLowerCase() === 'completed' ||
    String(task.status ?? '').toLowerCase() === 'done';
  const status: UnifiedTaskStatus = done
    ? 'completed'
    : normalizeStatus(task.status ?? 'pending');
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    status,
    priority: normalizePriority(task.priority),
    dueDate: task.date ?? null,
    dueTime: task.time ?? null,
    startDate: null,
    startTime: null,
    endTime: null,
    assigneeId: task.assignee_id ?? null,
    assigneeName: task.assignee ?? null,
    assigneeAvatar: task.assigneeAvatar ?? null,
    checklist: normalizeChecklist(
      Array.isArray(task.checklist) ? task.checklist : []
    ),
    tags: [],
    labels: [],
    listId: null,
    projectId: task.project_id ?? null,
    areaId: null,
    clientId: task.clientId ?? null,
    clientName: task.client_name ?? task.client ?? null,
    deal: task.deal ?? null,
    estimatedEffortHours: null,
    estimatedStoryPoints: null,
    attachments: [],
    taskType: null,
    severity: null,
    meetingLink: null,
    meetingLocation: null,
    billable: false,
    hourlyRate: null,
    budgetCap: null,
    customFields: {},
    recurrenceRule: null,
    createdAt: null,
    updatedAt: null,
    source: task.origin === 'project' ? 'project' : 'global',
  };
}

/**
 * Mapeia a Task de UI (projects/types) para UnifiedTask.
 * Usado onde já se tem o objeto Task do board/lista de projetos + assignee como Member.
 */
export function projectUITaskToUnified(
  task: {
    id: string;
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    dueDate?: string;
    assignee?: { id: string; name: string; avatar?: string } | null;
    tags?: string[];
    labels?: string[];
    checklist?: { id: string; text: string; completed: boolean }[];
    customFields?: Record<string, unknown>;
  },
  context: { listId: string; projectId?: string; areaId?: string | null }
): UnifiedTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    status: normalizeStatus(task.status),
    priority: normalizePriority(task.priority),
    dueDate: task.dueDate ?? null,
    dueTime: null,
    startDate: null,
    startTime: null,
    endTime: null,
    assigneeId: task.assignee?.id ?? null,
    assigneeName: task.assignee?.name ?? null,
    assigneeAvatar: task.assignee?.avatar ?? null,
    checklist: normalizeChecklist(Array.isArray(task.checklist) ? task.checklist : []),
    tags: task.tags ?? [],
    labels: task.labels ?? [],
    listId: context.listId,
    projectId: context.projectId ?? null,
    areaId: context.areaId ?? null,
    clientId: null,
    clientName: null,
    deal: null,
    estimatedEffortHours: null,
    estimatedStoryPoints: null,
    attachments: [],
    taskType: null,
    severity: null,
    meetingLink: null,
    meetingLocation: null,
    billable: false,
    hourlyRate: null,
    budgetCap: null,
    customFields: task.customFields ?? {},
    recurrenceRule: null,
    createdAt: null,
    updatedAt: null,
    source: 'project',
  };
}
