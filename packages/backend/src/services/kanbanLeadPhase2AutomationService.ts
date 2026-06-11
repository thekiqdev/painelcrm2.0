/**
 * Sprint N4 — Phase2 real para cards acquisition_lead (Ops Kanban).
 * Sprint N5.1 — idempotência por correlationId + marcação condicional ao sucesso.
 */
import { createHmac } from 'crypto';
import { pool } from '../utils/db.js';
import { beginKanbanTxWithRls } from '../utils/kanbanRlsTx.js';
import { parseKanbanPhase2, type ParsedKanbanPhase2 } from '../utils/kanbanPhase2.js';
import { renderMessageTemplate, type MessageTemplateContext } from '../utils/renderMessageTemplate.js';
import { findAcquisitionLeadById } from '../acquisition/acquisitionLeadRepository.js';
import { sendMessage } from '../communication/channelProviderGateway/channelProviderGateway.js';
import { createNotification } from './notifications.js';
import { startWorkflow } from '../automation/orchestration/orchestrationService.js';
import {
  resolveWhatsappModelForTenant,
  type WhatsappModelItemRow,
} from './whatsappModelSequenceService.js';
import { buildWhatsappTemplateMediaPublicUrlFromStoragePath } from './whatsappTemplateMediaStorageService.js';
import {
  appendOperationalTimelineByCardId,
  TIMELINE_LABELS,
} from './superadminOpsLeadTimelineService.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';
import { buildOpsLeadPhase2ExecutionKey } from './kanbanAutomationContext.js';
import { buildOpsLeadGatewaySendInput } from './opsLeadGatewaySend.js';
import type { KanbanPhase2AutomationContext } from './kanbanColumnAutomationService.js';

export type LeadPhase2ActionOutcome = 'success' | 'failed' | 'skipped' | 'not_configured';

export type OpsLeadPhase2LogPayload = {
  leadId: string;
  column: string;
  action: string;
  status: 'success' | 'skipped' | 'failed';
  reason?: string;
  correlationId?: string;
  executionKey?: string;
};

function logOpsLeadPhase2(payload: OpsLeadPhase2LogPayload): void {
  console.info('[ops_lead_phase2]', payload);
}

function normalizePhoneDigits(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '');
}

function readAutomationWorkflowKey(columnMetadata: unknown): string | null {
  const meta =
    columnMetadata && typeof columnMetadata === 'object' && !Array.isArray(columnMetadata)
      ? (columnMetadata as Record<string, unknown>)
      : null;
  const ac = meta?.automation_config;
  if (!ac || typeof ac !== 'object' || Array.isArray(ac)) return null;
  const key = (ac as { workflow_key?: unknown }).workflow_key;
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

function hasAnyLeadPhase2Action(parsed: ParsedKanbanPhase2, columnMetadata: unknown): boolean {
  if (parsed.notifications.notify_operator) return true;
  if (parsed.notifications.notify_team) return true;
  if (parsed.notifications.auto_message_enabled) return true;
  if (parsed.webhook.enabled) return true;
  if (readAutomationWorkflowKey(columnMetadata)) return true;
  const meta =
    columnMetadata && typeof columnMetadata === 'object' && !Array.isArray(columnMetadata)
      ? (columnMetadata as Record<string, unknown>)
      : null;
  const ac = meta?.automation_config;
  if (ac && typeof ac === 'object' && !Array.isArray(ac) && (ac as { enabled?: boolean }).enabled === true) {
    return true;
  }
  return false;
}

function readExecutionRecord(
  metadata: unknown,
  executionKey: string,
): { executed_at?: string; status?: string } | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const executions = (metadata as Record<string, unknown>).ops_lead_phase2_executions;
  if (!executions || typeof executions !== 'object' || Array.isArray(executions)) return null;
  const record = (executions as Record<string, unknown>)[executionKey];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  return record as { executed_at?: string; status?: string };
}

/** Verifica se esta execução (lead+coluna+correlationId) já foi concluída com sucesso. */
export async function isOpsLeadPhase2AlreadyExecuted(
  cardId: string,
  executionKey: string,
): Promise<boolean> {
  const card = await pool.query<{ metadata: unknown }>(
    `SELECT metadata FROM chat_kanban_cards WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [cardId, SUPERADMIN_OPS_KANBAN_TENANT_ID],
  );
  const record = readExecutionRecord(card.rows[0]?.metadata, executionKey);
  return record?.status === 'success';
}

export async function markOpsLeadPhase2Executed(
  cardId: string,
  executionKey: string,
  actorUserId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await beginKanbanTxWithRls(client, SUPERADMIN_OPS_KANBAN_TENANT_ID, actorUserId);
    await client.query(
      `UPDATE chat_kanban_cards
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{ops_lead_phase2_executions}',
         COALESCE(metadata->'ops_lead_phase2_executions', '{}'::jsonb)
           || jsonb_build_object(
             $1::text,
             jsonb_build_object('executed_at', to_jsonb(now()), 'status', 'success')
           ),
         true
       ),
       updated_at = now()
       WHERE id = $2 AND tenant_id = $3`,
      [executionKey, cardId, SUPERADMIN_OPS_KANBAN_TENANT_ID],
    );
    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

function shouldMarkPhase2Execution(
  parsed: ParsedKanbanPhase2,
  outcomes: {
    notifyOperator: LeadPhase2ActionOutcome;
    notifyTeam: LeadPhase2ActionOutcome;
    message: LeadPhase2ActionOutcome;
  },
): boolean {
  if (parsed.notifications.auto_message_enabled && outcomes.message !== 'success') {
    return false;
  }
  if (parsed.notifications.notify_operator && outcomes.notifyOperator !== 'success') {
    return false;
  }
  if (parsed.notifications.notify_team && outcomes.notifyTeam !== 'success') {
    return false;
  }
  return true;
}

async function appendLeadTimeline(
  cardId: string,
  actorUserId: string,
  entry: { type: string; label?: string; correlation_id?: string; [key: string]: unknown },
): Promise<void> {
  const client = await pool.connect();
  try {
    await beginKanbanTxWithRls(client, SUPERADMIN_OPS_KANBAN_TENANT_ID, actorUserId);
    await appendOperationalTimelineByCardId(client, cardId, entry);
    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('[ops_lead_phase2] timeline_append_failed', { cardId, type: entry.type, error: e });
  } finally {
    client.release();
  }
}

function buildLeadTemplateContext(
  ctx: KanbanPhase2AutomationContext,
  lead: { name: string | null; email: string; phone: string | null },
): MessageTemplateContext {
  const contact = (lead.name ?? lead.email ?? '').trim();
  return {
    contact_name: contact,
    column_name: (ctx.columnName ?? '').trim(),
    board_name: (ctx.boardName ?? '').trim(),
    company_name: contact,
  };
}

async function runLeadAutoMessageText(
  ctx: KanbanPhase2AutomationContext,
  parsed: ParsedKanbanPhase2,
  lead: { id: string; name: string | null; email: string; phone: string | null; tenant_id: string | null },
  messageIdempotencyKey: string,
): Promise<LeadPhase2ActionOutcome> {
  const action = 'auto_message_text';
  if (!parsed.notifications.auto_message_enabled || parsed.notifications.auto_message_mode === 'whatsapp_model') {
    return 'not_configured';
  }
  const raw = parsed.notifications.auto_message_text?.trim();
  if (!raw) {
    logOpsLeadPhase2({ leadId: lead.id, column: ctx.columnName, action, status: 'skipped', reason: 'not_configured' });
    return 'skipped';
  }

  const phone = normalizePhoneDigits(lead.phone);
  if (phone.length < 10) {
    logOpsLeadPhase2({ leadId: lead.id, column: ctx.columnName, action, status: 'skipped', reason: 'no_phone' });
    await appendLeadTimeline(ctx.cardId, ctx.actorUserId, {
      type: 'message_skipped',
      label: TIMELINE_LABELS.message_skipped ?? 'Mensagem não enviada',
      correlation_id: ctx.correlationId,
      column_id: ctx.columnId,
      reason: 'no_phone',
      action,
    });
    return 'skipped';
  }

  const rendered = renderMessageTemplate(raw, buildLeadTemplateContext(ctx, lead)).trim();
  if (!rendered) {
    logOpsLeadPhase2({ leadId: lead.id, column: ctx.columnName, action, status: 'skipped', reason: 'empty_after_render' });
    return 'skipped';
  }

  try {
    const sendInput = await buildOpsLeadGatewaySendInput(
      {
        channel: 'whatsapp',
        messageIntent: 'transactional',
        recipient: phone,
        correlationId: ctx.correlationId ?? messageIdempotencyKey,
        idempotencyKey: messageIdempotencyKey,
        body: rendered,
        metadata: {
          card_id: ctx.cardId,
          column_id: ctx.columnId,
          board_id: ctx.boardId,
          source: 'ops_lead_phase2',
          action,
        },
      },
      {
        opsTenantId: ctx.tenantId,
        acquisitionLeadId: lead.id,
        targetTenantId: lead.tenant_id,
      },
    );
    const result = await sendMessage(sendInput);
    if (result.outcome === 'sent') {
      logOpsLeadPhase2({ leadId: lead.id, column: ctx.columnName, action, status: 'success', reason: result.outcome });
      await appendLeadTimeline(ctx.cardId, ctx.actorUserId, {
        type: 'message_sent',
        label: 'Mensagem enviada',
        correlation_id: ctx.correlationId,
        column_id: ctx.columnId,
        action,
        outcome: result.outcome,
      });
      return 'success';
    }
    const reason = result.outcome === 'skipped' ? 'gateway_v1_off' : result.outcome;
    logOpsLeadPhase2({
      leadId: lead.id,
      column: ctx.columnName,
      action,
      status: result.outcome === 'skipped' ? 'skipped' : 'failed',
      reason,
    });
    await appendLeadTimeline(ctx.cardId, ctx.actorUserId, {
      type: 'message_skipped',
      label: 'Falha ao enviar mensagem',
      correlation_id: ctx.correlationId,
      column_id: ctx.columnId,
      action,
      outcome: result.outcome,
    });
    return result.outcome === 'skipped' ? 'skipped' : 'failed';
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'send_failed';
    logOpsLeadPhase2({ leadId: lead.id, column: ctx.columnName, action, status: 'failed', reason: msg });
    return 'failed';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runLeadWhatsappModelSequence(
  ctx: KanbanPhase2AutomationContext,
  parsed: ParsedKanbanPhase2,
  lead: { id: string; name: string | null; email: string; phone: string | null; tenant_id: string | null },
  executionKey: string,
): Promise<LeadPhase2ActionOutcome> {
  const action = 'whatsapp_model_sequence';
  if (!parsed.notifications.auto_message_enabled || parsed.notifications.auto_message_mode !== 'whatsapp_model') {
    return 'not_configured';
  }
  const templateId = parsed.notifications.auto_message_whatsapp_template_id;
  if (!templateId) {
    logOpsLeadPhase2({ leadId: lead.id, column: ctx.columnName, action, status: 'skipped', reason: 'no_template' });
    return 'skipped';
  }

  const phone = normalizePhoneDigits(lead.phone);
  if (phone.length < 10) {
    logOpsLeadPhase2({ leadId: lead.id, column: ctx.columnName, action, status: 'skipped', reason: 'no_phone' });
    await appendLeadTimeline(ctx.cardId, ctx.actorUserId, {
      type: 'message_skipped',
      correlation_id: ctx.correlationId,
      column_id: ctx.columnId,
      reason: 'no_phone',
      action,
    });
    return 'skipped';
  }

  const resolved = await resolveWhatsappModelForTenant(ctx.tenantId, templateId);
  if (!resolved || resolved.items.length === 0) {
    logOpsLeadPhase2({
      leadId: lead.id,
      column: ctx.columnName,
      action,
      status: 'skipped',
      reason: 'template_not_found_or_inactive',
    });
    return 'skipped';
  }

  const tmplCtx = buildLeadTemplateContext(ctx, lead);
  for (let i = 0; i < resolved.items.length; i++) {
    const it = resolved.items[i] as WhatsappModelItemRow;
    const delayMs = Math.min(Math.max(0, Number(it.delay_seconds) || 0) * 1000, 3600 * 1000);
    if (delayMs > 0) await sleep(delayMs);

    let body = '';
    if (it.message_type === 'text') {
      body = renderMessageTemplate((it.content ?? '').trim(), tmplCtx).trim();
      if (!body) continue;
    } else {
      const url =
        (it.media_url ?? '').trim() ||
        (it.storage_path ? buildWhatsappTemplateMediaPublicUrlFromStoragePath(it.storage_path) : '');
      if (!url) {
        logOpsLeadPhase2({
          leadId: lead.id,
          column: ctx.columnName,
          action,
          status: 'failed',
          reason: 'empty_media_url',
        });
        return 'failed';
      }
      body = renderMessageTemplate((it.caption ?? '').trim(), tmplCtx).trim() || url;
    }

    const itemKey = `${executionKey}:item:${i}`;
    const sendInput = await buildOpsLeadGatewaySendInput(
      {
        channel: 'whatsapp',
        messageIntent: 'transactional',
        recipient: phone,
        correlationId: ctx.correlationId ?? itemKey,
        idempotencyKey: itemKey,
        body,
        metadata: {
          template_id: templateId,
          item_index: i,
          source: 'ops_lead_phase2',
          action,
        },
      },
      {
        opsTenantId: ctx.tenantId,
        acquisitionLeadId: lead.id,
        targetTenantId: lead.tenant_id,
      },
    );
    const result = await sendMessage(sendInput);
    if (result.outcome !== 'sent') {
      const reason = result.outcome === 'skipped' ? 'gateway_v1_off' : result.error ?? 'send_failed';
      logOpsLeadPhase2({
        leadId: lead.id,
        column: ctx.columnName,
        action,
        status: result.outcome === 'skipped' ? 'skipped' : 'failed',
        reason,
      });
      return result.outcome === 'skipped' ? 'skipped' : 'failed';
    }
  }

  logOpsLeadPhase2({ leadId: lead.id, column: ctx.columnName, action, status: 'success' });
  await appendLeadTimeline(ctx.cardId, ctx.actorUserId, {
    type: 'message_sent',
    label: 'Sequência WhatsApp enviada',
    correlation_id: ctx.correlationId,
    column_id: ctx.columnId,
    action,
    template_id: templateId,
  });
  return 'success';
}

async function runLeadNotifyOperator(
  ctx: KanbanPhase2AutomationContext,
  parsed: ParsedKanbanPhase2,
  lead: { id: string; name: string | null; email: string },
): Promise<LeadPhase2ActionOutcome> {
  const action = 'notify_operator';
  if (!parsed.notifications.notify_operator) return 'not_configured';

  try {
    await createNotification({
      userId: ctx.actorUserId,
      type: 'kanban_automation',
      title: `Ops Kanban: ${ctx.columnName}`,
      message: `Lead ${lead.name ?? lead.email} entrou na coluna ${ctx.columnName}.`,
      data: {
        source: 'ops_lead_phase2',
        automation: action,
        board_id: ctx.boardId,
        column_id: ctx.columnId,
        card_id: ctx.cardId,
        acquisition_lead_id: lead.id,
      },
    });
    logOpsLeadPhase2({ leadId: lead.id, column: ctx.columnName, action, status: 'success' });
    await appendLeadTimeline(ctx.cardId, ctx.actorUserId, {
      type: 'notify_operator',
      correlation_id: ctx.correlationId,
      column_id: ctx.columnId,
      action,
    });
    return 'success';
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'notify_failed';
    logOpsLeadPhase2({ leadId: lead.id, column: ctx.columnName, action, status: 'failed', reason: msg });
    return 'failed';
  }
}

async function runLeadNotifyTeam(
  ctx: KanbanPhase2AutomationContext,
  parsed: ParsedKanbanPhase2,
  lead: { id: string; name: string | null; email: string },
): Promise<LeadPhase2ActionOutcome> {
  const action = 'notify_team';
  if (!parsed.notifications.notify_team) return 'not_configured';
  if (!ctx.assignedTeamId) {
    logOpsLeadPhase2({
      leadId: lead.id,
      column: ctx.columnName,
      action,
      status: 'skipped',
      reason: 'no_target_team',
    });
    return 'skipped';
  }
  logOpsLeadPhase2({
    leadId: lead.id,
    column: ctx.columnName,
    action,
    status: 'skipped',
    reason: 'ops_lead_no_team_context',
  });
  return 'skipped';
}

async function runLeadWebhook(
  ctx: KanbanPhase2AutomationContext,
  parsed: ParsedKanbanPhase2,
  lead: { id: string; name: string | null; email: string; phone: string | null; tenant_id: string | null },
  executionKey: string,
): Promise<void> {
  const action = 'webhook';
  const webhook = parsed.webhook;
  if (!webhook.enabled) return;
  if (!webhook.url?.trim()) {
    logOpsLeadPhase2({ leadId: lead.id, column: ctx.columnName, action, status: 'skipped', reason: 'missing_url' });
    return;
  }
  if (!webhook.non_blocking) {
    logOpsLeadPhase2({
      leadId: lead.id,
      column: ctx.columnName,
      action,
      status: 'skipped',
      reason: 'non_blocking_required',
    });
    return;
  }

  const payload = {
    source: 'kanban_column',
    event: 'card_entered_column',
    subject_kind: 'acquisition_lead',
    tenant_id: ctx.tenantId,
    board_id: ctx.boardId,
    column_id: ctx.columnId,
    card_id: ctx.cardId,
    acquisition_lead_id: lead.id,
    actor_user_id: ctx.actorUserId,
    correlation_id: ctx.correlationId ?? null,
    timestamp: new Date().toISOString(),
    lead: {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      tenant_id: lead.tenant_id,
    },
    column: { id: ctx.columnId, name: ctx.columnName },
    board: { id: ctx.boardId, name: ctx.boardName },
  };
  const payloadText = JSON.stringify(payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (webhook.include_headers) {
    headers['X-Kanban-Event'] = 'card_entered_column';
    headers['X-Kanban-Subject'] = 'acquisition_lead';
    headers['X-Kanban-Board-Id'] = ctx.boardId;
    headers['X-Kanban-Column-Id'] = ctx.columnId;
  }
  if (webhook.signing_secret) {
    const signature = createHmac('sha256', webhook.signing_secret).update(payloadText).digest('hex');
    headers['X-Kanban-Signature'] = `sha256=${signature}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), webhook.timeout_ms);
  try {
    const response = await fetch(webhook.url, {
      method: webhook.method,
      headers,
      body: payloadText,
      signal: controller.signal,
    });
    const status = response.status >= 200 && response.status < 300 ? 'success' : 'failed';
    logOpsLeadPhase2({
      leadId: lead.id,
      column: ctx.columnName,
      action,
      status: status === 'success' ? 'success' : 'failed',
      reason: status === 'success' ? undefined : `http_${response.status}`,
    });
    await appendLeadTimeline(ctx.cardId, ctx.actorUserId, {
      type: 'webhook_outbound',
      correlation_id: ctx.correlationId ?? executionKey,
      column_id: ctx.columnId,
      action,
      http_status: response.status,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'webhook_failed';
    logOpsLeadPhase2({ leadId: lead.id, column: ctx.columnName, action, status: 'failed', reason: msg });
  } finally {
    clearTimeout(timeout);
  }
}

async function runLeadWorkflow(
  ctx: KanbanPhase2AutomationContext,
  columnMetadata: unknown,
  lead: { id: string; tenant_id: string | null },
  executionKey: string,
): Promise<void> {
  const action = 'workflow';
  const workflowKey = readAutomationWorkflowKey(columnMetadata);
  if (!workflowKey) return;

  try {
    const result = await startWorkflow({
      workflowKey,
      correlationId: ctx.correlationId ?? executionKey,
      tenantId: lead.tenant_id,
      payload: {
        acquisition_lead_id: lead.id,
        card_id: ctx.cardId,
        column_id: ctx.columnId,
        board_id: ctx.boardId,
        trigger: 'ops_kanban_column_enter',
      },
      triggerEventKey: `ops.kanban.column_enter.${workflowKey}`,
      idempotencyKey: `${executionKey}:workflow`,
    });
    logOpsLeadPhase2({
      leadId: lead.id,
      column: ctx.columnName,
      action,
      status: result.outcome === 'failed' ? 'failed' : 'success',
      reason: result.reason,
    });
    await appendLeadTimeline(ctx.cardId, ctx.actorUserId, {
      type: 'workflow_started',
      label: TIMELINE_LABELS.workflow_started ?? 'Workflow iniciado',
      correlation_id: ctx.correlationId,
      column_id: ctx.columnId,
      workflow_key: workflowKey,
      outcome: result.outcome,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'workflow_failed';
    logOpsLeadPhase2({ leadId: lead.id, column: ctx.columnName, action, status: 'failed', reason: msg });
  }
}

/**
 * Executa automações Phase2 reais para subject acquisition_lead.
 */
export async function runKanbanPhase2AutomationsForLead(
  ctx: KanbanPhase2AutomationContext,
): Promise<{ attempted: boolean; foundation?: boolean }> {
  const leadId = ctx.acquisitionLeadId ?? ctx.conversationLeadId;
  if (!leadId) {
    logOpsLeadPhase2({
      leadId: 'unknown',
      column: ctx.columnName,
      action: 'run',
      status: 'skipped',
      reason: 'no_lead_id',
    });
    return { attempted: false };
  }

  const correlationId = ctx.correlationId?.trim() || `ops-phase2:${leadId}:${Date.now()}`;
  const executionKey = buildOpsLeadPhase2ExecutionKey(leadId, ctx.columnId, correlationId);

  if (await isOpsLeadPhase2AlreadyExecuted(ctx.cardId, executionKey)) {
    logOpsLeadPhase2({
      leadId,
      column: ctx.columnName,
      action: 'skip_same_event',
      status: 'skipped',
      correlationId,
      executionKey,
    });
    return { attempted: false };
  }

  const lead = await findAcquisitionLeadById(leadId);
  if (!lead) {
    logOpsLeadPhase2({
      leadId,
      column: ctx.columnName,
      action: 'run',
      status: 'skipped',
      reason: 'lead_not_found',
    });
    return { attempted: false };
  }

  const parsed = parseKanbanPhase2(ctx.columnMetadata);
  if (parsed.version !== 1 || !hasAnyLeadPhase2Action(parsed, ctx.columnMetadata)) {
    return { attempted: false };
  }

  const notifyOperatorOutcome = await runLeadNotifyOperator(ctx, parsed, lead);
  const notifyTeamOutcome = await runLeadNotifyTeam(ctx, parsed, lead);

  let messageOutcome: LeadPhase2ActionOutcome = 'not_configured';
  if (parsed.notifications.auto_message_enabled) {
    if (parsed.notifications.auto_message_mode === 'whatsapp_model') {
      messageOutcome = await runLeadWhatsappModelSequence(ctx, parsed, lead, executionKey);
    } else {
      messageOutcome = await runLeadAutoMessageText(ctx, parsed, lead, executionKey);
    }
  }

  await runLeadWebhook(ctx, parsed, lead, executionKey);
  await runLeadWorkflow(ctx, ctx.columnMetadata, lead, executionKey);

  const outcomes = {
    notifyOperator: notifyOperatorOutcome,
    notifyTeam: notifyTeamOutcome,
    message: messageOutcome,
  };

  if (!shouldMarkPhase2Execution(parsed, outcomes)) {
    return { attempted: true };
  }

  await markOpsLeadPhase2Executed(ctx.cardId, executionKey, ctx.actorUserId);

  logOpsLeadPhase2({
    leadId,
    column: ctx.columnName,
    action: 'executed',
    status: 'success',
    correlationId,
    executionKey,
  });

  return { attempted: true };
}
