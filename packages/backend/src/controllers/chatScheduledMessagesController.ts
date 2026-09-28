import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { resolveTenantIdForUser } from '../utils/resolveTenantIdForUser.js';
import { canChatAction } from '../services/chatAccess.js';
import { pool } from '../utils/db.js';
import {
  cancelScheduledMessage,
  insertScheduledMessage,
  listScheduledMessagesForConversation,
  patchScheduledMessage,
} from '../services/chatScheduledMessagesService.js';

const createSchema = z.object({
  message_text: z.string().min(1).max(8000),
  scheduled_at: z.string(),
  internal_note: z.string().max(4000).optional(),
});

const patchSchema = z.object({
  message_text: z.string().min(1).max(8000),
  scheduled_at: z.string(),
});

function logEv(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...fields }));
}

export async function postConversationScheduledMessages(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const tenantId = await resolveTenantIdForUser(userId);
    if (!tenantId) {
      res.status(403).json({ error: 'Tenant não identificado' });
      return;
    }
    if (!(await canChatAction(userId, 'reply', req))) {
      res.status(403).json({ error: 'Sem permissão para agendar mensagens' });
      return;
    }
    const conversationId = String(req.params.id || '').trim();
    const data = createSchema.parse(req.body);
    const scheduledAt = new Date(data.scheduled_at);
    if (Number.isNaN(scheduledAt.getTime())) {
      res.status(400).json({ error: 'Data/hora inválida' });
      return;
    }
    const minFuture = Date.now() + 5000;
    if (scheduledAt.getTime() <= minFuture) {
      res.status(400).json({ error: 'Agende para um momento futuro (após alguns segundos).' });
      return;
    }

    const cq = await pool.query(
      `
      SELECT c.id, c.instance_id, c.client_id, c.lead_id
      FROM public.chat_conversations c
      INNER JOIN public.users u ON u.id = c.user_id
      WHERE c.id = $1::uuid AND u.tenant_id = $2::uuid
      `,
      [conversationId, tenantId],
    );
    if (!cq.rowCount) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    const conv = cq.rows[0] as {
      id: string;
      instance_id: string | null;
      client_id: string | null;
      lead_id: string | null;
    };

    const meta: Record<string, unknown> = {};
    if (data.internal_note?.trim()) meta.internal_note = data.internal_note.trim();

    const row = await insertScheduledMessage({
      tenantId,
      conversationId: conv.id,
      instanceId: conv.instance_id,
      clientId: conv.client_id,
      leadId: conv.lead_id,
      scheduledByUserId: userId,
      messageText: data.message_text.trim(),
      scheduledAt,
      metadata: meta,
    });

    logEv('scheduled_message_created', {
      scheduled_message_id: row.id,
      conversation_id: conversationId,
      tenant_id: tenantId,
      user_id: userId,
    });

    res.status(201).json({ scheduled_message: row });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos', details: e.errors });
      return;
    }
    console.error('[postConversationScheduledMessages]', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Erro ao agendar' });
  }
}

export async function getConversationScheduledMessages(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const tenantId = await resolveTenantIdForUser(userId);
    if (!tenantId) {
      res.status(403).json({ error: 'Tenant não identificado' });
      return;
    }
    if (!(await canChatAction(userId, 'reply', req))) {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }
    const conversationId = String(req.params.id || '').trim();
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '3'), 10) || 3));

    const ok = await pool.query(
      `
      SELECT 1 FROM public.chat_conversations c
      INNER JOIN public.users u ON u.id = c.user_id
      WHERE c.id = $1::uuid AND u.tenant_id = $2::uuid
      LIMIT 1
      `,
      [conversationId, tenantId],
    );
    if (!ok.rowCount) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    const rows = await listScheduledMessagesForConversation({
      tenantId,
      conversationId,
      limit,
    });
    res.json({ scheduled_messages: rows });
  } catch (e: unknown) {
    console.error('[getConversationScheduledMessages]', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Erro ao listar' });
  }
}

export async function postChatScheduledMessageCancel(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const tenantId = await resolveTenantIdForUser(userId);
    if (!tenantId) {
      res.status(403).json({ error: 'Tenant não identificado' });
      return;
    }
    if (!(await canChatAction(userId, 'reply', req))) {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }
    const id = String(req.params.id || '').trim();
    const own = await pool.query(
      `SELECT scheduled_by_user_id FROM public.chat_scheduled_messages
       WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
      [id, tenantId],
    );
    if (!own.rowCount) {
      res.status(404).json({ error: 'Agendamento não encontrado' });
      return;
    }
    if (String((own.rows[0] as { scheduled_by_user_id: string }).scheduled_by_user_id) !== userId) {
      res.status(403).json({ error: 'Só pode cancelar os seus agendamentos' });
      return;
    }
    const r = await cancelScheduledMessage({ id, tenantId, userId });
    if (!r.ok) {
      res.status(404).json({ error: 'Agendamento não encontrado ou já processado' });
      return;
    }
    logEv('scheduled_message_cancelled', { scheduled_message_id: id, user_id: userId });
    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[postChatScheduledMessageCancel]', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Erro ao cancelar' });
  }
}

export async function patchChatScheduledMessage(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const tenantId = await resolveTenantIdForUser(userId);
    if (!tenantId) {
      res.status(403).json({ error: 'Tenant não identificado' });
      return;
    }
    if (!(await canChatAction(userId, 'reply', req))) {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }
    const id = String(req.params.id || '').trim();
    const data = patchSchema.parse(req.body);
    const scheduledAt = new Date(data.scheduled_at);
    if (Number.isNaN(scheduledAt.getTime())) {
      res.status(400).json({ error: 'Data/hora inválida' });
      return;
    }
    const minFuture = Date.now() + 5000;
    if (scheduledAt.getTime() <= minFuture) {
      res.status(400).json({ error: 'Agende para um momento futuro.' });
      return;
    }

    const own = await pool.query(
      `
      SELECT 1 FROM public.chat_scheduled_messages m
      WHERE m.id = $1::uuid AND m.tenant_id = $2::uuid AND m.scheduled_by_user_id = $3::uuid
      `,
      [id, tenantId, userId],
    );
    if (!own.rowCount) {
      res.status(403).json({ error: 'Só pode editar os seus agendamentos' });
      return;
    }

    const r = await patchScheduledMessage({
      id,
      tenantId,
      messageText: data.message_text.trim(),
      scheduledAt,
    });
    if (!r.ok) {
      res.status(404).json({ error: 'Agendamento não encontrado ou já processado' });
      return;
    }
    logEv('scheduled_message_rescheduled', {
      scheduled_message_id: id,
      user_id: userId,
      scheduled_at: scheduledAt.toISOString(),
    });
    res.json({ scheduled_message: r.row });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos', details: e.errors });
      return;
    }
    console.error('[patchChatScheduledMessage]', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Erro ao atualizar' });
  }
}
