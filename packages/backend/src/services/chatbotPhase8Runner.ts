/**
 * Fase 8 — execução do chatbot após mensagem recebida (usa envio Kanban existente).
 */
import { pool } from '../utils/db.js';
import { hasChatBotRulesTable } from '../utils/chatAttendanceSchema.js';
import { isChatAutomationEnabled } from '../config/chatbotAutomationEnv.js';
import {
  evaluateChatAutomation,
  type ChatbotAction,
  type ChatBotRuleRow,
  type ChatbotEvaluationContext,
} from './chatbotEngine.js';
import { listChatBotRulesForTenant, getChatBotRuleById } from './chatBotRulesService.js';
import { insertChatAutomationLog } from './chatAutomationLogService.js';
import { conversationRowForClientApi } from '../utils/uazapiIdentityResolve.js';
import { emitConversationAttendanceUpdated } from './websocketService.js';

function metaBool(meta: Record<string, unknown>, key: string): boolean {
  return meta[key] === true || meta[key] === 'true';
}

async function emitAttendanceFresh(tenantId: string, ownerUserId: string, conversationId: string): Promise<void> {
  try {
    const fresh = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1`, [conversationId]);
    const row = fresh.rows[0];
    if (!row) return;
    const convPayload = conversationRowForClientApi(row as Record<string, unknown>);
    emitConversationAttendanceUpdated(tenantId, ownerUserId, convPayload);
  } catch {
    /* não bloquear */
  }
}

async function tryHandleMenuDigitPick(params: {
  tenantId: string;
  conversationId: string;
  ruleId: string;
  digit: number;
  ownerUserId: string;
  body: string;
}): Promise<boolean> {
  const rule = await getChatBotRuleById(params.tenantId, params.ruleId);
  if (!rule) return false;
  const ac = rule.action_config || {};
  const options = Array.isArray(ac.options)
    ? (ac.options as Array<{ label?: string; queue_id?: string; team_id?: string }>)
    : [];
  const digit = params.digit;
  if (digit < 1 || digit > options.length) return false;

  const opt = options[digit - 1]!;
  const patches: ChatbotAction[] = [];
  if (typeof opt.queue_id === 'string') {
    patches.push({ type: 'set_queue', queueId: opt.queue_id, ruleId: rule.id });
  }
  if (typeof opt.team_id === 'string') {
    patches.push({ type: 'set_team', teamId: opt.team_id, ruleId: rule.id });
  }
  patches.push({
    type: 'merge_metadata',
    patch: {
      bot_menu_waiting: false,
      bot_menu_rule_id: null,
      bot_last_trigger_at_ms: Date.now(),
    },
    ruleId: rule.id,
  });

  await applyChatbotActions({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    ownerUserId: params.ownerUserId,
    actions: patches,
  });

  await insertChatAutomationLog({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    ruleId: rule.id,
    eventType: 'chat_automation_executed',
    actionType: 'menu_pick',
    result: 'ok',
    metadata: { digit: params.digit, body: params.body },
  });

  console.log(
    JSON.stringify({
      event: 'chat_automation_executed',
      ruleId: rule.id,
      action: 'menu_pick',
      conversationId: params.conversationId,
    })
  );

  return true;
}

async function applyChatbotActions(opts: {
  tenantId: string;
  conversationId: string;
  ownerUserId: string;
  actions: ChatbotAction[];
}): Promise<void> {
  const { sendKanbanAutomationOutboundText } = await import('../controllers/chatController.js');

  for (const action of opts.actions) {
    switch (action.type) {
      case 'send_text': {
        const r = await sendKanbanAutomationOutboundText({
          conversationId: opts.conversationId,
          text: action.text,
          actorUserId: opts.ownerUserId,
          metadataSource: 'chatbot_phase8',
        });
        if (!r.ok) {
          await insertChatAutomationLog({
            tenantId: opts.tenantId,
            conversationId: opts.conversationId,
            ruleId: action.ruleId,
            eventType: 'chat_automation_skipped',
            actionType: 'send_text',
            result: 'error',
            errorMessage: r.error ?? 'send_failed',
            metadata: {},
          });
        }
        break;
      }
      case 'set_queue':
        await pool.query(`UPDATE chat_conversations SET queue_id = $1, updated_at = now() WHERE id = $2`, [
          action.queueId,
          opts.conversationId,
        ]);
        await emitAttendanceFresh(opts.tenantId, opts.ownerUserId, opts.conversationId);
        break;
      case 'set_team':
        await pool.query(
          `UPDATE chat_conversations SET assigned_team_id = $1, updated_at = now() WHERE id = $2`,
          [action.teamId, opts.conversationId]
        );
        await emitAttendanceFresh(opts.tenantId, opts.ownerUserId, opts.conversationId);
        break;
      case 'assign_user':
        await pool.query(
          `UPDATE chat_conversations SET assigned_to_user_id = $1, assigned_at = now(), updated_at = now() WHERE id = $2`,
          [action.userId, opts.conversationId]
        );
        await emitAttendanceFresh(opts.tenantId, opts.ownerUserId, opts.conversationId);
        break;
      case 'merge_metadata':
        await pool.query(
          `UPDATE chat_conversations
           SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = now()
           WHERE id = $1`,
          [opts.conversationId, JSON.stringify(action.patch)]
        );
        break;
      default:
        break;
    }
  }
}

export async function runChatbotPhase8Inbound(opts: {
  conversationId: string;
  messageBody: string | null;
  inserted: boolean;
}): Promise<void> {
  if (!opts.inserted) return;
  if (!(await hasChatBotRulesTable())) return;
  if (!isChatAutomationEnabled()) {
    console.log(
      JSON.stringify({
        event: 'chat_automation_skipped',
        reason: 'flag_disabled',
        conversationId: opts.conversationId,
      })
    );
    return;
  }

  const convRes = await pool.query(
    `SELECT c.*, u.tenant_id AS owner_tenant_id, t.timezone AS tenant_tz
     FROM chat_conversations c
     INNER JOIN users u ON u.id = c.user_id
     LEFT JOIN tenants t ON t.id = u.tenant_id
     WHERE c.id = $1`,
    [opts.conversationId]
  );
  const row = convRes.rows[0] as Record<string, unknown> | undefined;
  if (!row?.owner_tenant_id) return;

  const tenantId = String(row.owner_tenant_id);
  const ownerUserId = String(row.user_id);
  const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>;

  const bodyTrim = (opts.messageBody ?? '').trim();

  if (
    metaBool(meta, 'bot_menu_waiting') &&
    typeof meta.bot_menu_rule_id === 'string' &&
    /^\d+$/.test(bodyTrim)
  ) {
    const ok = await tryHandleMenuDigitPick({
      tenantId,
      conversationId: opts.conversationId,
      ruleId: meta.bot_menu_rule_id as string,
      digit: parseInt(bodyTrim, 10),
      ownerUserId,
      body: bodyTrim,
    });
    if (ok) return;
  }

  const rules = await listChatBotRulesForTenant(tenantId);
  if (rules.length === 0) {
    console.log(JSON.stringify({ event: 'chat_automation_skipped', reason: 'no_rules', tenantId }));
    return;
  }

  const cntRes = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM chat_messages WHERE conversation_id = $1 AND direction = 'incoming'`,
    [opts.conversationId]
  );
  const incomingCount = cntRes.rows[0]?.n ?? 0;

  const ctx: ChatbotEvaluationContext = {
    tenantId,
    tenantTimezone: (row.tenant_tz as string) || 'America/Sao_Paulo',
    conversationId: opts.conversationId,
    ownerUserId,
    channel: 'whatsapp',
    messageBody: opts.messageBody,
    incomingMessageCount: incomingCount,
    now: new Date(),
    conversationMetadata: meta,
  };

  const { actions, logs } = evaluateChatAutomation(ctx, rules);
  for (const log of logs) {
    console.log(JSON.stringify({ event: log.kind, ...log, conversationId: opts.conversationId }));
  }

  if (actions.length === 0) return;

  let hadSend = false;
  for (const a of actions) {
    if (a.type === 'send_text') hadSend = true;
  }

  await applyChatbotActions({
    tenantId,
    conversationId: opts.conversationId,
    ownerUserId,
    actions,
  });

  if (hadSend || actions.some((a) => a.type !== 'merge_metadata')) {
    await pool.query(
      `UPDATE chat_conversations
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = now()
       WHERE id = $1`,
      [opts.conversationId, JSON.stringify({ bot_last_trigger_at_ms: Date.now() })]
    );
  }

  const primaryRule = actions[0]?.ruleId;
  if (primaryRule) {
    await insertChatAutomationLog({
      tenantId,
      conversationId: opts.conversationId,
      ruleId: primaryRule,
      eventType: 'chat_automation_triggered',
      actionType: 'phase8_batch',
      result: 'ok',
      metadata: { actions: actions.map((a) => a.type) },
    });
  }
}
