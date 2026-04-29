import { describe, expect, it } from 'vitest';
import {
  evaluateChatAutomation,
  shouldTriggerRule,
  shouldDebounce,
  type ChatBotRuleRow,
  type ChatbotAction,
  type ChatbotEvaluationContext,
  type EvaluationLog,
} from './chatbotEngine.js';

function baseCtx(over: Partial<ChatbotEvaluationContext>): ChatbotEvaluationContext {
  return {
    tenantId: 't1',
    tenantTimezone: 'America/Sao_Paulo',
    conversationId: 'c1',
    ownerUserId: 'u1',
    channel: 'whatsapp',
    messageBody: 'oi',
    incomingMessageCount: 1,
    now: new Date('2026-05-06T14:00:00.000Z'),
    conversationMetadata: {},
    ...over,
  };
}

describe('chatbotEngine', () => {
  it('welcome dispara na primeira mensagem', () => {
    const rule: ChatBotRuleRow = {
      id: 'r1',
      tenant_id: 't1',
      name: 'bv',
      type: 'welcome_message',
      is_active: true,
      trigger_config: {},
      action_config: { text: 'Olá!' },
      priority: 10,
    };
    expect(shouldTriggerRule(rule, baseCtx({ incomingMessageCount: 1 }))).toBe(true);
    expect(shouldTriggerRule(rule, baseCtx({ incomingMessageCount: 2 }))).toBe(false);
  });

  it('fora de horário dispara à noite (default seg–sex 9–18)', () => {
    const rule: ChatBotRuleRow = {
      id: 'r2',
      tenant_id: 't1',
      name: 'ooh',
      type: 'out_of_hours',
      is_active: true,
      trigger_config: {},
      action_config: { text: 'Volte amanhã' },
      priority: 20,
    };
    const night = new Date('2026-05-06T22:00:00.000Z');
    expect(
      shouldTriggerRule(
        rule,
        baseCtx({
          now: night,
          messageBody: 'help',
          incomingMessageCount: 5,
          conversationMetadata: {},
        }),
      ),
    ).toBe(true);
  });

  it('menu modo keyword reage à palavra', () => {
    const rule: ChatBotRuleRow = {
      id: 'r3',
      tenant_id: 't1',
      name: 'menu',
      type: 'menu',
      is_active: true,
      trigger_config: { mode: 'keyword', keyword: 'menu' },
      action_config: {
        options: [{ label: 'A', queue_id: 'q1' }],
      },
      priority: 30,
    };
    expect(
      shouldTriggerRule(
        rule,
        baseCtx({ messageBody: 'menu', incomingMessageCount: 3 }),
      ),
    ).toBe(true);
    expect(
      shouldTriggerRule(
        rule,
        baseCtx({ messageBody: 'outro', incomingMessageCount: 3 }),
      ),
    ).toBe(false);
  });

  it('evaluateChatAutomation retorna ações para welcome', () => {
    const rule: ChatBotRuleRow = {
      id: 'w1',
      tenant_id: 't1',
      name: 'bv',
      type: 'welcome_message',
      is_active: true,
      trigger_config: {},
      action_config: { text: 'Bem-vindo' },
      priority: 5,
    };
    const { actions, logs } = evaluateChatAutomation(baseCtx({ incomingMessageCount: 1 }), [rule]);
    expect(actions.some((a: ChatbotAction) => a.type === 'send_text')).toBe(true);
    expect(logs.some((l: EvaluationLog) => l.kind === 'chat_automation_triggered')).toBe(true);
    expect(logs.some((l: EvaluationLog) => l.kind === 'chat_automation_executed')).toBe(true);
  });

  it('debounce evita re-disparo imediato (sem loop)', () => {
    const rule: ChatBotRuleRow = {
      id: 'w1',
      tenant_id: 't1',
      name: 'bv',
      type: 'welcome_message',
      is_active: true,
      trigger_config: {},
      action_config: { text: 'Bem-vindo' },
      priority: 5,
    };
    const t0 = new Date('2026-05-06T12:00:00.000Z');
    const ctx1 = baseCtx({
      incomingMessageCount: 1,
      now: t0,
      conversationMetadata: {},
    });
    const { actions: a1 } = evaluateChatAutomation(ctx1, [rule]);
    expect(a1.length).toBeGreaterThan(0);

    const ctx2 = baseCtx({
      incomingMessageCount: 1,
      now: t0,
      conversationMetadata: { bot_last_trigger_at_ms: t0.getTime() },
    });
    expect(shouldDebounce(ctx2)).toBe(true);
    const { actions: a2, logs } = evaluateChatAutomation(ctx2, [rule]);
    expect(a2).toEqual([]);
    expect(
      logs.some((l: EvaluationLog) => l.kind === 'chat_automation_skipped' && l.reason === 'debounce'),
    ).toBe(true);
  });
});
