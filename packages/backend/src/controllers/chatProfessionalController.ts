import { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { canChatAction } from '../services/chatAccess.js';
import { listQueuesForTenant, createQueue, patchQueue } from '../services/chatQueueService.js';
import { hasChatQueuesTable } from '../utils/chatAttendanceSchema.js';
import { computeChatMetrics } from '../services/chatMetricsService.js';
import { listTransfersForConversation } from '../services/chatProfessionalService.js';
import { pool } from '../utils/db.js';
import { attendConversation, getConversationAssignmentHistory, patchConversationAttendance } from './chatAttendanceController.js';
import { getTeams, createTeam, updateTeam, getTeamMembers, addTeamMember, removeTeamMember } from './teamsController.js';

const queueCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
});

const queuePatchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

export async function getChatQueues(req: AuthRequest, res: Response) {
  if (!(await hasChatQueuesTable())) {
    return res.json({ items: [] });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await canChatAction(req.userId!, 'view', req))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const items = await listQueuesForTenant(tenantId);
  return res.json({ items });
}

export async function postChatQueue(req: AuthRequest, res: Response) {
  if (!(await hasChatQueuesTable())) {
    return res.status(503).json({ error: 'Migração de filas não aplicada' });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await canChatAction(req.userId!, 'manage_queues', req))) {
    return res.status(403).json({ error: 'Sem permissão para gerir filas' });
  }
  const p = queueCreateSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Dados inválidos', details: p.error.flatten() });
  try {
    const row = await createQueue(tenantId, p.data);
    return res.status(201).json(row);
  } catch (e: any) {
    if (e?.code === '23505') return res.status(409).json({ error: 'Já existe fila com este nome' });
    console.error('[postChatQueue]', e);
    return res.status(500).json({ error: e?.message || 'Erro' });
  }
}

export async function patchChatQueue(req: AuthRequest, res: Response) {
  if (!(await hasChatQueuesTable())) {
    return res.status(503).json({ error: 'Migração de filas não aplicada' });
  }
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await canChatAction(req.userId!, 'manage_queues', req))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const p = queuePatchSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Dados inválidos', details: p.error.flatten() });
  const row = await patchQueue(tenantId, req.params.id, p.data);
  if (!row) return res.status(404).json({ error: 'Fila não encontrada' });
  return res.json(row);
}

export async function getChatMetrics(req: AuthRequest, res: Response) {
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  if (!(await canChatAction(req.userId!, 'view', req))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  const m = await computeChatMetrics(tenantId);
  return res.json(m);
}

/** Histórico Fase 5 (tabela chat_conversation_transfers). */
export async function getChatTransfers(req: AuthRequest, res: Response) {
  const tenantId = req.tenantId;
  const conversationId = req.params.id;
  if (!tenantId) return res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
  const lim = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
  const conv = await pool.query(
    `SELECT c.id FROM chat_conversations c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.id = $1 AND u.tenant_id = $2`,
    [conversationId, tenantId]
  );
  if (conv.rowCount === 0) return res.status(404).json({ error: 'Conversa não encontrada' });
  const items = await listTransfersForConversation(tenantId, conversationId, lim);
  return res.json({ items });
}

const assignBody = z.object({
  assignToUserId: z.string().uuid().optional(),
  reason: z.string().optional(),
});

/** PATCH /conversations/:id/assign — assume para si ou atribui a outro utilizador do tenant. */
export async function patchConversationAssign(req: AuthRequest, res: Response) {
  const p = assignBody.safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: 'Payload inválido', details: p.error.flatten() });
  const target = p.data.assignToUserId;
  if (target && target !== req.userId) {
    (req as { body: unknown }).body = {
      action: 'reassign',
      toUserId: target,
      reason: p.data.reason,
    };
    return patchConversationAttendance(req, res);
  }
  return attendConversation(req, res);
}

const transferBody = z.object({
  toUserId: z.string().uuid().optional(),
  toTeamId: z.string().uuid().optional(),
  toQueueId: z.string().uuid().optional(),
  reason: z.string().optional(),
});

/** PATCH /conversations/:id/transfer — destino único: utilizador, equipe ou fila. */
export async function patchConversationTransfer(req: AuthRequest, res: Response) {
  const p = transferBody.safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: 'Payload inválido', details: p.error.flatten() });
  const { toUserId, toTeamId, toQueueId, reason } = p.data;
  const n =
    (toUserId ? 1 : 0) + (toTeamId ? 1 : 0) + (toQueueId ? 1 : 0);
  if (n !== 1) {
    return res.status(400).json({ error: 'Indique exatamente um destino: toUserId, toTeamId ou toQueueId' });
  }
  if (toUserId) {
    (req as { body: unknown }).body = { action: 'reassign', toUserId, reason };
    return patchConversationAttendance(req, res);
  }
  if (toTeamId) {
    (req as { body: unknown }).body = { action: 'reassign_team', toTeamId, reason };
    return patchConversationAttendance(req, res);
  }
  (req as { body: unknown }).body = { action: 'queue', queueId: toQueueId ?? null, reason };
  return patchConversationAttendance(req, res);
}

const statusBody = z.object({
  status: z.enum(['open', 'pending', 'in_progress', 'waiting_customer', 'closed', 'archived']),
  reason: z.string().optional(),
});

export async function patchConversationStatusAlias(req: AuthRequest, res: Response) {
  const p = statusBody.safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: 'Payload inválido', details: p.error.flatten() });
  if (!(await canChatAction(req.userId!, 'assign', req))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  (req as { body: unknown }).body = {
    action: 'set_status',
    status: p.data.status,
    reason: p.data.reason,
  };
  return patchConversationAttendance(req, res);
}

export async function patchConversationQueueAlias(req: AuthRequest, res: Response) {
  const schema = z.object({ queueId: z.string().uuid().nullable() });
  const p = schema.safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: 'Payload inválido', details: p.error.flatten() });
  if (!(await canChatAction(req.userId!, 'transfer', req))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  (req as { body: unknown }).body = {
    action: 'queue',
    queueId: p.data.queueId,
  };
  return patchConversationAttendance(req, res);
}

export async function patchConversationTeamAlias(req: AuthRequest, res: Response) {
  const schema = z.object({ teamId: z.string().uuid() });
  const p = schema.safeParse(req.body ?? {});
  if (!p.success) return res.status(400).json({ error: 'Payload inválido', details: p.error.flatten() });
  if (!(await canChatAction(req.userId!, 'transfer', req))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  (req as { body: unknown }).body = {
    action: 'reassign_team',
    toTeamId: p.data.teamId,
  };
  return patchConversationAttendance(req, res);
}

/** Delegadores para rotas /teams já existentes — respeita chat.manage_teams. */
export async function chatTeamsList(req: AuthRequest, res: Response) {
  if (!(await canChatAction(req.userId!, 'manage_teams', req)) && !(await canChatAction(req.userId!, 'view', req))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  return getTeams(req, res);
}

export async function chatTeamsCreate(req: AuthRequest, res: Response) {
  if (!(await canChatAction(req.userId!, 'manage_teams', req))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  return createTeam(req, res);
}

export async function chatTeamsPatch(req: AuthRequest, res: Response) {
  if (!(await canChatAction(req.userId!, 'manage_teams', req))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  return updateTeam(req, res);
}

export async function chatTeamMembersList(req: AuthRequest, res: Response) {
  if (!(await canChatAction(req.userId!, 'view', req))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  return getTeamMembers(req, res);
}

export async function chatTeamMembersAdd(req: AuthRequest, res: Response) {
  if (!(await canChatAction(req.userId!, 'manage_teams', req))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  return addTeamMember(req, res);
}

export async function chatTeamMembersRemove(req: AuthRequest, res: Response) {
  if (!(await canChatAction(req.userId!, 'manage_teams', req))) {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  return removeTeamMember(req, res);
}

export { getConversationAssignmentHistory as getChatAssignmentHistory };
