/**
 * S22 — helpers de gatilho do nó start (keyword / first_message + idle / dm_only).
 * S31 — tag / kanban_column (evento CRM) + opt-out global parar/sair.
 */

export type StartTriggerKeyword = {
  type: 'keyword';
  value?: string;
  match?: 'equals' | 'contains';
  keywords?: string[];
};

export type StartTriggerFirstMessage = {
  type: 'first_message';
  idle_after_hours?: number | null;
};

/** S31 — dispara ao adicionar tag na conversa (evento CRM). */
export type StartTriggerTag = {
  type: 'tag';
  tag_id?: string | null;
  tag_label?: string | null;
};

/** S31 — dispara ao entrar na coluna (create/move card). */
export type StartTriggerKanbanColumn = {
  type: 'kanban_column';
  column_id: string;
  board_id?: string | null;
};

export type StartTrigger =
  | StartTriggerKeyword
  | StartTriggerFirstMessage
  | StartTriggerTag
  | StartTriggerKanbanColumn
  | { type?: string };

/** Palavras de opt-out global (equals, trim + lower). */
export const GLOBAL_OPT_OUT_WORDS = ['parar', 'sair'] as const;

export function parseStartTrigger(raw: unknown): StartTrigger {
  if (raw && typeof raw === 'object') return raw as StartTrigger;
  return { type: 'first_message' };
}

/** Ausente / false = compat (permite grupo). true = só 1:1. */
export function isStartDmOnly(startData: Record<string, unknown> | undefined): boolean {
  return startData?.dm_only === true;
}

/** S23: default ignore; restart_on_keyword reinicia sessão viva se keyword casar. */
export type StartSessionPolicy = 'ignore_if_session_alive' | 'restart_on_keyword';

export function getStartSessionPolicy(
  startData: Record<string, unknown> | undefined
): StartSessionPolicy {
  return startData?.session_policy === 'restart_on_keyword'
    ? 'restart_on_keyword'
    : 'ignore_if_session_alive';
}

export function resolveKeywordList(trigger: StartTriggerKeyword): string[] {
  if (Array.isArray(trigger.keywords) && trigger.keywords.length > 0) {
    return trigger.keywords
      .map((k) => String(k || '').trim().toLowerCase())
      .filter(Boolean);
  }
  return String(trigger.value || '')
    .split('|')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function matchKeywordBody(messageBody: string, trigger: StartTriggerKeyword): boolean {
  const body = messageBody.trim().toLowerCase();
  if (!body) return false;
  const list = resolveKeywordList(trigger);
  if (list.length === 0) return false;
  const mode = trigger.match === 'equals' ? 'equals' : 'contains';
  for (const kw of list) {
    if (mode === 'equals') {
      if (body === kw) return true;
    } else if (body === kw || body.includes(kw)) {
      return true;
    }
  }
  return false;
}

export function matchFirstMessageTrigger(
  trigger: StartTriggerFirstMessage,
  opts: {
    incomingMessageCount: number;
    /** Horas desde a incoming anterior (excluindo a corrente). null = não há anterior. */
    hoursSincePreviousIncoming?: number | null;
  }
): boolean {
  if (opts.incomingMessageCount <= 1) return true;
  const idle = Number(trigger.idle_after_hours);
  if (!Number.isFinite(idle) || idle <= 0) return false;
  const hours = opts.hoursSincePreviousIncoming;
  if (hours == null || !Number.isFinite(hours)) return false;
  return hours >= idle;
}

/**
 * Match de gatilho baseado em mensagem (keyword / first_message).
 * Tipos `tag` / `kanban_column` retornam null aqui (S31 — só via evento CRM).
 */
export function matchStartTrigger(opts: {
  trigger: StartTrigger;
  messageBody: string;
  incomingMessageCount: number;
  hoursSincePreviousIncoming?: number | null;
}): 'keyword' | 'first_message' | null {
  const t = opts.trigger;
  const type = String(t.type || 'first_message');
  if (type === 'tag' || type === 'kanban_column') return null;
  if (type === 'keyword') {
    return matchKeywordBody(opts.messageBody, t as StartTriggerKeyword) ? 'keyword' : null;
  }
  if (
    matchFirstMessageTrigger(t as StartTriggerFirstMessage, {
      incomingMessageCount: opts.incomingMessageCount,
      hoursSincePreviousIncoming: opts.hoursSincePreviousIncoming,
    })
  ) {
    return 'first_message';
  }
  return null;
}

export function matchTagTrigger(
  trigger: StartTriggerTag,
  opts: { tagId?: string | null; tagLabel?: string | null }
): boolean {
  const wantId = String(trigger.tag_id || '').trim();
  const wantLabel = String(trigger.tag_label || '')
    .trim()
    .toLowerCase();
  if (!wantId && !wantLabel) return false;
  const gotId = String(opts.tagId || '').trim();
  const gotLabel = String(opts.tagLabel || '')
    .trim()
    .toLowerCase();
  if (wantId && gotId && wantId === gotId) return true;
  if (wantLabel && gotLabel && wantLabel === gotLabel) return true;
  return false;
}

export function matchKanbanColumnTrigger(
  trigger: StartTriggerKanbanColumn,
  opts: { columnId: string; boardId?: string | null }
): boolean {
  const wantCol = String(trigger.column_id || '').trim();
  if (!wantCol) return false;
  if (wantCol !== String(opts.columnId || '').trim()) return false;
  const wantBoard = String(trigger.board_id || '').trim();
  if (wantBoard) {
    const gotBoard = String(opts.boardId || '').trim();
    if (!gotBoard || wantBoard !== gotBoard) return false;
  }
  return true;
}

/** S31 — equals em parar/sair (mensagem inteira). */
export function isGlobalOptOutWord(messageBody: string): boolean {
  const body = String(messageBody || '')
    .trim()
    .toLowerCase();
  if (!body) return false;
  return (GLOBAL_OPT_OUT_WORDS as readonly string[]).includes(body);
}

export function isGroupExternalChatId(externalChatId: string | null | undefined): boolean {
  return String(externalChatId || '').toLowerCase().endsWith('@g.us');
}
