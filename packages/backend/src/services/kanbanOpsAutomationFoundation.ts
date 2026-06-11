/**
 * Pipeline de automações ops para cards acquisition_lead.
 * Sprint N4: delega Phase2 real via runKanbanPhase2AutomationsForLead.
 */
import {
  appendOperationalTimelineByCardId,
  TIMELINE_LABELS,
} from './superadminOpsLeadTimelineService.js';
import { pool } from '../utils/db.js';
import { beginKanbanTxWithRls } from '../utils/kanbanRlsTx.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';
import {
  isColumnAutomationConfigured,
  toPhase2AutomationContext,
  type KanbanAutomationContext,
} from './kanbanAutomationContext.js';
import { runKanbanPhase2Automations } from './kanbanColumnAutomationService.js';

function logOpsColumnAutomation(event: string, ctx: KanbanAutomationContext, extra?: Record<string, unknown>): void {
  const acquisitionLeadId =
    ctx.subject.kind === 'acquisition_lead' ? ctx.subject.acquisitionLeadId : null;
  console.info('[ops_kanban_column_automation]', {
    event,
    subject_kind: ctx.subject.kind,
    column_id: ctx.columnId,
    column_name: ctx.columnName,
    card_id: ctx.cardId,
    acquisition_lead_id: acquisitionLeadId,
    correlation_id: ctx.correlationId,
    tenant_id: ctx.tenantId,
    ...extra,
  });
}

async function appendTimeline(
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
    console.error('[ops_kanban_column_automation] timeline_append_failed', { cardId, type: entry.type, error: e });
  } finally {
    client.release();
  }
}

/** Executa automações de coluna para card acquisition lead (ops tenant). */
export async function executeOpsLeadColumnAutomationFoundation(
  ctx: KanbanAutomationContext,
  opts?: { boardLinkedFunnelId?: string | null },
): Promise<void> {
  if (ctx.subject.kind !== 'acquisition_lead') return;
  if (ctx.tenantId !== SUPERADMIN_OPS_KANBAN_TENANT_ID) return;

  const configured = isColumnAutomationConfigured(ctx.columnMetadata);
  logOpsColumnAutomation('column_automation_started', ctx, { automation_configured: configured });

  await appendTimeline(ctx.cardId, ctx.actorUserId, {
    type: 'column_automation_started',
    label: TIMELINE_LABELS.column_automation_started ?? 'Automação de coluna iniciada',
    correlation_id: ctx.correlationId,
    column_id: ctx.columnId,
    column_name: ctx.columnName,
    automation_configured: configured,
  });

  const phase2Ctx = toPhase2AutomationContext(ctx, opts);

  try {
    const result = await runKanbanPhase2Automations(phase2Ctx);
    logOpsColumnAutomation('column_automation_completed', ctx, {
      attempted: result.attempted,
    });
    await appendTimeline(ctx.cardId, ctx.actorUserId, {
      type: 'column_automation_completed',
      label: TIMELINE_LABELS.column_automation_completed ?? 'Automação de coluna concluída',
      correlation_id: ctx.correlationId,
      column_id: ctx.columnId,
      attempted: result.attempted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    logOpsColumnAutomation('column_automation_failed', ctx, { error: message });
    await appendTimeline(ctx.cardId, ctx.actorUserId, {
      type: 'column_automation_failed',
      label: TIMELINE_LABELS.column_automation_failed ?? 'Automação de coluna falhou',
      correlation_id: ctx.correlationId,
      column_id: ctx.columnId,
      error: message,
      foundation: true,
    });
  }
}
