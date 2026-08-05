/**
 * S22 — helpers de gatilho do nó start (keyword / first_message + idle / dm_only).
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

export type StartTrigger = StartTriggerKeyword | StartTriggerFirstMessage | { type?: string };

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

export function matchStartTrigger(opts: {
  trigger: StartTrigger;
  messageBody: string;
  incomingMessageCount: number;
  hoursSincePreviousIncoming?: number | null;
}): 'keyword' | 'first_message' | null {
  const t = opts.trigger;
  const type = String(t.type || 'first_message');
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

export function isGroupExternalChatId(externalChatId: string | null | undefined): boolean {
  return String(externalChatId || '').toLowerCase().endsWith('@g.us');
}
