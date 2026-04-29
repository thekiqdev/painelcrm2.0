/**
 * Fase 8 — Motor do chatbot (lógica pura; envio fica no runner).
 * Não altera automação da Fase 6 (`chat_automation_rules`).
 */
import { DateTime } from 'luxon';

export type ChatBotRuleType = 'welcome_message' | 'out_of_hours' | 'menu' | 'keyword';

export type ChatBotRuleRow = {
  id: string;
  tenant_id: string;
  name: string;
  type: ChatBotRuleType;
  is_active: boolean;
  trigger_config: Record<string, unknown>;
  action_config: Record<string, unknown>;
  priority: number;
};

export type ChatbotEvaluationContext = {
  tenantId: string;
  tenantTimezone: string;
  conversationId: string;
  ownerUserId: string;
  channel: 'whatsapp';
  messageBody: string | null;
  incomingMessageCount: number;
  now: Date;
  conversationMetadata: Record<string, unknown>;
};

export type ChatbotAction =
  | { type: 'send_text'; text: string; ruleId: string }
  | { type: 'set_queue'; queueId: string; ruleId: string }
  | { type: 'set_team'; teamId: string; ruleId: string }
  | { type: 'assign_user'; userId: string; ruleId: string }
  | {
      type: 'merge_metadata';
      patch: Record<string, unknown>;
      ruleId: string;
    };

export type EvaluationLog =
  | { kind: 'chat_automation_triggered'; ruleId: string; ruleType: ChatBotRuleType }
  | { kind: 'chat_automation_skipped'; reason: string; ruleId?: string }
  | { kind: 'chat_automation_executed'; ruleId: string; action: string };

const DEBOUNCE_MS = 2500;

function metaNum(meta: Record<string, unknown>, key: string): number | null {
  const v = meta[key];
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

export function shouldDebounce(context: ChatbotEvaluationContext): boolean {
  const last = metaNum(context.conversationMetadata, 'bot_last_trigger_at_ms');
  if (last == null) return false;
  return context.now.getTime() - last < DEBOUNCE_MS;
}

/** Janelas opcionais em trigger_config: `{ slots: [{ dow: [1-7], start: "HH:mm", end: "HH:mm" }] }` (dow luxon: 1=seg). */
export function isWithinBusinessHours(
  now: Date,
  timezone: string,
  trigger: Record<string, unknown>
): boolean {
  const dt = DateTime.fromJSDate(now).setZone(timezone || 'America/Sao_Paulo');
  const slots = trigger.slots as Array<{ dow?: number[]; start: string; end: string }> | undefined;
  const list =
    slots && slots.length > 0
      ? slots
      : [{ dow: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }];
  const weekday = dt.weekday;
  for (const s of list) {
    const days = Array.isArray(s.dow) && s.dow.length > 0 ? s.dow : [1, 2, 3, 4, 5];
    if (!days.includes(weekday)) continue;
    const start = DateTime.fromFormat(`${dt.toFormat('yyyy-LL-dd')} ${s.start}`, 'yyyy-LL-dd HH:mm', {
      zone: timezone || 'America/Sao_Paulo',
    });
    const end = DateTime.fromFormat(`${dt.toFormat('yyyy-LL-dd')} ${s.end}`, 'yyyy-LL-dd HH:mm', {
      zone: timezone || 'America/Sao_Paulo',
    });
    if (start.isValid && end.isValid && dt >= start && dt <= end) return true;
  }
  return false;
}

function metaBool(meta: Record<string, unknown>, key: string): boolean {
  return meta[key] === true || meta[key] === 'true';
}

export function shouldTriggerRule(rule: ChatBotRuleRow, ctx: ChatbotEvaluationContext): boolean {
  if (!rule.is_active) return false;
  const trig = rule.trigger_config || {};
  const body = (ctx.messageBody ?? '').trim();

  switch (rule.type) {
    case 'welcome_message':
      return ctx.incomingMessageCount === 1;
    case 'out_of_hours': {
      if (isWithinBusinessHours(ctx.now, ctx.tenantTimezone, trig)) return false;
      const minBetweenMs =
        typeof trig.min_hours_between_ms === 'number' ? trig.min_hours_between_ms : 4 * 60 * 60 * 1000;
      const lastOoh = metaNum(ctx.conversationMetadata, 'bot_ooh_sent_at_ms');
      if (lastOoh != null && ctx.now.getTime() - lastOoh < minBetweenMs) return false;
      return body.length > 0;
    }
    case 'menu': {
      const mode = typeof trig.mode === 'string' ? trig.mode : 'keyword';
      if (mode === 'after_welcome') {
        return ctx.incomingMessageCount === 2 && metaBool(ctx.conversationMetadata, 'bot_pending_menu_followup');
      }
      const kw = typeof trig.keyword === 'string' ? trig.keyword.trim().toLowerCase() : 'menu';
      return body.toLowerCase() === kw;
    }
    case 'keyword': {
      const pattern = typeof trig.pattern === 'string' ? trig.pattern.trim() : '';
      if (!pattern) return false;
      try {
        const re = new RegExp(pattern, 'i');
        return re.test(body);
      } catch {
        return body.toLowerCase().includes(pattern.toLowerCase());
      }
    }
    default:
      return false;
  }
}

function buildActionsForRule(rule: ChatBotRuleRow, ctx: ChatbotEvaluationContext): ChatbotAction[] {
  const actions: ChatbotAction[] = [];
  const ac = rule.action_config || {};
  const trig = rule.trigger_config || {};

  const text =
    typeof ac.text === 'string'
      ? ac.text
      : typeof ac.message === 'string'
        ? ac.message
        : '';

  const appendMenu = ac.append_menu === true;
  const menuFollowup = ac.menu_on_followup === true;
  const options = Array.isArray(ac.options)
    ? (ac.options as Array<{ key?: string; label?: string; queue_id?: string; team_id?: string }>)
    : [];

  let outbound = text;

  if (appendMenu && options.length > 0) {
    const lines = options.map((o, i) => `${i + 1} - ${o.label ?? 'Opção'}`).join('\n');
    outbound = outbound ? `${outbound}\n\n${lines}` : lines;
  }

  if (
    rule.type === 'menu' &&
    trig.mode === 'after_welcome' &&
    options.length > 0 &&
    !String(outbound).trim()
  ) {
    outbound = options.map((o, i) => `${i + 1} - ${o.label ?? 'Opção'}`).join('\n');
  }

  if (outbound.trim().length > 0) {
    actions.push({ type: 'send_text', text: outbound.trim(), ruleId: rule.id });
    const expectDigitPick =
      options.length > 0 &&
      (rule.type === 'menu' || (rule.type === 'welcome_message' && appendMenu));
    if (expectDigitPick) {
      actions.push({
        type: 'merge_metadata',
        patch: {
          bot_menu_waiting: true,
          bot_menu_rule_id: rule.id,
        },
        ruleId: rule.id,
      });
    }
  }

  if (typeof ac.queue_id === 'string' && ac.queue_id.length > 0) {
    actions.push({ type: 'set_queue', queueId: ac.queue_id, ruleId: rule.id });
  }
  if (typeof ac.team_id === 'string' && ac.team_id.length > 0) {
    actions.push({ type: 'set_team', teamId: ac.team_id, ruleId: rule.id });
  }
  if (typeof ac.user_id === 'string' && ac.user_id.length > 0) {
    actions.push({ type: 'assign_user', userId: ac.user_id, ruleId: rule.id });
  }

  if (rule.type === 'welcome_message' && menuFollowup) {
    actions.push({
      type: 'merge_metadata',
      patch: { bot_pending_menu_followup: true },
      ruleId: rule.id,
    });
  }

  if (rule.type === 'out_of_hours') {
    actions.push({
      type: 'merge_metadata',
      patch: { bot_ooh_sent_at_ms: ctx.now.getTime() },
      ruleId: rule.id,
    });
  }

  if (rule.type === 'menu' && trig.mode === 'after_welcome') {
    actions.push({
      type: 'merge_metadata',
      patch: { bot_pending_menu_followup: false },
      ruleId: rule.id,
    });
  }

  return actions;
}

/** Avalia regras por prioridade ascendente; para no primeiro conjunto que dispara envio ou direcionamento significativo. */
export function evaluateChatAutomation(
  ctx: ChatbotEvaluationContext,
  rules: ChatBotRuleRow[]
): { actions: ChatbotAction[]; logs: EvaluationLog[] } {
  const logs: EvaluationLog[] = [];

  if (shouldDebounce(ctx)) {
    logs.push({ kind: 'chat_automation_skipped', reason: 'debounce' });
    return { actions: [], logs };
  }

  const sorted = [...rules].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

  for (const rule of sorted) {
    if (!shouldTriggerRule(rule, ctx)) {
      continue;
    }
    logs.push({ kind: 'chat_automation_triggered', ruleId: rule.id, ruleType: rule.type });
    const actions = buildActionsForRule(rule, ctx);
    if (actions.length === 0) {
      logs.push({ kind: 'chat_automation_skipped', ruleId: rule.id, reason: 'no_actions' });
      continue;
    }
    for (const a of actions) {
      logs.push({ kind: 'chat_automation_executed', ruleId: rule.id, action: a.type });
    }
    return { actions, logs };
  }

  logs.push({ kind: 'chat_automation_skipped', reason: 'no_rule_matched' });
  return { actions: [], logs };
}

export function executeRule(rule: ChatBotRuleRow, ctx: ChatbotEvaluationContext): ChatbotAction[] {
  if (!shouldTriggerRule(rule, ctx)) return [];
  return buildActionsForRule(rule, ctx);
}
