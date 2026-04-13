/** Espelha `metadata` da coluna Kanban: `kanban_column_ui` + `kanban_column_rules`. */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRIORITIES = new Set(['low', 'medium', 'high']);

export type KanbanColumnUi = {
  hidden: boolean;
};

export const EMPTY_KANBAN_COLUMN_UI: KanbanColumnUi = {
  hidden: false,
};

export type KanbanColumnRules = {
  is_terminal: boolean;
  close_conversation: boolean;
  clear_assignee: boolean;
  send_to_queue: boolean;
  require_move_reason: boolean;
  require_confirmation: boolean;
  assign_team_id: string | null;
  assign_user_id: string | null;
  add_tag_label: string;
  remove_tag_label: string;
  conversation_priority: 'low' | 'medium' | 'high' | '' | null;
};

export const EMPTY_KANBAN_RULES: KanbanColumnRules = {
  is_terminal: false,
  close_conversation: false,
  clear_assignee: false,
  send_to_queue: false,
  require_move_reason: false,
  require_confirmation: false,
  assign_team_id: null,
  assign_user_id: null,
  add_tag_label: '',
  remove_tag_label: '',
  conversation_priority: '',
};

export function parseKanbanColumnUi(metadata: unknown): KanbanColumnUi {
  if (!metadata || typeof metadata !== 'object') return { ...EMPTY_KANBAN_COLUMN_UI };
  const root = metadata as Record<string, unknown>;
  const raw = root.kanban_column_ui;
  if (!raw || typeof raw !== 'object') return { ...EMPTY_KANBAN_COLUMN_UI };
  const u = raw as Record<string, unknown>;
  return {
    hidden: u.hidden === true,
  };
}

export function parseKanbanColumnRules(metadata: unknown): KanbanColumnRules {
  if (!metadata || typeof metadata !== 'object') return { ...EMPTY_KANBAN_RULES };
  const root = metadata as Record<string, unknown>;
  const raw = root.kanban_column_rules;
  if (!raw || typeof raw !== 'object') return { ...EMPTY_KANBAN_RULES };
  const r = raw as Record<string, unknown>;
  let assignTeam: string | null = null;
  if (typeof r.assign_team_id === 'string' && UUID_RE.test(r.assign_team_id)) {
    assignTeam = r.assign_team_id;
  }
  let assignUser: string | null = null;
  if (typeof r.assign_user_id === 'string' && UUID_RE.test(r.assign_user_id)) {
    assignUser = r.assign_user_id;
  }
  let prio: KanbanColumnRules['conversation_priority'] = '';
  if (typeof r.conversation_priority === 'string' && PRIORITIES.has(r.conversation_priority)) {
    prio = r.conversation_priority as 'low' | 'medium' | 'high';
  }
  const closeConversation = r.close_conversation === true;
  const clearAssignee = r.clear_assignee === true;
  const sendQueue = r.send_to_queue === true;
  const blocksAssignTargets = closeConversation || clearAssignee || sendQueue;

  return {
    is_terminal: r.is_terminal === true,
    close_conversation: closeConversation,
    clear_assignee: clearAssignee,
    send_to_queue: sendQueue,
    require_move_reason: r.require_move_reason === true,
    require_confirmation: r.require_confirmation === true,
    assign_team_id: blocksAssignTargets ? null : assignTeam,
    assign_user_id: blocksAssignTargets ? null : assignUser,
    add_tag_label: typeof r.add_tag_label === 'string' ? r.add_tag_label : '',
    remove_tag_label: typeof r.remove_tag_label === 'string' ? r.remove_tag_label : '',
    conversation_priority: prio,
  };
}

/** Efeitos que alteram atendimento (exclui só is_terminal, require_move_reason e require_confirmation). */
export function hasKanbanAttendanceRules(rules: KanbanColumnRules): boolean {
  return (
    rules.close_conversation ||
    rules.clear_assignee ||
    rules.send_to_queue ||
    !!rules.assign_team_id ||
    !!rules.assign_user_id
  );
}

export function hasKanbanOrganizationRules(rules: KanbanColumnRules): boolean {
  const p = rules.conversation_priority;
  const hasPrio = p === 'low' || p === 'medium' || p === 'high';
  return !!(rules.add_tag_label?.trim() || rules.remove_tag_label?.trim() || hasPrio);
}

export function hasKanbanColumnAutomationIndicators(rules: KanbanColumnRules): boolean {
  return (
    rules.is_terminal ||
    hasKanbanAttendanceRules(rules) ||
    hasKanbanOrganizationRules(rules) ||
    rules.require_move_reason ||
    rules.require_confirmation
  );
}

function serializeRulesForBackend(rules: KanbanColumnRules): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (rules.is_terminal) out.is_terminal = true;
  if (rules.close_conversation) out.close_conversation = true;
  if (rules.clear_assignee) out.clear_assignee = true;
  if (rules.send_to_queue) out.send_to_queue = true;
  if (rules.require_move_reason) out.require_move_reason = true;
  if (rules.require_confirmation) out.require_confirmation = true;
  const blocksAssignTargets =
    rules.close_conversation || rules.clear_assignee || rules.send_to_queue;
  if (!blocksAssignTargets && rules.assign_team_id) out.assign_team_id = rules.assign_team_id;
  if (!blocksAssignTargets && rules.assign_user_id) out.assign_user_id = rules.assign_user_id;
  const add = rules.add_tag_label.trim().slice(0, 64);
  if (add) out.add_tag_label = add;
  const rem = rules.remove_tag_label.trim().slice(0, 64);
  if (rem) out.remove_tag_label = rem;
  if (rules.conversation_priority === 'low' || rules.conversation_priority === 'medium' || rules.conversation_priority === 'high') {
    out.conversation_priority = rules.conversation_priority;
  }
  return out;
}

/** Funde UI + regras no objeto `metadata` completo da coluna (preserva outras chaves). */
export function mergeColumnMetadataFull(
  existing: Record<string, unknown> | undefined,
  ui: KanbanColumnUi,
  rules: KanbanColumnRules,
): Record<string, unknown> {
  const next = { ...(existing && typeof existing === 'object' ? existing : {}) } as Record<string, unknown>;
  if (ui.hidden) {
    next.kanban_column_ui = { hidden: true };
  } else {
    delete next.kanban_column_ui;
  }
  const ser = serializeRulesForBackend(rules);
  if (Object.keys(ser).length === 0) {
    delete next.kanban_column_rules;
  } else {
    next.kanban_column_rules = ser;
  }
  return next;
}

/** @deprecated use mergeColumnMetadataFull — mantido para chamadas antigas */
export function mergeColumnMetadataWithRules(
  existing: Record<string, unknown> | undefined,
  rules: KanbanColumnRules,
): Record<string, unknown> {
  return mergeColumnMetadataFull(existing, EMPTY_KANBAN_COLUMN_UI, rules);
}
