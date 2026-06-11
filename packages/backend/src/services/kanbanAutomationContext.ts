/**
 * Sprint 3.1 — Subject union e resolver para automações de coluna Kanban.
 * Uma fundação compartilhada entre cards de conversa e acquisition leads (ops).
 */
import { findAcquisitionLeadById } from '../acquisition/acquisitionLeadRepository.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';
import { parseKanbanPhase2 } from '../utils/kanbanPhase2.js';
import type { KanbanPhase2AutomationContext } from './kanbanColumnAutomationService.js';

export type KanbanAutomationSubject =
  | { kind: 'conversation'; conversationId: string }
  | { kind: 'acquisition_lead'; acquisitionLeadId: string };

export type KanbanAutomationContext = {
  tenantId: string;
  actorUserId: string;
  boardId: string;
  boardName: string | null;
  columnId: string;
  columnName: string;
  cardId: string;
  subject: KanbanAutomationSubject;
  columnMetadata: unknown;
  correlationId: string;
  acquisitionLead?: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    current_stage: string;
  };
};

export type KanbanCardSubjectInput = {
  conversation_id?: unknown;
  acquisition_lead_id?: unknown;
};

/** Identifica subject a partir do card — evita ambos null ou ambos preenchidos sem regra. */
export function resolveKanbanAutomationSubject(card: KanbanCardSubjectInput): KanbanAutomationSubject | null {
  const leadId = card.acquisition_lead_id;
  const convId = card.conversation_id;
  const hasLead = leadId != null && String(leadId).trim().length > 0;
  const hasConv = convId != null && String(convId).trim().length > 0;

  if (hasLead && !hasConv) {
    return { kind: 'acquisition_lead', acquisitionLeadId: String(leadId).trim() };
  }
  if (hasConv) {
    return { kind: 'conversation', conversationId: String(convId).trim() };
  }
  return null;
}

export function isOpsAcquisitionLeadCard(tenantId: string, card: KanbanCardSubjectInput): boolean {
  return (
    tenantId === SUPERADMIN_OPS_KANBAN_TENANT_ID &&
    resolveKanbanAutomationSubject(card)?.kind === 'acquisition_lead'
  );
}

export function isColumnAutomationConfigured(columnMetadata: unknown): boolean {
  const meta =
    columnMetadata && typeof columnMetadata === 'object' && !Array.isArray(columnMetadata)
      ? (columnMetadata as Record<string, unknown>)
      : null;
  const ac = meta?.automation_config;
  if (ac && typeof ac === 'object' && !Array.isArray(ac) && (ac as { enabled?: boolean }).enabled === true) {
    return true;
  }

  const parsed = parseKanbanPhase2(columnMetadata);
  if (parsed.version !== 1) return false;

  if (parsed.notifications.notify_operator || parsed.notifications.notify_team) return true;
  if (parsed.notifications.auto_message_enabled) return true;
  if (parsed.webhook.enabled) return true;
  if (parsed.crm.enabled || parsed.crm.ensure_client_on_column_entry || parsed.crm.auto_link_or_create_lead) {
    return true;
  }
  if (parsed.productivity.enabled || parsed.productivity.auto_create_task) return true;
  if (parsed.automations.auto_move_by_time.enabled) return true;

  return false;
}

export async function resolveKanbanAutomationContext(input: {
  tenantId: string;
  actorUserId: string;
  card: KanbanCardSubjectInput & { id?: string };
  cardId: string;
  destColumn: { id: string; name: string; metadata: unknown };
  boardId: string;
  boardName?: string | null;
  boardLinkedFunnelId?: string | null;
  correlationId: string;
}): Promise<KanbanAutomationContext | null> {
  const subject = resolveKanbanAutomationSubject(input.card);
  if (!subject) return null;

  const ctx: KanbanAutomationContext = {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    boardId: input.boardId,
    boardName: input.boardName ?? null,
    columnId: String(input.destColumn.id),
    columnName: String(input.destColumn.name),
    cardId: input.cardId,
    subject,
    columnMetadata: input.destColumn.metadata,
    correlationId: input.correlationId,
  };

  if (subject.kind === 'acquisition_lead') {
    const lead = await findAcquisitionLeadById(subject.acquisitionLeadId);
    if (lead) {
      ctx.acquisitionLead = {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        current_stage: lead.current_stage,
      };
    }
  }

  return ctx;
}

/** Chave de execução Phase2 Ops — lead + coluna + correlationId (Sprint N5.1). */
export function buildOpsLeadPhase2ExecutionKey(
  leadId: string,
  columnId: string,
  correlationId: string,
): string {
  return `ops-lead-phase2:${leadId}:${columnId}:${correlationId}`;
}

/** @deprecated Use buildOpsLeadPhase2ExecutionKey — mantido para dedupe de mensagem legada. */
export function buildOpsLeadPhase2IdempotencyKey(leadId: string, columnId: string): string {
  return `ops-lead-phase2:${leadId}:${columnId}`;
}

export function toPhase2AutomationContext(
  ctx: KanbanAutomationContext,
  opts?: { boardLinkedFunnelId?: string | null },
): KanbanPhase2AutomationContext {
  const conversationId = ctx.subject.kind === 'conversation' ? ctx.subject.conversationId : '';
  const acquisitionLeadId = ctx.subject.kind === 'acquisition_lead' ? ctx.subject.acquisitionLeadId : null;

  return {
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    boardId: ctx.boardId,
    boardLinkedFunnelId: opts?.boardLinkedFunnelId ?? null,
    boardName: ctx.boardName,
    columnId: ctx.columnId,
    columnName: ctx.columnName,
    cardId: ctx.cardId,
    conversationId,
    conversationDisplayName: ctx.acquisitionLead?.name ?? null,
    conversationClientId: null,
    conversationLeadId: acquisitionLeadId,
    assignedToUserId: null,
    assignedTeamId: null,
    queueId: null,
    attendanceStatus: null,
    columnMetadata: ctx.columnMetadata,
    subjectKind: ctx.subject.kind,
    acquisitionLeadId,
    correlationId: ctx.correlationId,
  };
}
