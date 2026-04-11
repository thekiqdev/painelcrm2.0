import { Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { emitConversationAttendanceUpdated } from '../services/websocketService.js';
import { hasAssignedTeamColumn, hasAttendanceColumns } from '../utils/chatAttendanceSchema.js';
import { isTenantAdmin } from '../utils/tenant.js';

function respondAttendanceMigrationRequired(res: Response): void {
  res.status(503).json({
    error:
      'Módulo de atendimento (Etapa 5) não está aplicado na base de dados. Execute a migration: database/init/96_chat_conversations_attendance_etapa5.sql (e, se ainda não correu, 97_rls_chat_app_actor_visibility.sql).',
    code: 'CHAT_ATTENDANCE_MIGRATION_REQUIRED',
  });
}

const attendanceStatusSchema = z.enum(['unassigned', 'queued', 'in_service', 'closed']);

const patchAttendanceSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('queue'),
    queueId: z.string().uuid().nullable().optional(),
    reason: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('close'),
    reason: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('unassign'),
    reason: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('reassign'),
    toUserId: z.string().uuid(),
    reason: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('reassign_team'),
    toTeamId: z.string().uuid(),
    reason: z.string().max(500).optional(),
  }),
]);

type LockedConversation = {
  id: string;
  user_id: string;
  attendance_status: string;
  assigned_to_user_id: string | null;
  queue_id: string | null;
  assigned_team_id: string | null;
  closed_at: Date | null;
  owner_tenant_id: string | null;
};

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

async function insertAssignmentHistory(
  client: import('pg').PoolClient,
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

async function loadActorTenant(client: import('pg').PoolClient, actorUserId: string): Promise<string | null> {
  const r = await client.query<{ tenant_id: string | null }>(
    `SELECT tenant_id FROM users WHERE id = $1 LIMIT 1`,
    [actorUserId]
  );
  return r.rows[0]?.tenant_id ?? null;
}

async function assertTargetUserSameTenant(
  client: import('pg').PoolClient,
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

async function assertTargetTeamSameTenant(
  client: import('pg').PoolClient,
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

async function lockConversationRow(
  client: import('pg').PoolClient,
  conversationId: string,
  hasTeamCol: boolean
): Promise<LockedConversation | null> {
  const teamSel = hasTeamCol ? 'c.assigned_team_id' : 'NULL::uuid AS assigned_team_id';
  const r = await client.query<LockedConversation>(
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

/** Payload parcial para WebSocket (merge no cliente). */
function attendancePatchFromRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    attendance_status: row.attendance_status,
    assigned_to_user_id: row.assigned_to_user_id,
    queue_id: row.queue_id,
    assigned_team_id: row.assigned_team_id ?? null,
    assigned_team_name: row.assigned_team_name ?? null,
    assigned_at: row.assigned_at,
    closed_at: row.closed_at,
    last_assignment_reason: row.last_assignment_reason,
    assignee_email: row.assignee_email,
    assignee_display: row.assignee_display,
  };
}

export async function attendConversation(req: AuthRequest, res: Response) {
  if (!(await hasAttendanceColumns())) {
    respondAttendanceMigrationRequired(res);
    return;
  }
  const actorUserId = req.userId!;
  const { id: conversationId } = req.params;
  const reason =
    typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim().slice(0, 500) : null;

  const hasTeamCol = await hasAssignedTeamColumn();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prev = await lockConversationRow(client, conversationId, hasTeamCol);
    if (!prev) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    const actorTenantId = await loadActorTenant(client, actorUserId);
    if (!tenantAccessOk(prev.owner_tenant_id, prev.user_id, actorUserId, actorTenantId)) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'Sem permissão para atender esta conversa' });
      return;
    }

    if (hasTeamCol && prev.assigned_team_id) {
      const member = await client.query(
        `SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`,
        [prev.assigned_team_id, actorUserId]
      );
      const adminOk = await isTenantAdmin(actorUserId);
      if ((member.rowCount ?? 0) === 0 && !adminOk) {
        await client.query('ROLLBACK');
        res.status(403).json({ error: 'Apenas membros desta equipe podem assumir esta conversa' });
        return;
      }
    }

    if (
      prev.attendance_status === 'in_service' &&
      prev.assigned_to_user_id != null &&
      prev.assigned_to_user_id !== actorUserId
    ) {
      await client.query('ROLLBACK');
      res.status(409).json({
        error: 'Conversa já está em atendimento por outro usuário',
        code: 'ATTENDANCE_CONFLICT',
      });
      return;
    }

    const clearTeam = hasTeamCol ? ', assigned_team_id = NULL' : '';
    const upd = await client.query(
      `UPDATE chat_conversations
       SET attendance_status = 'in_service',
           assigned_to_user_id = $2,
           assigned_at = now(),
           closed_at = NULL,
           last_assignment_reason = COALESCE($3, 'attend'),
           updated_at = now()
           ${clearTeam}
       WHERE id = $1
       RETURNING id, user_id, attendance_status, assigned_to_user_id, queue_id, assigned_at, closed_at, last_assignment_reason${
         hasTeamCol ? ', assigned_team_id' : ''
       }`,
      [conversationId, actorUserId, reason]
    );

    const row = upd.rows[0];
    await insertAssignmentHistory(client, {
      conversation_id: conversationId,
      tenant_id: prev.owner_tenant_id,
      from_status: prev.attendance_status,
      to_status: 'in_service',
      from_user_id: prev.assigned_to_user_id,
      to_user_id: actorUserId,
      queue_id: prev.queue_id,
      actor_user_id: actorUserId,
      operation: 'attend',
      reason,
    });

    await client.query('COMMIT');

    const assignee = await pool.query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [actorUserId]);
    const patch = attendancePatchFromRow({
      ...row,
      assignee_email: assignee.rows[0]?.email ?? null,
      assignee_display: assignee.rows[0]?.email ?? null,
    });
    emitConversationAttendanceUpdated(prev.owner_tenant_id, prev.user_id, patch);
    res.json({ ok: true, conversation: patch });
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error('[attendConversation]', e);
    res.status(500).json({ error: e.message || 'Falha ao atender' });
  } finally {
    client.release();
  }
}

export async function patchConversationAttendance(req: AuthRequest, res: Response) {
  if (!(await hasAttendanceColumns())) {
    respondAttendanceMigrationRequired(res);
    return;
  }
  const hasTeamCol = await hasAssignedTeamColumn();
  const actorUserId = req.userId!;
  const { id: conversationId } = req.params;
  const parsed = patchAttendanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prev = await lockConversationRow(client, conversationId, hasTeamCol);
    if (!prev) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    const actorTenantId = await loadActorTenant(client, actorUserId);
    if (!tenantAccessOk(prev.owner_tenant_id, prev.user_id, actorUserId, actorTenantId)) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }

    const isOwner = prev.user_id === actorUserId;
    const isAssignee = prev.assigned_to_user_id === actorUserId;

    let nextStatus: string;
    let nextAssigned: string | null = prev.assigned_to_user_id;
    let nextQueue: string | null = prev.queue_id;
    let nextTeam: string | null = hasTeamCol ? prev.assigned_team_id : null;
    let nextClosedAt: Date | null = prev.closed_at;
    let operation: string;
    let reason: string | null = 'reason' in body && body.reason ? body.reason : null;

    if (body.action === 'queue') {
      if (prev.owner_tenant_id == null && !isOwner) {
        await client.query('ROLLBACK');
        res.status(403).json({ error: 'Apenas o dono da instância pode enfileirar neste contexto' });
        return;
      }
      if (prev.owner_tenant_id != null && !tenantAccessOk(prev.owner_tenant_id, prev.user_id, actorUserId, actorTenantId)) {
        await client.query('ROLLBACK');
        res.status(403).json({ error: 'Sem permissão' });
        return;
      }
      nextStatus = 'queued';
      nextQueue = body.queueId ?? null;
      nextClosedAt = null;
      nextTeam = null;
      operation = 'queue';
    } else if (body.action === 'close') {
      const actorIsTenantAdmin = await isTenantAdmin(actorUserId);
      if (!isOwner && !isAssignee && !actorIsTenantAdmin) {
        await client.query('ROLLBACK');
        res.status(403).json({
          error: 'Só o dono da conversa, o atendente atual ou um administrador do tenant pode encerrar',
        });
        return;
      }
      nextStatus = 'closed';
      nextClosedAt = new Date();
      nextAssigned = null;
      nextQueue = null;
      nextTeam = null;
      operation = 'close';
    } else if (body.action === 'unassign') {
      const actorIsTenantAdminUa = await isTenantAdmin(actorUserId);
      if (!isOwner && !isAssignee && !actorIsTenantAdminUa) {
        await client.query('ROLLBACK');
        res.status(403).json({ error: 'Só o dono ou o atendente atual pode desatribuir' });
        return;
      }
      nextStatus = 'unassigned';
      nextAssigned = null;
      nextQueue = null;
      nextTeam = null;
      nextClosedAt = null;
      operation = 'unassign';
    } else if (body.action === 'reassign') {
      const okTarget = await assertTargetUserSameTenant(
        client,
        body.toUserId,
        prev.owner_tenant_id,
        prev.user_id
      );
      if (!okTarget) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Usuário alvo inválido ou fora do tenant' });
        return;
      }
      const actorIsTenantAdminRs = await isTenantAdmin(actorUserId);
      if (!isOwner && prev.assigned_to_user_id !== actorUserId && !actorIsTenantAdminRs) {
        await client.query('ROLLBACK');
        res.status(403).json({
          error: 'Só o responsável atual, o dono da conversa ou um administrador do tenant pode transferir',
        });
        return;
      }
      nextStatus = 'in_service';
      nextAssigned = body.toUserId;
      nextClosedAt = null;
      nextTeam = null;
      operation = 'transfer';
    } else {
      if (!hasTeamCol) {
        await client.query('ROLLBACK');
        respondAttendanceMigrationRequired(res);
        return;
      }
      const okTeam = await assertTargetTeamSameTenant(client, body.toTeamId, prev.owner_tenant_id);
      if (!okTeam) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Equipe inválida ou fora do tenant' });
        return;
      }
      const actorIsTenantAdminRs = await isTenantAdmin(actorUserId);
      if (!isOwner && prev.assigned_to_user_id !== actorUserId && !actorIsTenantAdminRs) {
        await client.query('ROLLBACK');
        res.status(403).json({
          error: 'Só o responsável atual, o dono da conversa ou um administrador do tenant pode transferir',
        });
        return;
      }
      nextStatus = 'queued';
      nextAssigned = null;
      nextQueue = null;
      nextTeam = body.toTeamId;
      nextClosedAt = null;
      operation = 'transfer_team';
    }

    const lastReason = reason || operation;
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
          conversationId,
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
          conversationId,
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
    const histToTeam = body.action === 'reassign_team' ? body.toTeamId : null;
    await insertAssignmentHistory(client, {
      conversation_id: conversationId,
      tenant_id: prev.owner_tenant_id,
      from_status: prev.attendance_status,
      to_status: nextStatus,
      from_user_id: prev.assigned_to_user_id,
      to_user_id: nextAssigned,
      queue_id: nextQueue,
      actor_user_id: actorUserId,
      operation,
      reason: lastReason,
      to_team_id: histToTeam,
    });

    await client.query('COMMIT');

    let assigneeEmail: string | null = null;
    let assigneeDisplay: string | null = null;
    if (row.assigned_to_user_id) {
      const u = await pool.query<{ email: string }>(
        `SELECT email FROM users WHERE id = $1`,
        [row.assigned_to_user_id]
      );
      assigneeEmail = u.rows[0]?.email ?? null;
      assigneeDisplay = assigneeEmail;
    }

    let teamName: string | null = null;
    if (hasTeamCol && row.assigned_team_id) {
      const tn = await pool.query<{ name: string }>(
        `SELECT name FROM teams WHERE id = $1`,
        [row.assigned_team_id as string]
      );
      teamName = tn.rows[0]?.name ?? null;
    }

    const patch = attendancePatchFromRow({
      ...row,
      assignee_email: assigneeEmail,
      assignee_display: assigneeDisplay,
      assigned_team_name: teamName,
    });
    emitConversationAttendanceUpdated(prev.owner_tenant_id, prev.user_id, patch);
    res.json({ ok: true, conversation: patch });
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error('[patchConversationAttendance]', e);
    res.status(500).json({ error: e.message || 'Falha ao atualizar atendimento' });
  } finally {
    client.release();
  }
}

/** Lista histórico (tenant-scoped via RLS + checagem de acesso à conversa). */
const transferBodySchema = z
  .object({
    toUserId: z.string().uuid().optional(),
    toTeamId: z.string().uuid().optional(),
    reason: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    const hasU = data.toUserId != null && data.toUserId.length > 0;
    const hasT = data.toTeamId != null && data.toTeamId.length > 0;
    if (hasU === hasT) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe exatamente um destino: toUserId (operador) ou toTeamId (equipe)',
      });
    }
  });

/** POST /api/chat/conversations/:id/transfer — operador (reassign) ou equipe (reassign_team). */
export async function transferConversation(req: AuthRequest, res: Response) {
  const parsed = transferBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
    return;
  }
  const { toUserId, toTeamId, reason } = parsed.data;
  if (toUserId) {
    (req as { body: unknown }).body = {
      action: 'reassign' as const,
      toUserId,
      reason,
    };
  } else {
    (req as { body: unknown }).body = {
      action: 'reassign_team' as const,
      toTeamId: toTeamId!,
      reason,
    };
  }
  await patchConversationAttendance(req, res);
}

export async function getConversationAssignmentHistory(req: AuthRequest, res: Response) {
  if (!(await hasAttendanceColumns())) {
    respondAttendanceMigrationRequired(res);
    return;
  }
  const actorUserId = req.userId!;
  const { id: conversationId } = req.params;
  const lim = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));

  const conv = await pool.query<{
    user_id: string;
    owner_tenant_id: string | null;
  }>(
    `SELECT c.user_id, owner.tenant_id AS owner_tenant_id
     FROM chat_conversations c
     INNER JOIN users owner ON owner.id = c.user_id
     WHERE c.id = $1`,
    [conversationId]
  );
  if (conv.rowCount === 0) {
    res.status(404).json({ error: 'Conversa não encontrada' });
    return;
  }
  const { user_id: ownerUserId, owner_tenant_id: ownerTenantId } = conv.rows[0];
  const ar = await pool.query<{ tenant_id: string | null }>(`SELECT tenant_id FROM users WHERE id = $1`, [
    actorUserId,
  ]);
  const actorTenantId = ar.rows[0]?.tenant_id ?? null;
  if (!tenantAccessOk(ownerTenantId, ownerUserId, actorUserId, actorTenantId)) {
    res.status(403).json({ error: 'Sem permissão' });
    return;
  }

  const hist = await pool.query(
    `SELECT h.* FROM chat_conversation_assignment_history h
     WHERE h.conversation_id = $1
     ORDER BY h.created_at DESC
     LIMIT $2`,
    [conversationId, lim]
  );
  res.json({ items: hist.rows });
}
