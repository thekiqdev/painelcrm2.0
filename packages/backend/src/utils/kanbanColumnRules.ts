/**
 * Regras operacionais ao entrar numa coluna do Kanban (metadata.kanban_column_rules).
 * Política P1: não altera CRM/funil; só efeitos em chat_conversations (atendimento).
 */
import type { PoolClient } from 'pg';
import { emitConversationAttendanceUpdated } from '../services/websocketService.js';
import { hasAssignedTeamColumn, hasAttendanceColumns } from './chatAttendanceSchema.js';
import { isTenantAdmin } from './tenant.js';

const PRIORITIES = new Set(['low', 'medium', 'high']);

export type KanbanColumnRulesInput = {
  close_conversation?: boolean;
  clear_assignee?: boolean;
  send_to_queue?: boolean;
  assign_team_id?: string | null;
  assign_user_id?: string | null;
  require_move_reason?: boolean;
  require_confirmation?: boolean;
  is_terminal?: boolean;
  add_tag_label?: string | null;
  remove_tag_label?: string | null;
  conversation_priority?: 'low' | 'medium' | 'high' | null;
};

export type ParsedKanbanColumnRules = {
  close_conversation: boolean;
  clear_assignee: boolean;
  send_to_queue: boolean;
  assign_team_id: string | null;
  assign_user_id: string | null;
  require_move_reason: boolean;
  require_confirmation: boolean;
  is_terminal: boolean;
  add_tag_label: string | null;
  remove_tag_label: string | null;
  conversation_priority: 'low' | 'medium' | 'high' | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseKanbanColumnRules(metadata: unknown): ParsedKanbanColumnRules {
  const empty: ParsedKanbanColumnRules = {
    close_conversation: false,
    clear_assignee: false,
    send_to_queue: false,
    assign_team_id: null,
    assign_user_id: null,
    require_move_reason: false,
    require_confirmation: false,
    is_terminal: false,
    add_tag_label: null,
    remove_tag_label: null,
    conversation_priority: null,
  };
  if (!metadata || typeof metadata !== 'object') return empty;
  const root = metadata as Record<string, unknown>;
  const raw = root.kanban_column_rules;
  if (!raw || typeof raw !== 'object') return empty;
  const r = raw as Record<string, unknown>;
  let assignTeam: string | null = null;
  if (typeof r.assign_team_id === 'string' && UUID_RE.test(r.assign_team_id)) {
    assignTeam = r.assign_team_id;
  }
  let assignUser: string | null = null;
  if (typeof r.assign_user_id === 'string' && UUID_RE.test(r.assign_user_id)) {
    assignUser = r.assign_user_id;
  }
  let prio: 'low' | 'medium' | 'high' | null = null;
  if (typeof r.conversation_priority === 'string' && PRIORITIES.has(r.conversation_priority)) {
    prio = r.conversation_priority as 'low' | 'medium' | 'high';
  }
  let addTag: string | null = null;
  if (typeof r.add_tag_label === 'string') {
    const t = r.add_tag_label.trim().slice(0, 64);
    if (t.length > 0) addTag = t;
  }
  let remTag: string | null = null;
  if (typeof r.remove_tag_label === 'string') {
    const t = r.remove_tag_label.trim().slice(0, 64);
    if (t.length > 0) remTag = t;
  }
  const closeConversation = r.close_conversation === true;
  const clearAssignee = r.clear_assignee === true;
  const sendQueue = r.send_to_queue === true;
  /** Incompatível com atribuir equipe/operador (encerrar, limpar responsável ou fila geral). */
  const blocksAssignTargets = closeConversation || clearAssignee || sendQueue;

  return {
    close_conversation: closeConversation,
    clear_assignee: clearAssignee,
    send_to_queue: sendQueue,
    assign_team_id: blocksAssignTargets ? null : assignTeam,
    assign_user_id: blocksAssignTargets ? null : assignUser,
    require_move_reason: r.require_move_reason === true,
    require_confirmation: r.require_confirmation === true,
    is_terminal: r.is_terminal === true,
    add_tag_label: addTag,
    remove_tag_label: remTag,
    conversation_priority: prio,
  };
}

export function kanbanRulesRequireAttendanceMutation(rules: ParsedKanbanColumnRules): boolean {
  return (
    rules.close_conversation ||
    !!rules.assign_team_id ||
    !!rules.assign_user_id ||
    rules.send_to_queue ||
    rules.clear_assignee
  );
}

export function kanbanRulesRequireOrganizationMutation(rules: ParsedKanbanColumnRules): boolean {
  return !!(
    rules.add_tag_label ||
    rules.remove_tag_label ||
    rules.conversation_priority != null
  );
}

type LockedConv = {
  id: string;
  user_id: string;
  attendance_status: string;
  assigned_to_user_id: string | null;
  queue_id: string | null;
  assigned_team_id: string | null;
  closed_at: Date | null;
  owner_tenant_id: string | null;
};

async function lockConversationRow(
  client: PoolClient,
  conversationId: string,
  hasTeamCol: boolean
): Promise<LockedConv | null> {
  const teamSel = hasTeamCol ? 'c.assigned_team_id' : 'NULL::uuid AS assigned_team_id';
  const r = await client.query<LockedConv>(
    `SELECT c.id, c.user_id, c.attendance_status, c.assigned_to_user_id, c.queue_id, c.closed_at,
            ${teamSel},
            owner.tenant_id AS owner_tenant_id
     FROM chat_conversations c
     INNER JOIN users owner ON owner.id = c.user_id
     WHERE c.id = $1
     FOR UPDATE`,
    [conversationId]
  );
  return r.rows[0] ?? null;
}

async function loadActorTenant(client: PoolClient, actorUserId: string): Promise<string | null> {
  const r = await client.query<{ tenant_id: string | null }>(
    `SELECT tenant_id FROM users WHERE id = $1 LIMIT 1`,
    [actorUserId]
  );
  return r.rows[0]?.tenant_id ?? null;
}

function tenantAccessOk(
  ownerTenantId: string | null,
  conversationOwnerUserId: string,
  actorUserId: string,
  actorTenantId: string | null
): boolean {
  if (ownerTenantId != null && actorTenantId != null && ownerTenantId === actorTenantId) return true;
  if (ownerTenantId == null && conversationOwnerUserId === actorUserId) return true;
  return false;
}

async function assertTargetTeamSameTenant(
  client: PoolClient,
  teamId: string,
  ownerTenantId: string | null
): Promise<boolean> {
  if (ownerTenantId == null) return false;
  const r = await client.query(`SELECT 1 FROM teams WHERE id = $1 AND tenant_id = $2`, [
    teamId,
    ownerTenantId,
  ]);
  return (r.rowCount ?? 0) > 0;
}

async function assertTargetUserSameTenant(
  client: PoolClient,
  targetUserId: string,
  ownerTenantId: string | null,
  conversationOwnerUserId: string
): Promise<boolean> {
  const r = await client.query<{ tenant_id: string | null }>(
    `SELECT tenant_id FROM users WHERE id = $1 LIMIT 1`,
    [targetUserId]
  );
  const t = r.rows[0]?.tenant_id ?? null;
  if (ownerTenantId != null) return t != null && t === ownerTenantId;
  return targetUserId === conversationOwnerUserId;
}

async function insertAssignmentHistory(
  client: PoolClient,
  row: {
    conversation_id: string;
    tenant_id: string | null;
    from_status: string | null;
    to_status: string;
    from_user_id: string | null;
    to_user_id: string | null;
    queue_id: string | null;
    actor_user_id: string;
    operation: string;
    reason: string | null;
    to_team_id?: string | null;
  }
) {
  await client.query(
    `INSERT INTO chat_conversation_assignment_history (
      conversation_id, tenant_id, from_status, to_status, from_user_id, to_user_id, queue_id, actor_user_id, operation, reason, to_team_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      row.conversation_id,
      row.tenant_id,
      row.from_status,
      row.to_status,
      row.from_user_id,
      row.to_user_id,
      row.queue_id,
      row.actor_user_id,
      row.operation,
      row.reason,
      row.to_team_id ?? null,
    ]
  );
}

function attendancePatchFromRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    attendance_status: row.attendance_status,
    assigned_to_user_id: row.assigned_to_user_id,
    queue_id: row.queue_id,
    assigned_team_id: row.assigned_team_id ?? null,
    assigned_at: row.assigned_at,
    closed_at: row.closed_at,
    last_assignment_reason: row.last_assignment_reason,
  };
}

/**
 * Aplica efeitos de regras ao entrar na coluna (transação já aberta; não faz COMMIT).
 * @returns patch parcial para WebSocket e contexto de emissão quando alterou atendimento
 */
export async function applyKanbanColumnEnterRules(
  client: PoolClient,
  opts: {
    conversationId: string;
    actorUserId: string;
    rules: ParsedKanbanColumnRules;
    columnName: string;
    columnId: string;
    moveReason: string | null;
  }
): Promise<{
  attendancePatch: Record<string, unknown> | null;
  emit?: { tenantId: string | null; ownerUserId: string };
}> {
  if (!kanbanRulesRequireAttendanceMutation(opts.rules)) {
    return { attendancePatch: null };
  }

  if (!(await hasAttendanceColumns())) {
    const err = new Error(
      'Aplique a migration de atendimento (Etapa 5) para usar regras desta coluna.'
    );
    (err as Error & { code?: string }).code = 'CHAT_ATTENDANCE_MIGRATION_REQUIRED';
    throw err;
  }

  const hasTeamCol = await hasAssignedTeamColumn();
  const prev = await lockConversationRow(client, opts.conversationId, hasTeamCol);
  if (!prev) {
    const err = new Error('Conversa não encontrada');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }

  const actorTenantId = await loadActorTenant(client, opts.actorUserId);
  if (!tenantAccessOk(prev.owner_tenant_id, prev.user_id, opts.actorUserId, actorTenantId)) {
    const err = new Error('Sem permissão para alterar esta conversa');
    (err as Error & { code?: string }).code = 'FORBIDDEN';
    throw err;
  }

  const isOwner = prev.user_id === opts.actorUserId;
  const isAssignee = prev.assigned_to_user_id === opts.actorUserId;

  if (opts.rules.assign_team_id && !hasTeamCol) {
    const err = new Error(
      'A regra de atribuir equipe requer a migration com coluna assigned_team_id em chat_conversations.'
    );
    (err as Error & { code?: string }).code = 'BAD_REQUEST';
    throw err;
  }

  let nextStatus: string;
  let nextAssigned: string | null = prev.assigned_to_user_id;
  let nextQueue: string | null = prev.queue_id;
  let nextTeam: string | null = hasTeamCol ? prev.assigned_team_id : null;
  let nextClosedAt: Date | null = prev.closed_at;
  let operation: string;

  const summaryParts: string[] = [`Kanban → ${opts.columnName}`];
  if (opts.moveReason) summaryParts.push(`Motivo: ${opts.moveReason}`);
  const summaryReason = summaryParts.join(' · ').slice(0, 500);

  if (opts.rules.close_conversation) {
    const actorIsTenantAdmin = await isTenantAdmin(opts.actorUserId);
    if (!isOwner && !isAssignee && !actorIsTenantAdmin) {
      const err = new Error(
        'Só o dono da conversa, o atendente atual ou um administrador da empresa pode encerrar ao mover no Kanban'
      );
      (err as Error & { code?: string }).code = 'FORBIDDEN';
      throw err;
    }
    nextStatus = 'closed';
    nextClosedAt = new Date();
    nextAssigned = null;
    nextQueue = null;
    nextTeam = null;
    operation = 'kanban_close';
  } else if (opts.rules.assign_team_id && hasTeamCol) {
    const okTeam = await assertTargetTeamSameTenant(client, opts.rules.assign_team_id, prev.owner_tenant_id);
    if (!okTeam) {
      const err = new Error('Equipe configurada na coluna é inválida ou não pertence à empresa');
      (err as Error & { code?: string }).code = 'BAD_REQUEST';
      throw err;
    }
    const actorIsTenantAdmin = await isTenantAdmin(opts.actorUserId);
    if (!isOwner && !isAssignee && !actorIsTenantAdmin) {
      const err = new Error('Sem permissão para transferir esta conversa para equipe ao mover no Kanban');
      (err as Error & { code?: string }).code = 'FORBIDDEN';
      throw err;
    }
    nextStatus = 'queued';
    nextAssigned = null;
    nextQueue = null;
    nextTeam = opts.rules.assign_team_id;
    nextClosedAt = null;
    operation = 'kanban_assign_team';
  } else if (opts.rules.assign_user_id) {
    const okUser = await assertTargetUserSameTenant(
      client,
      opts.rules.assign_user_id,
      prev.owner_tenant_id,
      prev.user_id
    );
    if (!okUser) {
      const err = new Error('Operador configurado na coluna é inválido ou não pertence à empresa');
      (err as Error & { code?: string }).code = 'BAD_REQUEST';
      throw err;
    }
    const actorIsTenantAdminU = await isTenantAdmin(opts.actorUserId);
    if (!isOwner && !isAssignee && !actorIsTenantAdminU) {
      const err = new Error('Sem permissão para atribuir operador ao mover no Kanban');
      (err as Error & { code?: string }).code = 'FORBIDDEN';
      throw err;
    }
    nextStatus = 'in_service';
    nextAssigned = opts.rules.assign_user_id;
    nextQueue = null;
    nextTeam = null;
    nextClosedAt = null;
    operation = 'kanban_assign_user';
  } else if (opts.rules.send_to_queue) {
    if (prev.owner_tenant_id == null && !isOwner) {
      const err = new Error('Apenas o dono pode enfileirar neste contexto');
      (err as Error & { code?: string }).code = 'FORBIDDEN';
      throw err;
    }
    nextStatus = 'queued';
    nextAssigned = null;
    nextQueue = null;
    nextTeam = null;
    nextClosedAt = null;
    operation = 'kanban_queue';
  } else if (opts.rules.clear_assignee) {
    const actorIsTenantAdminUa = await isTenantAdmin(opts.actorUserId);
    if (!isOwner && !isAssignee && !actorIsTenantAdminUa) {
      const err = new Error('Sem permissão para limpar responsável ao mover no Kanban');
      (err as Error & { code?: string }).code = 'FORBIDDEN';
      throw err;
    }
    nextStatus = 'unassigned';
    nextAssigned = null;
    nextQueue = null;
    nextTeam = null;
    nextClosedAt = null;
    operation = 'kanban_clear_assignee';
  } else {
    return { attendancePatch: null };
  }

  const emitCtx = { tenantId: prev.owner_tenant_id, ownerUserId: prev.user_id };

  const lastReason = summaryReason || operation;

  let upd: import('pg').QueryResult<Record<string, unknown>>;
  if (hasTeamCol) {
    upd = await client.query(
      `UPDATE chat_conversations
 SET attendance_status = $2::text,
           assigned_to_user_id = $3,
           queue_id = $4,
           assigned_team_id = $5,
           closed_at = $6,
           last_assignment_reason = $7,
           assigned_at = CASE
             WHEN $3::uuid IS NULL THEN NULL
             WHEN $3::uuid IS DISTINCT FROM $8::uuid THEN now()
             ELSE assigned_at
           END,
           updated_at = now()
       WHERE id = $1
       RETURNING id, user_id, attendance_status, assigned_to_user_id, queue_id, assigned_team_id, assigned_at, closed_at, last_assignment_reason`,
      [
        opts.conversationId,
        nextStatus,
        nextAssigned,
        nextQueue,
        nextTeam,
        nextClosedAt,
        lastReason,
        prev.assigned_to_user_id,
      ]
    );
  } else {
    upd = await client.query(
      `UPDATE chat_conversations
       SET attendance_status = $2::text,
           assigned_to_user_id = $3,
           queue_id = $4,
           closed_at = $5,
           last_assignment_reason = $6,
           assigned_at = CASE
             WHEN $3::uuid IS NULL THEN NULL
             WHEN $3::uuid IS DISTINCT FROM $7::uuid THEN now()
             ELSE assigned_at
           END,
           updated_at = now()
       WHERE id = $1
       RETURNING id, user_id, attendance_status, assigned_to_user_id, queue_id, assigned_at, closed_at, last_assignment_reason`,
      [
        opts.conversationId,
        nextStatus,
        nextAssigned,
        nextQueue,
        nextClosedAt,
        lastReason,
        prev.assigned_to_user_id,
      ]
    );
  }

  const row = upd.rows[0];
  const histReason = [
    opts.moveReason ? `motivo:${opts.moveReason}` : null,
    `coluna:${opts.columnId}`,
    `regra:${operation}`,
  ]
    .filter(Boolean)
    .join(' | ')
    .slice(0, 2000);

  await insertAssignmentHistory(client, {
    conversation_id: opts.conversationId,
    tenant_id: prev.owner_tenant_id,
    from_status: prev.attendance_status,
    to_status: nextStatus,
    from_user_id: prev.assigned_to_user_id,
    to_user_id: nextAssigned,
    queue_id: nextQueue,
    actor_user_id: opts.actorUserId,
    operation,
    reason: histReason || null,
    to_team_id: operation === 'kanban_assign_team' ? opts.rules.assign_team_id : null,
  });

  return { attendancePatch: attendancePatchFromRow(row), emit: emitCtx };
}

/**
 * Etiquetas e prioridade em `chat_conversations.metadata` (kanban_labels[], kanban_priority).
 * Não altera CRM; transação já aberta.
 */
export async function applyKanbanColumnOrganizationRules(
  client: PoolClient,
  opts: {
    conversationId: string;
    actorUserId: string;
    rules: ParsedKanbanColumnRules;
    columnId: string;
    columnName: string;
    moveReason: string | null;
  }
): Promise<void> {
  if (!kanbanRulesRequireOrganizationMutation(opts.rules)) return;

  const acc = await client.query(
    `SELECT 1 FROM chat_conversations c
     INNER JOIN users owner ON owner.id = c.user_id
     INNER JOIN users actor ON actor.id = $2
     WHERE c.id = $1 AND (
       (owner.tenant_id IS NOT NULL AND actor.tenant_id IS NOT NULL AND owner.tenant_id = actor.tenant_id)
       OR (owner.tenant_id IS NULL AND c.user_id = $2)
     )
     LIMIT 1`,
    [opts.conversationId, opts.actorUserId]
  );
  if (acc.rows.length === 0) {
    const err = new Error('Sem permissão para alterar esta conversa');
    (err as Error & { code?: string }).code = 'FORBIDDEN';
    throw err;
  }

  const row = await client.query<{ metadata: unknown }>(
    `SELECT metadata FROM chat_conversations WHERE id = $1 FOR UPDATE`,
    [opts.conversationId]
  );
  if (!row.rows[0]) {
    const err = new Error('Conversa não encontrada');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }

  const rawMeta = row.rows[0].metadata;
  const meta: Record<string, unknown> =
    rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)
      ? { ...(rawMeta as Record<string, unknown>) }
      : {};

  let labels: string[] = Array.isArray(meta.kanban_labels)
    ? (meta.kanban_labels as unknown[]).map((x) => String(x))
    : [];

  const add = opts.rules.add_tag_label;
  const rem = opts.rules.remove_tag_label;
  if (add) {
    const low = add.toLowerCase();
    if (!labels.some((l) => l.toLowerCase() === low)) labels = [...labels, add];
  }
  if (rem) {
    const low = rem.toLowerCase();
    labels = labels.filter((l) => l.toLowerCase() !== low);
  }
  meta.kanban_labels = labels;

  if (opts.rules.conversation_priority != null) {
    meta.kanban_priority = opts.rules.conversation_priority;
  }

  await client.query(
    `UPDATE chat_conversations SET metadata = $2::jsonb, updated_at = now() WHERE id = $1`,
    [opts.conversationId, JSON.stringify(meta)]
  );
}

export function emitKanbanAttendanceIfNeeded(
  ownerTenantId: string | null,
  ownerUserId: string,
  patch: Record<string, unknown> | null
): void {
  if (!patch) return;
  emitConversationAttendanceUpdated(ownerTenantId, ownerUserId, patch);
}
