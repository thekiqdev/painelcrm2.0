import { pool } from '../utils/db.js';
import { parseKanbanPhase2, type ParsedKanbanPhase2 } from '../utils/kanbanPhase2.js';
import { renderMessageTemplate } from '../utils/renderMessageTemplate.js';
import { buildKanbanAutomationTemplateContext } from '../utils/kanbanAutomationTemplateContext.js';
import { createNotification } from './notifications.js';
import { createHmac } from 'crypto';
import type { PoolClient } from 'pg';
import { sendKanbanAutomationOutboundText } from '../controllers/chatController.js';
import { sendWhatsappModelSequence } from './whatsappModelSequenceService.js';
import { normalizeConversationPhone } from './conversationMatchingService.js';
import { migrateTicketsLeadToClientInTransaction } from './leadConversionMigrationService.js';

type AutomationStatus = 'executed' | 'skipped' | 'failed';

export type KanbanPhase2AutomationContext = {
  tenantId: string;
  actorUserId: string;
  boardId: string;
  boardLinkedFunnelId: string | null;
  boardName: string | null;
  columnId: string;
  columnName: string;
  cardId: string;
  conversationId: string;
  conversationDisplayName: string | null;
  conversationClientId: string | null;
  conversationLeadId: string | null;
  assignedToUserId: string | null;
  assignedTeamId: string | null;
  queueId: string | null;
  attendanceStatus: string | null;
  columnMetadata: unknown;
  /** Sprint 3.1 — subject union (conversation default quando ausente). */
  subjectKind?: 'conversation' | 'acquisition_lead';
  acquisitionLeadId?: string | null;
  correlationId?: string;
};

async function insertAutomationAudit(
  ctx: KanbanPhase2AutomationContext,
  operation:
    | 'kanban_phase2_notify_operator'
    | 'kanban_phase2_notify_team'
    | 'kanban_phase2_webhook_outbound'
    | 'kanban_phase2_crm_stage_sync'
    | 'kanban_phase2_auto_message_text'
    | 'kanban_phase2_whatsapp_model_sequence',
  status: AutomationStatus,
  reason: string,
  destinationUserId: string | null = null,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO chat_conversation_assignment_history (
        conversation_id, tenant_id, from_status, to_status, from_user_id, to_user_id, queue_id, actor_user_id, operation, reason
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        ctx.conversationId,
        ctx.tenantId,
        ctx.attendanceStatus,
        ctx.attendanceStatus ?? 'unassigned',
        ctx.assignedToUserId,
        destinationUserId,
        null,
        ctx.actorUserId,
        operation,
        `${reason};audit_status=${status}`.slice(0, 2000),
      ],
    );
  } catch (e) {
    console.error('[chatKanban] phase2 audit insert failed', {
      operation,
      conversationId: ctx.conversationId,
      cardId: ctx.cardId,
      error: e,
    });
  }
}

export type KanbanCrmSyncInput = {
  tenantId: string;
  actorUserId: string;
  boardId: string;
  boardLinkedFunnelId: string | null;
  columnId: string;
  columnName: string;
  columnFunnelStageId: string | null;
  cardId: string;
  conversationId: string;
};

type CrmTarget = { kind: 'client' | 'lead'; id: string } | null;

function persistCrmAutomationAudit(
  client: PoolClient,
  input: KanbanCrmSyncInput,
  status: AutomationStatus,
  reason: string,
  target: CrmTarget,
  /** chat_conversation_assignment_history.to_status é NOT NULL; espelhamos o atendimento atual (automação não muda status). */
  snapshotAttendance: string,
): Promise<void> {
  const auditStatusLabel = status === 'executed' ? 'success' : status;
  const att = snapshotAttendance || 'unassigned';
  return client.query(
    `INSERT INTO chat_conversation_assignment_history (
      conversation_id, tenant_id, from_status, to_status, from_user_id, to_user_id, queue_id, actor_user_id, operation, reason
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      input.conversationId,
      input.tenantId,
      att,
      att,
      null,
      null,
      null,
      input.actorUserId,
      'kanban_phase2_crm_stage_sync',
      `automation_type=crm_stage_sync;status=${auditStatusLabel};board_id=${input.boardId};column_id=${input.columnId};card_id=${input.cardId};conversation_id=${input.conversationId};target=${target?.kind ?? 'none'};target_id=${target?.id ?? 'none'};stage_id=${input.columnFunnelStageId ?? 'none'};${reason}`.slice(
        0,
        2000,
      ),
    ],
  ) as unknown as Promise<void>;
}

async function resolveKanbanCrmMapping(client: PoolClient, input: KanbanCrmSyncInput): Promise<{
  boardFunnelId: string | null;
  stageId: string | null;
}> {
  return {
    boardFunnelId: input.boardLinkedFunnelId,
    stageId: input.columnFunnelStageId,
  };
}

async function validateMappedStageBelongsToBoardFunnel(
  client: PoolClient,
  input: KanbanCrmSyncInput,
  boardFunnelId: string,
  stageId: string,
): Promise<void> {
  const ok = await client.query(
    `SELECT 1
     FROM funnel_stages fs
     INNER JOIN sales_funnels sf ON sf.id = fs.funnel_id
     INNER JOIN users owner ON owner.id = sf.user_id
     WHERE fs.id = $1
       AND sf.id = $2
       AND owner.tenant_id = $3
     LIMIT 1`,
    [stageId, boardFunnelId, input.tenantId],
  );
  if (ok.rows.length === 0) {
    const err = new Error('Configuração inválida: estágio da coluna não pertence ao funil vinculado no board.');
    (err as Error & { code?: string }).code = 'BAD_REQUEST';
    throw err;
  }
}

type ConversationCrmRow = {
  client_id: string | null;
  lead_id: string | null;
  attendance_status: string;
};

async function loadConversationRowForCrmSync(
  client: PoolClient,
  conversationId: string,
): Promise<ConversationCrmRow | null> {
  const conv = await client.query<ConversationCrmRow>(
    `SELECT client_id, lead_id, attendance_status
     FROM chat_conversations
     WHERE id = $1
     LIMIT 1`,
    [conversationId],
  );
  return conv.rows[0] ?? null;
}

function crmTargetFromConversationRow(row: ConversationCrmRow): CrmTarget {
  // Regra E4: prioriza client quando ambos existem (caminho mais homogêneo no sistema atual).
  if (row.client_id) return { kind: 'client', id: row.client_id };
  if (row.lead_id) return { kind: 'lead', id: row.lead_id };
  return null;
}

async function leadHasFunnelStageColumn(client: PoolClient): Promise<boolean> {
  const col = await client.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'leads'
       AND column_name = 'funnel_stage'
     LIMIT 1`,
  );
  return col.rows.length > 0;
}

async function applyCrmStageSync(
  client: PoolClient,
  input: KanbanCrmSyncInput,
  target: Exclude<CrmTarget, null>,
  stageId: string,
): Promise<'success' | 'skipped'> {
  if (target.kind === 'client') {
    const updated = await client.query(
      `UPDATE clients c
       SET funnel_stage = $1, updated_at = now()
       WHERE c.id = $2
         AND c.user_id IN (
           SELECT id FROM users WHERE tenant_id = $3
         )
       RETURNING c.id`,
      [stageId, target.id, input.tenantId],
    );
    if (updated.rows.length === 0) {
      const err = new Error('Falha ao sincronizar CRM: cliente não encontrado na empresa.');
      (err as Error & { code?: string }).code = 'BAD_REQUEST';
      throw err;
    }
    return 'success';
  }

  const supportsLeadStage = await leadHasFunnelStageColumn(client);
  if (!supportsLeadStage) {
    return 'skipped';
  }
  const updatedLead = await client.query(
    `UPDATE leads l
     SET funnel_stage = $1, updated_at = now()
     WHERE l.id = $2
       AND l.user_id IN (
         SELECT id FROM users WHERE tenant_id = $3
       )
     RETURNING l.id`,
    [stageId, target.id, input.tenantId],
  );
  if (updatedLead.rows.length === 0) {
    const err = new Error('Falha ao sincronizar CRM: lead não encontrado na empresa.');
    (err as Error & { code?: string }).code = 'BAD_REQUEST';
    throw err;
  }
  return 'success';
}

export async function runKanbanCrmStageSyncInTransaction(
  client: PoolClient,
  input: KanbanCrmSyncInput,
): Promise<{ status: 'success' | 'failed' | 'skipped' }> {
  const convRow = await loadConversationRowForCrmSync(client, input.conversationId);
  const auditAttendance = convRow?.attendance_status?.trim() || 'unassigned';

  const mapping = await resolveKanbanCrmMapping(client, input);
  if (!mapping.boardFunnelId || !mapping.stageId) {
    await persistCrmAutomationAudit(
      client,
      input,
      'skipped',
      'reason=missing_board_or_column_mapping',
      null,
      auditAttendance,
    );
    return { status: 'skipped' };
  }

  await validateMappedStageBelongsToBoardFunnel(client, input, mapping.boardFunnelId, mapping.stageId);

  if (!convRow) {
    const err = new Error('Conversa não encontrada para sincronização CRM.');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }

  const target = crmTargetFromConversationRow(convRow);
  if (!target) {
    await persistCrmAutomationAudit(
      client,
      input,
      'skipped',
      'reason=no_client_or_lead_link',
      null,
      auditAttendance,
    );
    return { status: 'skipped' };
  }

  const applyResult = await applyCrmStageSync(client, input, target, mapping.stageId);
  if (applyResult === 'skipped') {
    await persistCrmAutomationAudit(
      client,
      input,
      'skipped',
      'reason=lead_stage_not_supported_in_schema',
      target,
      auditAttendance,
    );
    return { status: 'skipped' };
  }
  await persistCrmAutomationAudit(client, input, 'executed', 'reason=crm_stage_updated', target, auditAttendance);
  return { status: 'success' };
}

/**
 * Após ROLLBACK do movimento do card: o INSERT de auditoria na mesma transação seria desfeito.
 * Usar este helper (pool autocommit) para registrar falha de sync CRM configurado.
 */
export async function logKanbanCrmStageSyncFailureAfterRollback(
  input: KanbanCrmSyncInput,
  detail: string,
): Promise<void> {
  const safeDetail = String(detail || 'unknown').slice(0, 500);
  let auditAttendance = 'unassigned';
  try {
    const att = await pool.query<{ attendance_status: string | null }>(
      `SELECT attendance_status FROM chat_conversations WHERE id = $1 LIMIT 1`,
      [input.conversationId],
    );
    auditAttendance = att.rows[0]?.attendance_status?.trim() || 'unassigned';
  } catch {
    /* fallback já é unassigned */
  }
  try {
    await pool.query(
      `INSERT INTO chat_conversation_assignment_history (
        conversation_id, tenant_id, from_status, to_status, from_user_id, to_user_id, queue_id, actor_user_id, operation, reason
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        input.conversationId,
        input.tenantId,
        auditAttendance,
        auditAttendance,
        null,
        null,
        null,
        input.actorUserId,
        'kanban_phase2_crm_stage_sync',
        `automation_type=crm_stage_sync;status=failed;board_id=${input.boardId};column_id=${input.columnId};card_id=${input.cardId};conversation_id=${input.conversationId};stage_id=${input.columnFunnelStageId ?? 'none'};error=${safeDetail}`.slice(
          0,
          2000,
        ),
      ],
    );
  } catch (e) {
    console.error('[chatKanban] crm_stage_sync failed audit (post-rollback) insert failed', {
      conversationId: input.conversationId,
      cardId: input.cardId,
      error: e,
    });
  }
}

// --- Fase 2B: automação comercial — criar/vincular lead (dedupe conservador, idempotente por conversa+coluna) ---

const LEAD_AUTOMATION_OPERATION = 'kanban_phase2_lead_create_or_link';
const KANBAN_LEAD_SOURCE = 'kanban_column';
const UUID_RE_LEAD =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ENSURE_CLIENT_AUTOMATION_OPERATION = 'kanban_phase2_ensure_client';

export type KanbanLeadAutomationInput = {
  tenantId: string;
  actorUserId: string;
  boardId: string;
  columnId: string;
  columnName: string;
  cardId: string;
  conversationId: string;
  columnMetadata: unknown;
};

type LeadAutomationConfig = {
  enabled: boolean;
  allowCreateWhenNoDedupeMatch: boolean;
};

function resolveLeadAutomationConfig(columnMetadata: unknown): LeadAutomationConfig {
  const p = parseKanbanPhase2(columnMetadata);
  const enabled = p.crm.auto_link_or_create_lead === true;
  return {
    enabled,
    allowCreateWhenNoDedupeMatch: enabled && p.crm.allow_create_when_no_dedupe_match !== false,
  };
}

function digitsOnly(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return '';
  return value.replace(/\D/g, '');
}

function normalizeDisplayNameForDedupe(
  displayName: string | null | undefined,
  contactName: string | null | undefined,
  profileName: string | null | undefined,
): string {
  const raw = [displayName, contactName, profileName].find((s) => typeof s === 'string' && s.trim().length > 0);
  if (!raw) return '';
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function extractEmailFromConversationMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  for (const key of ['email', 'contact_email', 'contactEmail']) {
    const v = m[key];
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return t;
    }
  }
  return null;
}

type ConversationLeadCandidate = {
  phoneDigits: string;
  emailNorm: string | null;
  displayNameNorm: string;
  /** Nome legível para INSERT em leads.name */
  leadName: string;
};

function normalizeConversationLeadCandidate(row: {
  display_name: string | null;
  contact_name: string | null;
  profile_name: string | null;
  phone_number: string | null;
  canonical_phone: string | null;
  metadata: unknown;
}): ConversationLeadCandidate {
  const fromCanon = digitsOnly(row.canonical_phone);
  const fromPhone = digitsOnly(row.phone_number);
  const phoneDigits = fromCanon.length >= fromPhone.length ? fromCanon : fromPhone;
  const emailNorm = extractEmailFromConversationMetadata(row.metadata);
  const displayNameNorm = normalizeDisplayNameForDedupe(
    row.display_name,
    row.contact_name,
    row.profile_name,
  );
  const rawName =
    [row.display_name, row.contact_name, row.profile_name].find(
      (s) => typeof s === 'string' && s.trim().length > 0,
    )?.trim() ?? '';
  let leadName = rawName.slice(0, 200);
  if (!leadName && phoneDigits.length >= 8) {
    leadName = `WhatsApp +${phoneDigits}`.slice(0, 200);
  }
  if (!leadName && emailNorm) {
    leadName = emailNorm.split('@')[0]!.slice(0, 200);
  }
  if (!leadName) leadName = 'Contato Kanban';
  return { phoneDigits, emailNorm, displayNameNorm, leadName };
}

function hasMinimumSignalsForAutomation(c: ConversationLeadCandidate): boolean {
  if (c.phoneDigits.length >= 8) return true;
  if (c.emailNorm) return true;
  return false;
}

function canAttemptCreateNewLead(c: ConversationLeadCandidate): boolean {
  return hasMinimumSignalsForAutomation(c);
}

function getLeadAutomationStamp(metadata: unknown, columnId: string): { lead_id: string; mode: string } | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const root = metadata as Record<string, unknown>;
  const k = root.kanban_lead_automation;
  if (!k || typeof k !== 'object') return null;
  const v1 = (k as Record<string, unknown>).v1;
  if (!v1 || typeof v1 !== 'object') return null;
  const byCol = (v1 as Record<string, unknown>).by_column;
  if (!byCol || typeof byCol !== 'object') return null;
  const entry = (byCol as Record<string, unknown>)[columnId];
  if (!entry || typeof entry !== 'object') return null;
  const leadId = (entry as Record<string, unknown>).lead_id;
  const mode = (entry as Record<string, unknown>).mode;
  if (typeof leadId === 'string' && UUID_RE_LEAD.test(leadId)) {
    return { lead_id: leadId, mode: typeof mode === 'string' ? mode : 'unknown' };
  }
  return null;
}

function stampLeadAutomationInMetadata(
  metadata: unknown,
  columnId: string,
  leadId: string,
  mode: 'linked_existing_lead' | 'created_new_lead',
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const prevRoot =
    base.kanban_lead_automation && typeof base.kanban_lead_automation === 'object'
      ? { ...(base.kanban_lead_automation as Record<string, unknown>) }
      : {};
  const prevV1 =
    prevRoot.v1 && typeof prevRoot.v1 === 'object'
      ? { ...(prevRoot.v1 as Record<string, unknown>) }
      : {};
  const prevByCol =
    prevV1.by_column && typeof prevV1.by_column === 'object'
      ? { ...(prevV1.by_column as Record<string, unknown>) }
      : {};
  prevByCol[columnId] = {
    lead_id: leadId,
    mode,
    at: new Date().toISOString(),
  };
  prevV1.by_column = prevByCol;
  prevRoot.v1 = prevV1;
  base.kanban_lead_automation = prevRoot;
  return base;
}

function leadAutomationBadRequest(message: string): never {
  const err = new Error(message);
  (err as Error & { code?: string }).code = 'BAD_REQUEST';
  throw err;
}

async function findExistingLeadForConversationDedupe(
  client: PoolClient,
  tenantId: string,
  cand: ConversationLeadCandidate,
): Promise<string | null> {
  const { phoneDigits, emailNorm, displayNameNorm } = cand;

  if (phoneDigits.length >= 8) {
    const r = await client.query<{ id: string }>(
      `SELECT l.id
       FROM leads l
       INNER JOIN users u ON u.id = l.user_id
       WHERE u.tenant_id = $1
         AND regexp_replace(COALESCE(l.phone, ''), '\\D', '', 'g') = $2
       LIMIT 3`,
      [tenantId, phoneDigits],
    );
    if (r.rows.length > 1) {
      leadAutomationBadRequest(
        'Dedupe ambígua: vários leads com o mesmo telefone na empresa. Corrija o CRM antes de automatizar.',
      );
    }
    if (r.rows.length === 1) return r.rows[0]!.id;
  }

  if (emailNorm) {
    const r = await client.query<{ id: string }>(
      `SELECT l.id
       FROM leads l
       INNER JOIN users u ON u.id = l.user_id
       WHERE u.tenant_id = $1
         AND l.email IS NOT NULL
         AND lower(trim(l.email)) = $2
       LIMIT 3`,
      [tenantId, emailNorm],
    );
    if (r.rows.length > 1) {
      leadAutomationBadRequest(
        'Dedupe ambígua: vários leads com o mesmo e-mail na empresa. Corrija o CRM antes de automatizar.',
      );
    }
    if (r.rows.length === 1) return r.rows[0]!.id;
  }

  if (phoneDigits.length >= 8 && displayNameNorm.length >= 3) {
    const r = await client.query<{ id: string }>(
      `SELECT l.id
       FROM leads l
       INNER JOIN users u ON u.id = l.user_id
       WHERE u.tenant_id = $1
         AND regexp_replace(COALESCE(l.phone, ''), '\\D', '', 'g') = $2
         AND lower(trim(l.name)) = $3
       LIMIT 3`,
      [tenantId, phoneDigits, displayNameNorm],
    );
    if (r.rows.length > 1) {
      leadAutomationBadRequest(
        'Dedupe ambígua: vários leads com o mesmo telefone e nome na empresa. Corrija o CRM antes de automatizar.',
      );
    }
    if (r.rows.length === 1) return r.rows[0]!.id;
  }

  return null;
}

async function assertActorInTenant(client: PoolClient, actorUserId: string, tenantId: string): Promise<void> {
  const ok = await client.query(`SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [
    actorUserId,
    tenantId,
  ]);
  if (ok.rows.length === 0) {
    leadAutomationBadRequest('Usuário ator inválido para a empresa ao criar lead.');
  }
}

async function assertLeadBelongsToTenant(client: PoolClient, leadId: string, tenantId: string): Promise<void> {
  const ok = await client.query(
    `SELECT 1 FROM leads l
     INNER JOIN users u ON u.id = l.user_id
     WHERE l.id = $1 AND u.tenant_id = $2
     LIMIT 1`,
    [leadId, tenantId],
  );
  if (ok.rows.length === 0) {
    leadAutomationBadRequest('Lead encontrado no dedupe não pertence à empresa.');
  }
}

function persistLeadAutomationAudit(
  client: PoolClient,
  input: KanbanLeadAutomationInput,
  status: AutomationStatus,
  reason: string,
  snapshotAttendance: string,
  leadId: string | null,
  mode: 'linked_existing_lead' | 'created_new_lead' | 'none',
): Promise<void> {
  const auditStatusLabel = status === 'executed' ? 'success' : status;
  const att = snapshotAttendance || 'unassigned';
  return client.query(
    `INSERT INTO chat_conversation_assignment_history (
      conversation_id, tenant_id, from_status, to_status, from_user_id, to_user_id, queue_id, actor_user_id, operation, reason
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      input.conversationId,
      input.tenantId,
      att,
      att,
      null,
      null,
      null,
      input.actorUserId,
      LEAD_AUTOMATION_OPERATION,
      `automation_type=lead_create_or_link;status=${auditStatusLabel};mode=${mode};board_id=${input.boardId};column_id=${input.columnId};card_id=${input.cardId};conversation_id=${input.conversationId};lead_id=${leadId ?? 'none'};${reason}`.slice(
        0,
        2000,
      ),
    ],
  ) as unknown as Promise<void>;
}

export async function logKanbanLeadAutomationFailureAfterRollback(
  input: KanbanLeadAutomationInput,
  detail: string,
): Promise<void> {
  const safeDetail = String(detail || 'unknown').slice(0, 500);
  let auditAttendance = 'unassigned';
  try {
    const att = await pool.query<{ attendance_status: string | null }>(
      `SELECT attendance_status FROM chat_conversations WHERE id = $1 LIMIT 1`,
      [input.conversationId],
    );
    auditAttendance = att.rows[0]?.attendance_status?.trim() || 'unassigned';
  } catch {
    /* ignore */
  }
  try {
    await pool.query(
      `INSERT INTO chat_conversation_assignment_history (
        conversation_id, tenant_id, from_status, to_status, from_user_id, to_user_id, queue_id, actor_user_id, operation, reason
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        input.conversationId,
        input.tenantId,
        auditAttendance,
        auditAttendance,
        null,
        null,
        null,
        input.actorUserId,
        LEAD_AUTOMATION_OPERATION,
        `automation_type=lead_create_or_link;status=failed;mode=none;board_id=${input.boardId};column_id=${input.columnId};card_id=${input.cardId};conversation_id=${input.conversationId};error=${safeDetail}`.slice(
          0,
          2000,
        ),
      ],
    );
  } catch (e) {
    console.error('[chatKanban] lead_automation failed audit (post-rollback) insert failed', {
      conversationId: input.conversationId,
      cardId: input.cardId,
      error: e,
    });
  }
}

export async function runKanbanLeadAutomationInTransaction(
  client: PoolClient,
  input: KanbanLeadAutomationInput,
): Promise<{ status: 'success' | 'skipped'; leadLinked?: boolean }> {
  const cfg = resolveLeadAutomationConfig(input.columnMetadata);
  if (!cfg.enabled) {
    return { status: 'skipped' };
  }

  const conv = await client.query<{
    id: string;
    client_id: string | null;
    lead_id: string | null;
    display_name: string | null;
    contact_name: string | null;
    profile_name: string | null;
    phone_number: string | null;
    canonical_phone: string | null;
    metadata: unknown;
    attendance_status: string;
  }>(
    `SELECT id, client_id, lead_id, display_name, contact_name, profile_name, phone_number, canonical_phone, metadata, attendance_status
     FROM chat_conversations
     WHERE id = $1
     FOR UPDATE
     LIMIT 1`,
    [input.conversationId],
  );
  const row = conv.rows[0];
  if (!row) {
    const err = new Error('Conversa não encontrada para automação de lead.');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }

  const auditAttendance = row.attendance_status?.trim() || 'unassigned';

  if (row.client_id) {
    await persistLeadAutomationAudit(
      client,
      input,
      'skipped',
      'reason=conversation_has_client_crm_link_blocks_lead_id',
      auditAttendance,
      null,
      'none',
    );
    return { status: 'skipped' };
  }

  if (row.lead_id) {
    await persistLeadAutomationAudit(
      client,
      input,
      'skipped',
      'reason=conversation_already_has_lead',
      auditAttendance,
      row.lead_id,
      'none',
    );
    return { status: 'skipped' };
  }

  if (getLeadAutomationStamp(row.metadata, input.columnId)) {
    await persistLeadAutomationAudit(
      client,
      input,
      'skipped',
      'reason=already_executed_for_column_idempotent',
      auditAttendance,
      null,
      'none',
    );
    return { status: 'skipped' };
  }

  const cand = normalizeConversationLeadCandidate(row);
  if (!hasMinimumSignalsForAutomation(cand)) {
    await persistLeadAutomationAudit(
      client,
      input,
      'skipped',
      'reason=insufficient_contact_data_for_dedupe',
      auditAttendance,
      null,
      'none',
    );
    return { status: 'skipped' };
  }

  const existingId = await findExistingLeadForConversationDedupe(client, input.tenantId, cand);
  if (existingId) {
    await assertLeadBelongsToTenant(client, existingId, input.tenantId);
    const nextMeta = stampLeadAutomationInMetadata(row.metadata, input.columnId, existingId, 'linked_existing_lead');
    const up = await client.query(
      `UPDATE chat_conversations
       SET lead_id = $1, metadata = $2::jsonb, updated_at = now()
       WHERE id = $3 AND lead_id IS NULL
       RETURNING id`,
      [existingId, JSON.stringify(nextMeta), input.conversationId],
    );
    if (up.rows.length === 0) {
      leadAutomationBadRequest('Não foi possível vincular o lead: conversa já possui vínculo.');
    }
    console.info(
      '[chatKanban] lead_automation',
      JSON.stringify({
        event: 'lead_linked',
        conversation_id: input.conversationId,
        column_id: input.columnId,
        lead_id: existingId,
        tenant_id: input.tenantId,
      }),
    );
    await persistLeadAutomationAudit(
      client,
      input,
      'executed',
      'reason=dedupe_unique_match',
      auditAttendance,
      existingId,
      'linked_existing_lead',
    );
    return { status: 'success', leadLinked: true };
  }

  if (!cfg.allowCreateWhenNoDedupeMatch) {
    await persistLeadAutomationAudit(
      client,
      input,
      'skipped',
      'reason=no_dedupe_match_and_create_disabled',
      auditAttendance,
      null,
      'none',
    );
    return { status: 'skipped' };
  }

  if (!canAttemptCreateNewLead(cand)) {
    await persistLeadAutomationAudit(
      client,
      input,
      'skipped',
      'reason=insufficient_contact_data_for_create',
      auditAttendance,
      null,
      'none',
    );
    return { status: 'skipped' };
  }

  await assertActorInTenant(client, input.actorUserId, input.tenantId);

  const notes =
    `Kanban automação: board=${input.boardId} coluna=${input.columnName} (${input.columnId}) cartão=${input.cardId} conversa=${input.conversationId}`
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000);

  const phoneForLead =
    cand.phoneDigits.length >= 8 ? cand.phoneDigits : cand.phoneDigits.length > 0 ? cand.phoneDigits : null;

  const ins = await client.query<{ id: string }>(
    `INSERT INTO leads (
      user_id, name, email, phone, company, source, status, notes, profile_id
    ) VALUES ($1, $2, $3, $4, NULL, $5, NULL, $6, NULL)
    RETURNING id`,
    [
      input.actorUserId,
      cand.leadName,
      cand.emailNorm,
      phoneForLead,
      KANBAN_LEAD_SOURCE,
      notes,
    ],
  );
  const newId = ins.rows[0]?.id;
  if (!newId) {
    leadAutomationBadRequest('Falha ao criar lead.');
  }

  const nextMeta = stampLeadAutomationInMetadata(row.metadata, input.columnId, newId, 'created_new_lead');
  const up = await client.query(
    `UPDATE chat_conversations
     SET lead_id = $1, metadata = $2::jsonb, updated_at = now()
     WHERE id = $3 AND lead_id IS NULL
     RETURNING id`,
    [newId, JSON.stringify(nextMeta), input.conversationId],
  );
  if (up.rows.length === 0) {
    leadAutomationBadRequest('Lead criado mas não foi possível vincular à conversa.');
  }

  console.info(
    '[chatKanban] lead_automation',
    JSON.stringify({
      event: 'lead_created',
      conversation_id: input.conversationId,
      column_id: input.columnId,
      lead_id: newId,
      tenant_id: input.tenantId,
    }),
  );

  await persistLeadAutomationAudit(
    client,
    input,
    'executed',
    'reason=inserted_new_lead',
    auditAttendance,
    newId,
    'created_new_lead',
  );
  return { status: 'success', leadLinked: true };
}

export type KanbanEnsureClientAutomationInput = {
  tenantId: string;
  actorUserId: string;
  boardId: string;
  columnId: string;
  columnName: string;
  cardId: string;
  conversationId: string;
  columnMetadata: unknown;
};

type EnsureClientMode =
  | 'already_has_client'
  | 'converted_lead_to_client'
  | 'linked_existing_client'
  | 'created_new_client'
  | 'insufficient_data';

function resolveEnsureClientConfig(columnMetadata: unknown): { enabled: boolean } {
  const p = parseKanbanPhase2(columnMetadata);
  return { enabled: p.crm.ensure_client_on_column_entry === true };
}

function getEnsureClientAutomationStamp(metadata: unknown, columnId: string): { client_id: string; mode: string } | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const root = metadata as Record<string, unknown>;
  const k = root.kanban_ensure_client_automation;
  if (!k || typeof k !== 'object') return null;
  const v1 = (k as Record<string, unknown>).v1;
  if (!v1 || typeof v1 !== 'object') return null;
  const byCol = (v1 as Record<string, unknown>).by_column;
  if (!byCol || typeof byCol !== 'object') return null;
  const entry = (byCol as Record<string, unknown>)[columnId];
  if (!entry || typeof entry !== 'object') return null;
  const clientId = (entry as Record<string, unknown>).client_id;
  const mode = (entry as Record<string, unknown>).mode;
  if (typeof clientId === 'string' && UUID_RE_LEAD.test(clientId)) {
    return { client_id: clientId, mode: typeof mode === 'string' ? mode : 'unknown' };
  }
  return null;
}

function stampEnsureClientAutomationInMetadata(
  metadata: unknown,
  columnId: string,
  clientId: string,
  mode: Exclude<EnsureClientMode, 'already_has_client' | 'insufficient_data'>,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const prevRoot =
    base.kanban_ensure_client_automation && typeof base.kanban_ensure_client_automation === 'object'
      ? { ...(base.kanban_ensure_client_automation as Record<string, unknown>) }
      : {};
  const prevV1 =
    prevRoot.v1 && typeof prevRoot.v1 === 'object'
      ? { ...(prevRoot.v1 as Record<string, unknown>) }
      : {};
  const prevByCol =
    prevV1.by_column && typeof prevV1.by_column === 'object'
      ? { ...(prevV1.by_column as Record<string, unknown>) }
      : {};
  prevByCol[columnId] = {
    client_id: clientId,
    mode,
    at: new Date().toISOString(),
  };
  prevV1.by_column = prevByCol;
  prevRoot.v1 = prevV1;
  base.kanban_ensure_client_automation = prevRoot;
  return base;
}

function ensureClientAutomationBadRequest(message: string): never {
  const err = new Error(message);
  (err as Error & { code?: string }).code = 'BAD_REQUEST';
  throw err;
}

function persistEnsureClientAudit(
  client: PoolClient,
  input: KanbanEnsureClientAutomationInput,
  status: AutomationStatus,
  reason: string,
  snapshotAttendance: string,
  mode: EnsureClientMode,
  previousLeadId: string | null,
  resultingClientId: string | null,
): Promise<void> {
  const auditStatusLabel = status === 'executed' ? 'success' : status;
  const att = snapshotAttendance || 'unassigned';
  return client.query(
    `INSERT INTO chat_conversation_assignment_history (
      conversation_id, tenant_id, from_status, to_status, from_user_id, to_user_id, queue_id, actor_user_id, operation, reason
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      input.conversationId,
      input.tenantId,
      att,
      att,
      null,
      null,
      null,
      input.actorUserId,
      ENSURE_CLIENT_AUTOMATION_OPERATION,
      `automation_type=ensure_client;status=${auditStatusLabel};mode=${mode};board_id=${input.boardId};column_id=${input.columnId};card_id=${input.cardId};conversation_id=${input.conversationId};previous_lead_id=${previousLeadId ?? 'none'};client_id=${resultingClientId ?? 'none'};${reason}`.slice(
        0,
        2000,
      ),
    ],
  ) as unknown as Promise<void>;
}

export async function logKanbanEnsureClientAutomationFailureAfterRollback(
  input: KanbanEnsureClientAutomationInput,
  detail: string,
): Promise<void> {
  const safeDetail = String(detail || 'unknown').slice(0, 500);
  let auditAttendance = 'unassigned';
  try {
    const att = await pool.query<{ attendance_status: string | null }>(
      `SELECT attendance_status FROM chat_conversations WHERE id = $1 LIMIT 1`,
      [input.conversationId],
    );
    auditAttendance = att.rows[0]?.attendance_status?.trim() || 'unassigned';
  } catch {
    /* ignore */
  }
  try {
    await pool.query(
      `INSERT INTO chat_conversation_assignment_history (
        conversation_id, tenant_id, from_status, to_status, from_user_id, to_user_id, queue_id, actor_user_id, operation, reason
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        input.conversationId,
        input.tenantId,
        auditAttendance,
        auditAttendance,
        null,
        null,
        null,
        input.actorUserId,
        ENSURE_CLIENT_AUTOMATION_OPERATION,
        `automation_type=ensure_client;status=failed;mode=none;board_id=${input.boardId};column_id=${input.columnId};card_id=${input.cardId};conversation_id=${input.conversationId};error=${safeDetail}`.slice(
          0,
          2000,
        ),
      ],
    );
  } catch (e) {
    console.error('[chatKanban] ensure_client failed audit (post-rollback) insert failed', {
      conversationId: input.conversationId,
      cardId: input.cardId,
      error: e,
    });
  }
}

type ConversationEnsureClientRow = {
  id: string;
  user_id: string;
  client_id: string | null;
  lead_id: string | null;
  display_name: string | null;
  contact_name: string | null;
  profile_name: string | null;
  phone_number: string | null;
  canonical_phone: string | null;
  metadata: unknown;
  attendance_status: string;
};

function resolveConversationClientName(row: ConversationEnsureClientRow): string {
  const raw =
    [row.display_name, row.contact_name, row.profile_name].find((s) => typeof s === 'string' && s.trim().length > 0) ??
    '';
  const trimmed = raw.trim().slice(0, 200);
  if (trimmed) return trimmed;
  const normalized = normalizeConversationPhone(row.canonical_phone || row.phone_number);
  if (normalized) return `WhatsApp +${normalized}`.slice(0, 200);
  return 'Contato Kanban';
}

function normalizeConversationClientCandidate(row: ConversationEnsureClientRow): {
  phoneNorm: string | null;
  emailNorm: string | null;
  clientName: string;
} {
  const phoneNorm = normalizeConversationPhone(row.canonical_phone || row.phone_number);
  const emailNorm = extractEmailFromConversationMetadata(row.metadata);
  const clientName = resolveConversationClientName(row);
  return { phoneNorm, emailNorm, clientName };
}

function hasMinimumSignalsForClientCreate(candidate: { phoneNorm: string | null; emailNorm: string | null }): boolean {
  return !!candidate.phoneNorm || !!candidate.emailNorm;
}

async function findExistingClientForConversation(
  client: PoolClient,
  tenantId: string,
  cand: { phoneNorm: string | null; emailNorm: string | null },
): Promise<string | null> {
  if (cand.phoneNorm) {
    const r = await client.query<{ id: string }>(
      `SELECT c.id
       FROM clients c
       INNER JOIN users u ON u.id = c.user_id
       WHERE u.tenant_id = $1
         AND c.phone IS NOT NULL
         AND c.phone <> ''
         AND (
           regexp_replace(c.phone, '\\D', '', 'g') = $2
           OR regexp_replace(c.phone, '\\D', '', 'g') = substring($2 from 3)
         )
       LIMIT 3`,
      [tenantId, cand.phoneNorm],
    );
    if (r.rows.length > 1) {
      ensureClientAutomationBadRequest(
        'Dedupe ambígua: vários clientes com o mesmo telefone na empresa. Corrija o CRM antes de automatizar.',
      );
    }
    if (r.rows.length === 1) return r.rows[0]!.id;
  }

  if (cand.emailNorm) {
    const r = await client.query<{ id: string }>(
      `SELECT c.id
       FROM clients c
       INNER JOIN users u ON u.id = c.user_id
       WHERE u.tenant_id = $1
         AND c.email IS NOT NULL
         AND lower(trim(c.email)) = $2
       LIMIT 3`,
      [tenantId, cand.emailNorm],
    );
    if (r.rows.length > 1) {
      ensureClientAutomationBadRequest(
        'Dedupe ambígua: vários clientes com o mesmo e-mail na empresa. Corrija o CRM antes de automatizar.',
      );
    }
    if (r.rows.length === 1) return r.rows[0]!.id;
  }
  return null;
}

async function linkConversationToClientInTransaction(
  client: PoolClient,
  row: ConversationEnsureClientRow,
  clientId: string,
  mode: Exclude<EnsureClientMode, 'already_has_client' | 'insufficient_data'>,
  actorUserId: string,
): Promise<void> {
  const migrationPayload =
    mode === 'converted_lead_to_client' && row.lead_id
      ? {
          type: 'lead_to_client',
          at: new Date().toISOString(),
          previous_lead_id: row.lead_id,
          new_client_id: clientId,
          actor_user_id: actorUserId,
          reason: 'lead_converted',
        }
      : null;
  const up = await client.query(
    `UPDATE chat_conversations
     SET client_id = $1,
         lead_id = NULL,
         metadata = COALESCE(metadata, '{}'::jsonb) ||
           jsonb_build_object(
             'link_source','system',
             'link_confidence','high',
             'link_state','client_linked'
           ) ||
           CASE WHEN $2::jsonb IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('link_migration', $2::jsonb) END,
         updated_at = now()
     WHERE id = $3
     RETURNING id`,
    [clientId, migrationPayload ? JSON.stringify(migrationPayload) : null, row.id],
  );
  if (up.rows.length === 0) {
    ensureClientAutomationBadRequest('Falha ao vincular cliente na conversa.');
  }
}

export async function runKanbanEnsureClientAutomationInTransaction(
  client: PoolClient,
  input: KanbanEnsureClientAutomationInput,
): Promise<{ status: 'success' | 'skipped'; clientLinked?: boolean }> {
  const cfg = resolveEnsureClientConfig(input.columnMetadata);
  if (!cfg.enabled) return { status: 'skipped' };

  const conv = await client.query<ConversationEnsureClientRow>(
    `SELECT id, user_id, client_id, lead_id, display_name, contact_name, profile_name, phone_number, canonical_phone, metadata, attendance_status
     FROM chat_conversations
     WHERE id = $1
     FOR UPDATE
     LIMIT 1`,
    [input.conversationId],
  );
  const row = conv.rows[0];
  if (!row) {
    const err = new Error('Conversa não encontrada para automação ensure_client.');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }

  const auditAttendance = row.attendance_status?.trim() || 'unassigned';
  if (row.client_id) {
    await persistEnsureClientAudit(
      client,
      input,
      'skipped',
      'reason=already_has_client',
      auditAttendance,
      'already_has_client',
      row.lead_id,
      row.client_id,
    );
    return { status: 'skipped' };
  }

  if (!row.lead_id && getEnsureClientAutomationStamp(row.metadata, input.columnId)) {
    await persistEnsureClientAudit(
      client,
      input,
      'skipped',
      'reason=already_executed_for_column_idempotent',
      auditAttendance,
      'already_has_client',
      null,
      null,
    );
    return { status: 'skipped' };
  }

  if (row.lead_id) {
    const leadRow = await client.query<{
      id: string;
      user_id: string;
      name: string;
      email: string | null;
      phone: string | null;
      company: string | null;
      notes: string | null;
      source: string | null;
    }>(
      `SELECT l.id, l.user_id, l.name, l.email, l.phone, l.company, l.notes, l.source
       FROM leads l
       INNER JOIN users u ON u.id = l.user_id
       WHERE l.id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [row.lead_id, input.tenantId],
    );
    const lead = leadRow.rows[0];
    if (!lead) {
      ensureClientAutomationBadRequest('Lead vinculado à conversa não pertence à empresa.');
    }

    const existingByLead = await findExistingClientForConversation(client, input.tenantId, {
      phoneNorm: normalizeConversationPhone(lead.phone),
      emailNorm: lead.email?.trim().toLowerCase() || null,
    });
    let finalClientId = existingByLead;
    if (!finalClientId) {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO clients (
          user_id, name, email, phone, company, status, source, notes, funnel_stage
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL)
        RETURNING id`,
        [
          lead.user_id,
          (lead.name || 'Cliente').trim().slice(0, 200),
          lead.email?.trim() || null,
          lead.phone?.trim() || null,
          lead.company?.trim() || null,
          'Ativo',
          (lead.source || 'kanban_column').trim().slice(0, 120),
          lead.notes ? lead.notes.slice(0, 2000) : null,
        ],
      );
      finalClientId = ins.rows[0]?.id ?? null;
      if (!finalClientId) ensureClientAutomationBadRequest('Falha ao converter lead em cliente.');
    }

    await linkConversationToClientInTransaction(client, row, finalClientId, 'converted_lead_to_client', input.actorUserId);
    await client.query(
      `UPDATE leads SET status = 'Convertido', updated_at = now() WHERE id = $1`,
      [lead.id],
    );

    await migrateTicketsLeadToClientInTransaction(client, {
      tenantId: input.tenantId,
      leadId: lead.id,
      clientId: finalClientId,
      actorUserId: input.actorUserId,
    });

    const nextMeta = stampEnsureClientAutomationInMetadata(
      row.metadata,
      input.columnId,
      finalClientId,
      'converted_lead_to_client',
    );
    await client.query(`UPDATE chat_conversations SET metadata = $1::jsonb, updated_at = now() WHERE id = $2`, [
      JSON.stringify(nextMeta),
      row.id,
    ]);
    await persistEnsureClientAudit(
      client,
      input,
      'executed',
      existingByLead ? 'reason=lead_to_existing_client' : 'reason=lead_converted_to_new_client',
      auditAttendance,
      'converted_lead_to_client',
      row.lead_id,
      finalClientId,
    );
    return { status: 'success', clientLinked: true };
  }

  const cand = normalizeConversationClientCandidate(row);
  if (!hasMinimumSignalsForClientCreate(cand)) {
    await persistEnsureClientAudit(
      client,
      input,
      'skipped',
      'reason=insufficient_data',
      auditAttendance,
      'insufficient_data',
      null,
      null,
    );
    return { status: 'skipped' };
  }

  const existingClientId = await findExistingClientForConversation(client, input.tenantId, cand);
  if (existingClientId) {
    await linkConversationToClientInTransaction(client, row, existingClientId, 'linked_existing_client', input.actorUserId);
    const nextMeta = stampEnsureClientAutomationInMetadata(
      row.metadata,
      input.columnId,
      existingClientId,
      'linked_existing_client',
    );
    await client.query(`UPDATE chat_conversations SET metadata = $1::jsonb, updated_at = now() WHERE id = $2`, [
      JSON.stringify(nextMeta),
      row.id,
    ]);
    await persistEnsureClientAudit(
      client,
      input,
      'executed',
      'reason=dedupe_unique_match',
      auditAttendance,
      'linked_existing_client',
      null,
      existingClientId,
    );
    return { status: 'success', clientLinked: true };
  }

  const ins = await client.query<{ id: string }>(
    `INSERT INTO clients (
      user_id, name, email, phone, company, status, source, notes, funnel_stage
    ) VALUES ($1,$2,$3,$4,NULL,'Ativo','kanban_column',$5,NULL)
    RETURNING id`,
    [
      row.user_id,
      cand.clientName,
      cand.emailNorm,
      cand.phoneNorm ? `+${cand.phoneNorm}` : null,
      `Kanban automação ensure_client: board=${input.boardId} column=${input.columnId} card=${input.cardId} conversation=${input.conversationId}`.slice(
        0,
        2000,
      ),
    ],
  );
  const newClientId = ins.rows[0]?.id ?? null;
  if (!newClientId) {
    ensureClientAutomationBadRequest('Falha ao criar cliente a partir da conversa.');
  }
  await linkConversationToClientInTransaction(client, row, newClientId, 'created_new_client', input.actorUserId);
  const nextMeta = stampEnsureClientAutomationInMetadata(row.metadata, input.columnId, newClientId, 'created_new_client');
  await client.query(`UPDATE chat_conversations SET metadata = $1::jsonb, updated_at = now() WHERE id = $2`, [
    JSON.stringify(nextMeta),
    row.id,
  ]);
  await persistEnsureClientAudit(
    client,
    input,
    'executed',
    'reason=created_client_from_conversation',
    auditAttendance,
    'created_new_client',
    null,
    newClientId,
  );
  return { status: 'success', clientLinked: true };
}

// --- Fase 2B PR2: tarefa automática ao entrar na coluna ---

const TASK_AUTOMATION_OPERATION = 'kanban_phase2_task_create';
const TASK_PLACEHOLDER_RE =
  /\{\{(column_name|contact_name|display_name|conversation_id|canonical_phone)\}\}/g;

export type KanbanTaskAutomationInput = {
  tenantId: string;
  actorUserId: string;
  boardId: string;
  columnId: string;
  columnName: string;
  cardId: string;
  conversationId: string;
  columnMetadata: unknown;
};

type TaskTemplateContext = {
  column_name: string;
  contact_name: string;
  display_name: string;
  conversation_id: string;
  canonical_phone: string;
};

function taskAutomationBadRequest(message: string): never {
  const err = new Error(message);
  (err as Error & { code?: string }).code = 'BAD_REQUEST';
  throw err;
}

function resolveTaskAutomationEnabled(columnMetadata: unknown): boolean {
  return parseKanbanPhase2(columnMetadata).productivity.auto_create_task === true;
}

function renderKanbanTaskTemplates(
  titleTpl: string,
  descTpl: string,
  ctx: TaskTemplateContext,
): { title: string; description: string | null } {
  const repl = (_m: string, key: string): string => {
    const k = key as keyof TaskTemplateContext;
    const v = ctx[k] ?? '';
    return String(v).slice(0, 300);
  };
  const title = titleTpl.replace(TASK_PLACEHOLDER_RE, repl).trim().slice(0, 500);
  const descRaw = descTpl.trim().length > 0 ? descTpl.replace(TASK_PLACEHOLDER_RE, repl).trim().slice(0, 5000) : '';
  return {
    title: title.length > 0 ? title : 'Tarefa Kanban',
    description: descRaw.length > 0 ? descRaw : null,
  };
}

function getTaskAutomationStamp(
  metadata: unknown,
  columnId: string,
): { task_id: string; storage: string } | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const root = metadata as Record<string, unknown>;
  const k = root.kanban_task_automation;
  if (!k || typeof k !== 'object') return null;
  const v1 = (k as Record<string, unknown>).v1;
  if (!v1 || typeof v1 !== 'object') return null;
  const byCol = (v1 as Record<string, unknown>).by_column;
  if (!byCol || typeof byCol !== 'object') return null;
  const entry = (byCol as Record<string, unknown>)[columnId];
  if (!entry || typeof entry !== 'object') return null;
  const taskId = (entry as Record<string, unknown>).task_id;
  const storage = (entry as Record<string, unknown>).storage;
  if (typeof taskId === 'string' && UUID_RE_LEAD.test(taskId)) {
    return { task_id: taskId, storage: typeof storage === 'string' ? storage : 'tasks' };
  }
  return null;
}

function stampTaskAutomationInMetadata(
  metadata: unknown,
  columnId: string,
  taskId: string,
  storage: 'tasks' | 'lead_tasks',
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const prevRoot =
    base.kanban_task_automation && typeof base.kanban_task_automation === 'object'
      ? { ...(base.kanban_task_automation as Record<string, unknown>) }
      : {};
  const prevV1 =
    prevRoot.v1 && typeof prevRoot.v1 === 'object'
      ? { ...(prevRoot.v1 as Record<string, unknown>) }
      : {};
  const prevByCol =
    prevV1.by_column && typeof prevV1.by_column === 'object'
      ? { ...(prevV1.by_column as Record<string, unknown>) }
      : {};
  prevByCol[columnId] = {
    task_id: taskId,
    storage,
    at: new Date().toISOString(),
  };
  prevV1.by_column = prevByCol;
  prevRoot.v1 = prevV1;
  base.kanban_task_automation = prevRoot;
  return base;
}

function computeTaskDueDateOnlyUtc(offset: number | null): string | null {
  if (offset === null || !Number.isFinite(offset)) return null;
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + Math.floor(offset));
  return d.toISOString().slice(0, 10);
}

async function loadUserAssigneeLabel(
  client: PoolClient,
  userId: string,
  tenantId: string,
): Promise<string | null> {
  const r = await client.query<{ email: string; fn: string | null; ln: string | null }>(
    `SELECT u.email, p.first_name AS fn, p.last_name AS ln
     FROM users u
     LEFT JOIN profiles p ON p.id = u.id
     WHERE u.id = $1 AND u.tenant_id = $2
     LIMIT 1`,
    [userId, tenantId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const name = [row.fn, row.ln].filter(Boolean).join(' ').trim();
  return name || row.email || null;
}

function persistTaskAutomationAudit(
  client: PoolClient,
  input: KanbanTaskAutomationInput,
  status: AutomationStatus,
  reason: string,
  snapshotAttendance: string,
  taskId: string | null,
  target: 'tasks_client' | 'tasks_standalone' | 'lead_tasks',
): Promise<void> {
  const auditStatusLabel = status === 'executed' ? 'success' : status;
  const att = snapshotAttendance || 'unassigned';
  return client.query(
    `INSERT INTO chat_conversation_assignment_history (
      conversation_id, tenant_id, from_status, to_status, from_user_id, to_user_id, queue_id, actor_user_id, operation, reason
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      input.conversationId,
      input.tenantId,
      att,
      att,
      null,
      null,
      null,
      input.actorUserId,
      TASK_AUTOMATION_OPERATION,
      `automation_type=task_create;status=${auditStatusLabel};target=${target};board_id=${input.boardId};column_id=${input.columnId};card_id=${input.cardId};conversation_id=${input.conversationId};task_id=${taskId ?? 'none'};${reason}`.slice(
        0,
        2000,
      ),
    ],
  ) as unknown as Promise<void>;
}

export async function logKanbanTaskAutomationFailureAfterRollback(
  input: KanbanTaskAutomationInput,
  detail: string,
): Promise<void> {
  const safeDetail = String(detail || 'unknown').slice(0, 500);
  let auditAttendance = 'unassigned';
  try {
    const att = await pool.query<{ attendance_status: string | null }>(
      `SELECT attendance_status FROM chat_conversations WHERE id = $1 LIMIT 1`,
      [input.conversationId],
    );
    auditAttendance = att.rows[0]?.attendance_status?.trim() || 'unassigned';
  } catch {
    /* ignore */
  }
  try {
    await pool.query(
      `INSERT INTO chat_conversation_assignment_history (
        conversation_id, tenant_id, from_status, to_status, from_user_id, to_user_id, queue_id, actor_user_id, operation, reason
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        input.conversationId,
        input.tenantId,
        auditAttendance,
        auditAttendance,
        null,
        null,
        null,
        input.actorUserId,
        TASK_AUTOMATION_OPERATION,
        `automation_type=task_create;status=failed;target=none;board_id=${input.boardId};column_id=${input.columnId};card_id=${input.cardId};conversation_id=${input.conversationId};error=${safeDetail}`.slice(
          0,
          2000,
        ),
      ],
    );
  } catch (e) {
    console.error('[chatKanban] task_automation failed audit (post-rollback) insert failed', {
      conversationId: input.conversationId,
      cardId: input.cardId,
      error: e,
    });
  }
}

export async function runKanbanTaskAutomationInTransaction(
  client: PoolClient,
  input: KanbanTaskAutomationInput,
): Promise<{ status: 'success' | 'skipped' }> {
  const p2 = parseKanbanPhase2(input.columnMetadata);
  const prod = p2.productivity;
  if (!prod.auto_create_task) {
    return { status: 'skipped' };
  }

  const conv = await client.query<{
    id: string;
    client_id: string | null;
    lead_id: string | null;
    assigned_to_user_id: string | null;
    display_name: string | null;
    contact_name: string | null;
    profile_name: string | null;
    canonical_phone: string | null;
    metadata: unknown;
    attendance_status: string;
  }>(
    `SELECT id, client_id, lead_id, assigned_to_user_id, display_name, contact_name, profile_name, canonical_phone, metadata, attendance_status
     FROM chat_conversations
     WHERE id = $1
     FOR UPDATE
     LIMIT 1`,
    [input.conversationId],
  );
  const row = conv.rows[0];
  if (!row) {
    const err = new Error('Conversa não encontrada para automação de tarefa.');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }

  const auditAttendance = row.attendance_status?.trim() || 'unassigned';

  if (getTaskAutomationStamp(row.metadata, input.columnId)) {
    await persistTaskAutomationAudit(
      client,
      input,
      'skipped',
      'reason=already_executed_for_column_idempotent',
      auditAttendance,
      null,
      'tasks_standalone',
    );
    return { status: 'skipped' };
  }

  if (prod.assignee_mode === 'conversation_assignee' && !row.assigned_to_user_id) {
    await persistTaskAutomationAudit(
      client,
      input,
      'skipped',
      'reason=no_conversation_assignee',
      auditAttendance,
      null,
      'tasks_standalone',
    );
    return { status: 'skipped' };
  }

  if (prod.assignee_mode === 'fixed_user') {
    if (!prod.assignee_user_id) {
      await persistTaskAutomationAudit(
        client,
        input,
        'skipped',
        'reason=missing_fixed_assignee_config',
        auditAttendance,
        null,
        'tasks_standalone',
      );
      return { status: 'skipped' };
    }
    const okUser = await client.query(`SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [
      prod.assignee_user_id,
      input.tenantId,
    ]);
    if (okUser.rows.length === 0) {
      await persistTaskAutomationAudit(
        client,
        input,
        'skipped',
        'reason=fixed_assignee_not_in_tenant',
        auditAttendance,
        null,
        'tasks_standalone',
      );
      return { status: 'skipped' };
    }
  }

  const contact =
    [row.display_name, row.contact_name, row.profile_name].find((s) => typeof s === 'string' && s.trim().length > 0)
      ?.trim() ?? '';
  const tctx: TaskTemplateContext = {
    column_name: input.columnName,
    contact_name: contact || 'Contato',
    display_name: (row.display_name ?? row.contact_name ?? row.profile_name ?? '').trim() || 'Contato',
    conversation_id: input.conversationId,
    canonical_phone: (row.canonical_phone ?? '').trim(),
  };
  const { title, description: descBase } = renderKanbanTaskTemplates(
    prod.task_title_template,
    prod.task_description_template,
    tctx,
  );

  const dueDateStr = computeTaskDueDateOnlyUtc(prod.due_offset_days);
  const footer =
    `\n\n— Kanban\nBoard: ${input.boardId}\nColuna: ${input.columnName} (${input.columnId})\nCartão: ${input.cardId}\nConversa: ${input.conversationId}`
      .trimEnd()
      .slice(0, 2500);
  const description = descBase ? `${descBase}${footer}`.slice(0, 5000) : footer.slice(0, 5000);

  let assigneeId: string | null = null;
  let assigneeName: string | null = null;
  if (prod.assignee_mode === 'none') {
    assigneeId = null;
    assigneeName = null;
  } else if (prod.assignee_mode === 'actor') {
    assigneeId = input.actorUserId;
    assigneeName = await loadUserAssigneeLabel(client, input.actorUserId, input.tenantId);
  } else if (prod.assignee_mode === 'conversation_assignee') {
    assigneeId = row.assigned_to_user_id;
    assigneeName = assigneeId
      ? await loadUserAssigneeLabel(client, assigneeId, input.tenantId)
      : null;
  } else {
    assigneeId = prod.assignee_user_id;
    assigneeName = assigneeId
      ? await loadUserAssigneeLabel(client, assigneeId, input.tenantId)
      : null;
  }

  const assertActor = await client.query(`SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [
    input.actorUserId,
    input.tenantId,
  ]);
  if (assertActor.rows.length === 0) {
    taskAutomationBadRequest('Usuário ator inválido para a empresa ao criar tarefa.');
  }

  let taskId: string;
  let storage: 'tasks' | 'lead_tasks';
  let target: 'tasks_client' | 'tasks_standalone' | 'lead_tasks';

  if (row.client_id) {
    const cRow = await client.query<{ id: string; name: string }>(
      `SELECT c.id, c.name
       FROM clients c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [row.client_id, input.tenantId],
    );
    if (cRow.rows.length === 0) {
      await persistTaskAutomationAudit(
        client,
        input,
        'skipped',
        'reason=conversation_client_not_in_tenant',
        auditAttendance,
        null,
        'tasks_client',
      );
      return { status: 'skipped' };
    }
    const clientName = cRow.rows[0]!.name;
    storage = 'tasks';
    target = 'tasks_client';
    const ins = await client.query<{ id: string }>(
      `INSERT INTO tasks (
        user_id, title, description, due_date, due_time, status, priority,
        client_id, client_name, deal, assignee_id, assignee_name, checklist
      ) VALUES ($1, $2, $3, $4::date, NULL, 'pending', $5, $6, $7, NULL, $8, $9, '[]'::jsonb)
      RETURNING id`,
      [
        input.actorUserId,
        title,
        description,
        dueDateStr,
        prod.task_priority,
        row.client_id,
        clientName,
        assigneeId,
        assigneeName,
      ],
    );
    taskId = ins.rows[0]?.id ?? '';
    if (!taskId) taskAutomationBadRequest('Falha ao criar tarefa (cliente).');
  } else if (row.lead_id) {
    const lOk = await client.query(
      `SELECT 1 FROM leads l INNER JOIN users u ON u.id = l.user_id
       WHERE l.id = $1 AND u.tenant_id = $2 LIMIT 1`,
      [row.lead_id, input.tenantId],
    );
    if (lOk.rows.length === 0) {
      await persistTaskAutomationAudit(
        client,
        input,
        'skipped',
        'reason=conversation_lead_not_in_tenant',
        auditAttendance,
        null,
        'lead_tasks',
      );
      return { status: 'skipped' };
    }
    storage = 'lead_tasks';
    target = 'lead_tasks';
    const dueTs = dueDateStr ? `${dueDateStr}T00:00:00.000Z` : null;
    const ins = await client.query<{ id: string }>(
      `INSERT INTO lead_tasks (user_id, lead_id, title, description, status, due_date)
       VALUES ($1, $2, $3, $4, 'pending', $5::timestamptz)
       RETURNING id`,
      [input.actorUserId, row.lead_id, title, description, dueTs],
    );
    taskId = ins.rows[0]?.id ?? '';
    if (!taskId) taskAutomationBadRequest('Falha ao criar tarefa (lead).');
  } else {
    storage = 'tasks';
    target = 'tasks_standalone';
    const ins = await client.query<{ id: string }>(
      `INSERT INTO tasks (
        user_id, title, description, due_date, due_time, status, priority,
        client_id, client_name, deal, assignee_id, assignee_name, checklist
      ) VALUES ($1, $2, $3, $4::date, NULL, 'pending', $5, NULL, NULL, NULL, $6, $7, '[]'::jsonb)
      RETURNING id`,
      [input.actorUserId, title, description, dueDateStr, prod.task_priority, assigneeId, assigneeName],
    );
    taskId = ins.rows[0]?.id ?? '';
    if (!taskId) taskAutomationBadRequest('Falha ao criar tarefa.');
  }

  const nextMeta = stampTaskAutomationInMetadata(row.metadata, input.columnId, taskId, storage);
  await client.query(
    `UPDATE chat_conversations SET metadata = $1::jsonb, updated_at = now() WHERE id = $2`,
    [JSON.stringify(nextMeta), input.conversationId],
  );

  console.info(
    '[chatKanban] task_automation',
    JSON.stringify({
      event: 'task_created',
      target,
      task_id: taskId,
      storage,
      conversation_id: input.conversationId,
      column_id: input.columnId,
      tenant_id: input.tenantId,
    }),
  );

  await persistTaskAutomationAudit(
    client,
    input,
    'executed',
    'reason=task_inserted',
    auditAttendance,
    taskId,
    target,
  );
  return { status: 'success' };
}

type WebhookDispatchConfig = {
  enabled: boolean;
  nonBlocking: boolean;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  timeoutMs: number;
  signingSecret: string;
  includeHeaders: boolean;
};

type WebhookDispatchResult = {
  status: 'success' | 'failed';
  httpStatus: number | null;
  error: string | null;
};

function parseWebhookConfig(ctx: KanbanPhase2AutomationContext): WebhookDispatchConfig {
  const parsed = parseKanbanPhase2(ctx.columnMetadata);
  return {
    enabled: parsed.webhook.enabled,
    nonBlocking: parsed.webhook.non_blocking,
    url: parsed.webhook.url,
    method: parsed.webhook.method,
    timeoutMs: parsed.webhook.timeout_ms,
    signingSecret: parsed.webhook.signing_secret,
    includeHeaders: parsed.webhook.include_headers,
  };
}

function buildWebhookPayload(ctx: KanbanPhase2AutomationContext): Record<string, unknown> {
  return {
    source: 'kanban_column',
    event: 'card_entered_column',
    tenant_id: ctx.tenantId,
    board_id: ctx.boardId,
    column_id: ctx.columnId,
    card_id: ctx.cardId,
    conversation_id: ctx.conversationId,
    actor_user_id: ctx.actorUserId,
    timestamp: new Date().toISOString(),
    column: {
      id: ctx.columnId,
      name: ctx.columnName,
    },
    board: {
      id: ctx.boardId,
      name: ctx.boardName,
    },
    conversation: {
      id: ctx.conversationId,
      client_id: ctx.conversationClientId,
      lead_id: ctx.conversationLeadId,
      assigned_to_user_id: ctx.assignedToUserId,
      queue_id: ctx.queueId,
      attendance_status: ctx.attendanceStatus,
    },
  };
}

function buildWebhookHeaders(
  ctx: KanbanPhase2AutomationContext,
  payloadText: string,
  cfg: WebhookDispatchConfig,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cfg.includeHeaders) {
    headers['X-Kanban-Event'] = 'card_entered_column';
    headers['X-Kanban-Board-Id'] = ctx.boardId;
    headers['X-Kanban-Column-Id'] = ctx.columnId;
  }
  if (cfg.signingSecret) {
    const signature = createHmac('sha256', cfg.signingSecret).update(payloadText).digest('hex');
    headers['X-Kanban-Signature'] = `sha256=${signature}`;
  }
  return headers;
}

async function sendOutboundWebhook(
  cfg: WebhookDispatchConfig,
  payloadText: string,
  headers: Record<string, string>,
): Promise<WebhookDispatchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const response = await fetch(cfg.url, {
      method: cfg.method,
      headers,
      body: payloadText,
      signal: controller.signal,
    });
    if (response.status >= 200 && response.status < 300) {
      return { status: 'success', httpStatus: response.status, error: null };
    }
    return {
      status: 'failed',
      httpStatus: response.status,
      error: `http_status_${response.status}`,
    };
  } catch (e: any) {
    return {
      status: 'failed',
      httpStatus: null,
      error: String(e?.name === 'AbortError' ? 'timeout' : e?.message || 'request_error'),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function notifyOperator(ctx: KanbanPhase2AutomationContext, dedupe: Set<string>): Promise<void> {
  const destinationUserId = ctx.assignedToUserId;
  const operation = 'kanban_phase2_notify_operator';
  if (!destinationUserId) {
    await insertAutomationAudit(ctx, operation, 'skipped', 'status=skipped;reason=no_target_operator');
    return;
  }
  const dedupeKey = `user:${destinationUserId}`;
  if (dedupe.has(dedupeKey)) {
    await insertAutomationAudit(
      ctx,
      operation,
      'skipped',
      'status=skipped;reason=dedupe_same_move',
      destinationUserId,
    );
    return;
  }
  dedupe.add(dedupeKey);
  await insertAutomationAudit(
    ctx,
    operation,
    'skipped',
    'status=skipped;reason=operator_move_in_app_notification_disabled',
    destinationUserId,
  );
}

async function notifyTeamMembers(ctx: KanbanPhase2AutomationContext, dedupe: Set<string>): Promise<void> {
  const operation = 'kanban_phase2_notify_team';
  if (!ctx.assignedTeamId) {
    await insertAutomationAudit(ctx, operation, 'skipped', 'status=skipped;reason=no_target_team');
    return;
  }

  try {
    const members = await pool.query<{ user_id: string }>(
      `SELECT tm.user_id
       FROM team_members tm
       INNER JOIN teams t ON t.id = tm.team_id
       WHERE tm.team_id = $1 AND t.tenant_id = $2`,
      [ctx.assignedTeamId, ctx.tenantId],
    );
    if (members.rows.length === 0) {
      await insertAutomationAudit(
        ctx,
        operation,
        'skipped',
        'status=skipped;reason=team_has_no_members',
      );
      return;
    }

    let sentCount = 0;
    for (const row of members.rows) {
      const destinationUserId = row.user_id;
      const dedupeKey = `user:${destinationUserId}`;
      if (dedupe.has(dedupeKey)) continue;
      dedupe.add(dedupeKey);
      try {
        await createNotification({
          userId: destinationUserId,
          type: 'kanban_automation',
          title: `Kanban: novo cartão em ${ctx.columnName}`,
          message: `Conversa ${ctx.conversationDisplayName || ctx.conversationId} entrou na coluna ${ctx.columnName}.`,
          data: {
            source: 'chat_kanban_phase2',
            automation: 'notify_team',
            board_id: ctx.boardId,
            column_id: ctx.columnId,
            card_id: ctx.cardId,
            conversation_id: ctx.conversationId,
            team_id: ctx.assignedTeamId,
          },
        });
        sentCount += 1;
      } catch (e) {
        console.error('[chatKanban] phase2 notify_team member failed', {
          conversationId: ctx.conversationId,
          destinationUserId,
          error: e,
        });
      }
    }
    if (sentCount === 0) {
      await insertAutomationAudit(
        ctx,
        operation,
        'failed',
        'status=failed;reason=no_member_notification_sent',
      );
      return;
    }
    await insertAutomationAudit(
      ctx,
      operation,
      'executed',
      `status=executed;reason=team_notifications_sent;count=${sentCount}`,
    );
  } catch (e: any) {
    await insertAutomationAudit(
      ctx,
      operation,
      'failed',
      `status=failed;reason=team_lookup_error;detail=${String(e?.message || 'unknown')}`,
    );
    console.error('[chatKanban] phase2 notify_team failed', {
      conversationId: ctx.conversationId,
      teamId: ctx.assignedTeamId,
      error: e,
    });
  }
}

/**
 * Debounce por coluna: evita 2 envios no mesmo arrasto/duplo PATCH, mas permite reenviar
 * quando o cartão sai da coluna e volta depois (nova entrada).
 */
const KANBAN_AUTO_TEXT_SAME_COLUMN_DEBOUNCE_MS = 12_000;

type KanbanAutoTextBucket = {
  last_sent_epoch_ms_by_column?: Record<string, number>;
};

function readKanbanAutoTextBucket(metadata: unknown): KanbanAutoTextBucket {
  const root = metadata as Record<string, unknown> | null;
  const b = root?.kanban_auto_text;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return {};
  return b as KanbanAutoTextBucket;
}

type AutoMessageResolvedConfig = { kind: 'free_text'; body: string };

function resolveAutoMessageConfig(parsed: ParsedKanbanPhase2): AutoMessageResolvedConfig | null {
  if (!parsed.notifications.auto_message_enabled) return null;
  if (parsed.notifications.auto_message_mode === 'whatsapp_model') return null;
  const t = parsed.notifications.auto_message_text?.trim();
  if (!t) return null;
  return { kind: 'free_text', body: t };
}

function safeAuditSnippet(text: string, max = 180): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

async function loadConversationMetadataRoot(conversationId: string): Promise<Record<string, unknown>> {
  const r = await pool.query(`SELECT metadata FROM chat_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
  const m = r.rows[0]?.metadata;
  if (m && typeof m === 'object' && !Array.isArray(m)) return { ...(m as Record<string, unknown>) };
  return {};
}

async function persistKanbanAutoTextColumnTimestamp(
  conversationId: string,
  columnId: string,
  root: Record<string, unknown>,
): Promise<void> {
  const prev = readKanbanAutoTextBucket(root);
  const nextByCol = { ...(prev.last_sent_epoch_ms_by_column ?? {}), [columnId]: Date.now() };
  const nextRoot = {
    ...root,
    kanban_auto_text: {
      last_sent_epoch_ms_by_column: nextByCol,
    },
  };
  await pool.query(`UPDATE chat_conversations SET metadata = $2::jsonb WHERE id = $1`, [
    conversationId,
    JSON.stringify(nextRoot),
  ]);
}

async function runKanbanAutoOutboundText(ctx: KanbanPhase2AutomationContext, parsed: ParsedKanbanPhase2): Promise<void> {
  const operation = 'kanban_phase2_auto_message_text' as const;
  if (!parsed.notifications.auto_message_enabled) return;

  const cfg = resolveAutoMessageConfig(parsed);
  if (!cfg) {
    await insertAutomationAudit(
      ctx,
      operation,
      'skipped',
      `automation_type=auto_message_text;status=skipped;mode=${parsed.notifications.auto_message_mode};board_id=${ctx.boardId};column_id=${ctx.columnId};card_id=${ctx.cardId};conversation_id=${ctx.conversationId};actor_user_id=${ctx.actorUserId};reason=auto_message_not_configured`,
    );
    console.warn('[chatKanban] phase2 auto_message_text skipped (not configured)', {
      conversationId: ctx.conversationId,
      columnId: ctx.columnId,
      mode: parsed.notifications.auto_message_mode,
    });
    return;
  }

  const modeLabel = 'free_text';
  const templateIdForAudit = null;

  const rawBody = cfg.body;

  const tmplCtx = await buildKanbanAutomationTemplateContext(ctx);
  const rendered = renderMessageTemplate(rawBody, tmplCtx).trim();
  if (!rendered) {
    await insertAutomationAudit(
      ctx,
      operation,
      'skipped',
      `automation_type=auto_message_text;status=skipped;mode=${modeLabel};template_id=${templateIdForAudit ?? ''};board_id=${ctx.boardId};column_id=${ctx.columnId};card_id=${ctx.cardId};conversation_id=${ctx.conversationId};actor_user_id=${ctx.actorUserId};reason=empty_after_render`,
    );
    console.warn('[chatKanban] phase2 auto_message_text skipped (empty after render)', {
      conversationId: ctx.conversationId,
      columnId: ctx.columnId,
      mode: modeLabel,
      templateId: templateIdForAudit,
    });
    return;
  }

  const metaRoot = await loadConversationMetadataRoot(ctx.conversationId);
  const bucket = readKanbanAutoTextBucket(metaRoot);
  const lastForColumn = bucket.last_sent_epoch_ms_by_column?.[ctx.columnId];
  if (
    typeof lastForColumn === 'number' &&
    Date.now() - lastForColumn < KANBAN_AUTO_TEXT_SAME_COLUMN_DEBOUNCE_MS
  ) {
    await insertAutomationAudit(
      ctx,
      operation,
      'skipped',
      `automation_type=auto_message_text;status=skipped;mode=${modeLabel};template_id=${templateIdForAudit ?? ''};board_id=${ctx.boardId};column_id=${ctx.columnId};card_id=${ctx.cardId};conversation_id=${ctx.conversationId};actor_user_id=${ctx.actorUserId};reason=debounce_same_column_ms=${KANBAN_AUTO_TEXT_SAME_COLUMN_DEBOUNCE_MS}`,
    );
    console.log('[chatKanban] phase2 auto_message_text skipped (same-column debounce)', {
      conversationId: ctx.conversationId,
      columnId: ctx.columnId,
      mode: modeLabel,
    });
    return;
  }

  const sendResult = await sendKanbanAutomationOutboundText({
    actorUserId: ctx.actorUserId,
    conversationId: ctx.conversationId,
    text: rendered,
    automationRef: { boardId: ctx.boardId, columnId: ctx.columnId, cardId: ctx.cardId },
  });

  if (sendResult.ok) {
    const metaAfter = await loadConversationMetadataRoot(ctx.conversationId);
    await persistKanbanAutoTextColumnTimestamp(ctx.conversationId, ctx.columnId, metaAfter);
    await insertAutomationAudit(
      ctx,
      operation,
      'executed',
      `automation_type=auto_message_text;status=success;mode=${modeLabel};template_id=${templateIdForAudit ?? ''};board_id=${ctx.boardId};column_id=${ctx.columnId};card_id=${ctx.cardId};conversation_id=${ctx.conversationId};actor_user_id=${ctx.actorUserId};body_preview=${safeAuditSnippet(rendered)}`.slice(
        0,
        2000,
      ),
    );
    console.log('[chatKanban] phase2 auto_message_text success', {
      conversationId: ctx.conversationId,
      boardId: ctx.boardId,
      columnId: ctx.columnId,
      cardId: ctx.cardId,
      mode: modeLabel,
      templateId: templateIdForAudit,
    });
    return;
  }

  const err = sendResult.error ?? 'unknown';
  await insertAutomationAudit(
    ctx,
    operation,
    'failed',
    `automation_type=auto_message_text;status=failed;mode=${modeLabel};template_id=${templateIdForAudit ?? ''};board_id=${ctx.boardId};column_id=${ctx.columnId};card_id=${ctx.cardId};conversation_id=${ctx.conversationId};actor_user_id=${ctx.actorUserId};error=${safeAuditSnippet(err, 400)};body_preview=${safeAuditSnippet(rendered)}`.slice(
      0,
      2000,
    ),
  );
  console.error('[chatKanban] phase2 auto_message_text failed', {
    conversationId: ctx.conversationId,
    boardId: ctx.boardId,
    columnId: ctx.columnId,
    cardId: ctx.cardId,
    mode: modeLabel,
    templateId: templateIdForAudit,
    error: err,
  });
}

async function runKanbanWhatsappModelSequence(
  ctx: KanbanPhase2AutomationContext,
  parsed: ParsedKanbanPhase2,
): Promise<void> {
  const operation = 'kanban_phase2_whatsapp_model_sequence' as const;
  const templateId = parsed.notifications.auto_message_whatsapp_template_id;
  if (!templateId) {
    await insertAutomationAudit(
      ctx,
      operation,
      'skipped',
      `automation_type=whatsapp_model_sequence;status=skipped;reason=no_template_id;board_id=${ctx.boardId};column_id=${ctx.columnId};card_id=${ctx.cardId};conversation_id=${ctx.conversationId};actor_user_id=${ctx.actorUserId}`,
    );
    return;
  }

  const metaRoot = await loadConversationMetadataRoot(ctx.conversationId);
  const bucket = readKanbanAutoTextBucket(metaRoot);
  const lastForColumn = bucket.last_sent_epoch_ms_by_column?.[ctx.columnId];
  if (
    typeof lastForColumn === 'number' &&
    Date.now() - lastForColumn < KANBAN_AUTO_TEXT_SAME_COLUMN_DEBOUNCE_MS
  ) {
    await insertAutomationAudit(
      ctx,
      operation,
      'skipped',
      `automation_type=whatsapp_model_sequence;status=skipped;template_id=${templateId};board_id=${ctx.boardId};column_id=${ctx.columnId};card_id=${ctx.cardId};conversation_id=${ctx.conversationId};actor_user_id=${ctx.actorUserId};reason=debounce_same_column_ms=${KANBAN_AUTO_TEXT_SAME_COLUMN_DEBOUNCE_MS}`,
    );
    return;
  }

  const tmplCtx = await buildKanbanAutomationTemplateContext(ctx);
  const seqResult = await sendWhatsappModelSequence({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    conversationId: ctx.conversationId,
    templateId,
    templateContext: tmplCtx,
    mode: 'kanban',
    automationRef: { boardId: ctx.boardId, columnId: ctx.columnId, cardId: ctx.cardId },
  });

  if (!seqResult.ok && seqResult.error === 'template_not_found_or_inactive') {
    await insertAutomationAudit(
      ctx,
      operation,
      'skipped',
      `automation_type=whatsapp_model_sequence;status=skipped;reason=template_missing_or_inactive;template_id=${templateId};board_id=${ctx.boardId};column_id=${ctx.columnId};card_id=${ctx.cardId};conversation_id=${ctx.conversationId};actor_user_id=${ctx.actorUserId}`,
    );
    return;
  }

  if (seqResult.ok) {
    const metaAfter = await loadConversationMetadataRoot(ctx.conversationId);
    await persistKanbanAutoTextColumnTimestamp(ctx.conversationId, ctx.columnId, metaAfter);
    await insertAutomationAudit(
      ctx,
      operation,
      'executed',
      `automation_type=whatsapp_model_sequence;status=success;template_id=${templateId};board_id=${ctx.boardId};column_id=${ctx.columnId};card_id=${ctx.cardId};conversation_id=${ctx.conversationId};actor_user_id=${ctx.actorUserId}`.slice(
        0,
        2000,
      ),
    );
    return;
  }

  const metaAfterFail = await loadConversationMetadataRoot(ctx.conversationId);
  await persistKanbanAutoTextColumnTimestamp(ctx.conversationId, ctx.columnId, metaAfterFail);
  const err = seqResult.error ?? 'unknown';
  const failIdx = seqResult.failedItemIndex ?? -1;
  await insertAutomationAudit(
    ctx,
    operation,
    'failed',
    `automation_type=whatsapp_model_sequence;status=failed;template_id=${templateId};board_id=${ctx.boardId};column_id=${ctx.columnId};card_id=${ctx.cardId};conversation_id=${ctx.conversationId};actor_user_id=${ctx.actorUserId};failed_item_index=${failIdx};error=${safeAuditSnippet(err, 400)}`.slice(
      0,
      2000,
    ),
  );
  console.error('[chatKanban] whatsapp_model_sequence failed', {
    conversationId: ctx.conversationId,
    templateId,
    error: err,
    failedItemIndex: failIdx,
  });
}

export async function runKanbanPhase2Automations(
  ctx: KanbanPhase2AutomationContext,
): Promise<{ attempted: boolean; foundation?: boolean }> {
  const subjectKind = ctx.subjectKind ?? 'conversation';

  if (subjectKind === 'acquisition_lead') {
    return runKanbanPhase2AutomationsFoundation(ctx);
  }

  const parsed = parseKanbanPhase2(ctx.columnMetadata);
  if (parsed.version !== 1) return { attempted: false };
  const shouldNotifyOperator = parsed.notifications.notify_operator;
  const shouldNotifyTeam = parsed.notifications.notify_team;
  const webhookEnabled = parsed.webhook.enabled;
  const autoTextOn = parsed.notifications.auto_message_enabled === true;
  if (!shouldNotifyOperator && !shouldNotifyTeam && !webhookEnabled && !autoTextOn) return { attempted: false };

  const dedupe = new Set<string>();
  if (shouldNotifyOperator) {
    await notifyOperator(ctx, dedupe);
  }
  if (shouldNotifyTeam) {
    await notifyTeamMembers(ctx, dedupe);
  }

  if (autoTextOn) {
    if (parsed.notifications.auto_message_mode === 'whatsapp_model') {
      await runKanbanWhatsappModelSequence(ctx, parsed);
    } else {
      await runKanbanAutoOutboundText(ctx, parsed);
    }
  }

  const webhookCfg = parseWebhookConfig(ctx);
  if (!webhookCfg.enabled) {
    await insertAutomationAudit(
      ctx,
      'kanban_phase2_webhook_outbound',
      'skipped',
      'status=skipped;reason=disabled',
    );
    return { attempted: true };
  }
  if (!webhookCfg.url) {
    await insertAutomationAudit(
      ctx,
      'kanban_phase2_webhook_outbound',
      'skipped',
      'status=skipped;reason=invalid_or_missing_url',
    );
    return { attempted: true };
  }
  if (!webhookCfg.nonBlocking) {
    await insertAutomationAudit(
      ctx,
      'kanban_phase2_webhook_outbound',
      'skipped',
      'status=skipped;reason=non_blocking_required',
    );
    return { attempted: true };
  }

  const payload = buildWebhookPayload(ctx);
  const payloadText = JSON.stringify(payload);
  const headers = buildWebhookHeaders(ctx, payloadText, webhookCfg);
  const result = await sendOutboundWebhook(webhookCfg, payloadText, headers);
  if (result.status === 'success') {
    await insertAutomationAudit(
      ctx,
      'kanban_phase2_webhook_outbound',
      'executed',
      `status=success;url=${webhookCfg.url};http_status=${result.httpStatus}`,
    );
  } else {
    await insertAutomationAudit(
      ctx,
      'kanban_phase2_webhook_outbound',
      'failed',
      `status=failed;url=${webhookCfg.url};http_status=${result.httpStatus ?? 'none'};error=${result.error ?? 'unknown'}`,
    );
    console.error('[chatKanban] phase2 webhook outbound failed', {
      conversationId: ctx.conversationId,
      cardId: ctx.cardId,
      boardId: ctx.boardId,
      columnId: ctx.columnId,
      url: webhookCfg.url,
      httpStatus: result.httpStatus,
      error: result.error,
    });
  }
  return { attempted: true };
}

function logKanbanPhase2Foundation(ctx: KanbanPhase2AutomationContext, extra: Record<string, unknown>): void {
  console.info('[kanban_phase2_foundation]', {
    subject_kind: 'acquisition_lead',
    column_id: ctx.columnId,
    column_name: ctx.columnName,
    card_id: ctx.cardId,
    acquisition_lead_id: ctx.acquisitionLeadId ?? null,
    correlation_id: ctx.correlationId ?? null,
    tenant_id: ctx.tenantId,
    ...extra,
  });
}

/**
 * Sprint 3.1 — acquisition lead: atravessa phase2 sem side effects (mensagem, webhook, notify).
 */
async function runKanbanPhase2AutomationsFoundation(
  ctx: KanbanPhase2AutomationContext,
): Promise<{ attempted: boolean; foundation: true }> {
  const parsed = parseKanbanPhase2(ctx.columnMetadata);
  const meta =
    ctx.columnMetadata && typeof ctx.columnMetadata === 'object' && !Array.isArray(ctx.columnMetadata)
      ? (ctx.columnMetadata as Record<string, unknown>)
      : {};
  const automationConfigEnabled =
    meta.automation_config &&
    typeof meta.automation_config === 'object' &&
    !Array.isArray(meta.automation_config) &&
    (meta.automation_config as { enabled?: boolean }).enabled === true;

  const wouldNotifyOperator = parsed.notifications.notify_operator;
  const wouldNotifyTeam = parsed.notifications.notify_team;
  const wouldWebhook = parsed.webhook.enabled;
  const wouldAutoText = parsed.notifications.auto_message_enabled === true;
  const wouldCrm = parsed.crm.enabled || parsed.crm.auto_link_or_create_lead;
  const wouldTask = parsed.productivity.auto_create_task;
  const wouldAutoMove = parsed.automations.auto_move_by_time.enabled;

  const hasConfiguredAction =
    automationConfigEnabled ||
    wouldNotifyOperator ||
    wouldNotifyTeam ||
    wouldWebhook ||
    wouldAutoText ||
    wouldCrm ||
    wouldTask ||
    wouldAutoMove;

  logKanbanPhase2Foundation(ctx, {
    automation_config_enabled: automationConfigEnabled,
    would_notify_operator: wouldNotifyOperator,
    would_notify_team: wouldNotifyTeam,
    would_webhook: wouldWebhook,
    would_auto_message: wouldAutoText,
    would_crm: wouldCrm,
    would_task: wouldTask,
    would_auto_move: wouldAutoMove,
    side_effects: 'deferred',
  });

  return {
    attempted: Boolean(hasConfiguredAction || parsed.version === 1),
    foundation: true,
  };
}
