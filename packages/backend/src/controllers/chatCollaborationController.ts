/**
 * Comentários internos em mensagens + notas CRM (chat profissional).
 */
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { SQL_CHAT_ACCESS_PREDICATE } from '../utils/chatConversationAccess.js';
import { getTenantIdForUser, isTenantAdmin } from '../utils/tenant.js';
import { canChatAction } from '../services/chatAccess.js';
import { emitToTenant } from '../services/realtimeService.js';
import { z } from 'zod';

const postCommentSchema = z.object({
  commentText: z.string().min(1).max(8000),
  alsoCreateCrmNote: z.boolean().optional(),
});

const patchCommentSchema = z.object({
  commentText: z.string().min(1).max(8000),
});

const listNotesQuerySchema = z.object({
  clientId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
});

const postNoteSchema = z.object({
  clientId: z.string().uuid().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
  conversationId: z.string().uuid().nullable().optional(),
  messageId: z.string().uuid().nullable().optional(),
  /** Quando a nota espelha um comentário em mensagem */
  sourceCommentId: z.string().uuid().nullable().optional(),
  noteType: z.enum(['general', 'chat_message', 'follow_up', 'internal']),
  noteText: z.string().min(1).max(16000),
  pinned: z.boolean().optional(),
});

const patchNoteSchema = z.object({
  noteText: z.string().min(1).max(16000).optional(),
  pinned: z.boolean().optional(),
});

async function assertCanAccessConversation(userId: string, conversationId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT c.id FROM chat_conversations c WHERE c.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}`,
    [conversationId, userId]
  );
  return (r.rowCount ?? 0) > 0;
}

async function resolveConversationLinkIds(
  conversationId: string
): Promise<{ client_id: string | null; lead_id: string | null }> {
  const r = await pool.query<{ client_id: string | null; lead_id: string | null }>(
    `SELECT client_id, lead_id FROM chat_conversations WHERE id = $1`,
    [conversationId]
  );
  const row = r.rows[0];
  return {
    client_id: row?.client_id ?? null,
    lead_id: row?.lead_id ?? null,
  };
}

/** POST /api/chat/messages/:messageId/comments */
export async function postMessageComment(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { messageId } = req.params;
    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      res.status(403).json({ error: 'Conta sem tenant' });
      return;
    }
    if (!(await canChatAction(userId, 'reply', req))) {
      res.status(403).json({ error: 'Sem permissão para comentar' });
      return;
    }

    const body = postCommentSchema.parse(req.body);

    const msgR = await pool.query<{
      id: string;
      conversation_id: string;
    }>(
      `
      SELECT m.id, m.conversation_id
      FROM chat_messages m
      INNER JOIN chat_conversations c ON c.id = m.conversation_id
      WHERE m.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}
      `,
      [messageId, userId]
    );
    if (msgR.rowCount === 0) {
      res.status(404).json({ error: 'Mensagem não encontrada' });
      return;
    }
    const convId = msgR.rows[0].conversation_id;
    const link = await resolveConversationLinkIds(convId);

    const clientId = link.client_id;
    const leadId = link.lead_id;

    if (body.alsoCreateCrmNote === true && !clientId && !leadId) {
      res.status(400).json({
        error: 'Vincule este contato a um cliente ou lead para salvar anotações no perfil.',
        code: 'LINK_REQUIRED_FOR_NOTE',
      });
      return;
    }

    const ins = await pool.query(
      `
      INSERT INTO chat_message_comments (
        tenant_id, conversation_id, message_id, client_id, lead_id, author_user_id, comment_text
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
      `,
      [tenantId, convId, messageId, clientId, leadId, userId, body.commentText.trim()]
    );
    const newCommentId = ins.rows[0].id as string;

    const enrichedR = await pool.query(
      `
      SELECT cmc.*, u.email AS author_email,
        COALESCE(
          NULLIF(trim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
          split_part(u.email, '@', 1)
        ) AS author_display
      FROM chat_message_comments cmc
      INNER JOIN users u ON u.id = cmc.author_user_id
      LEFT JOIN profiles pr ON pr.id = u.id
      WHERE cmc.id = $1
      `,
      [newCommentId]
    );
    const comment = enrichedR.rows[0];

    emitToTenant(tenantId, 'chat.message_comment.created', {
      v: 1,
      type: 'chat.message_comment.created',
      comment,
      conversation_id: convId,
      message_id: messageId,
      ts: new Date().toISOString(),
    });

    if (body.alsoCreateCrmNote === true && (clientId || leadId)) {
      const noteIns = await pool.query(
        `
        INSERT INTO crm_notes (
          tenant_id, client_id, lead_id, conversation_id, message_id, author_user_id,
          note_type, note_text, pinned, source_comment_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'chat_message', $7, false, $8)
        RETURNING *
        `,
        [tenantId, clientId, leadId, convId, messageId, userId, body.commentText.trim(), comment.id]
      );
      const note = noteIns.rows[0];
      emitToTenant(tenantId, 'crm.note.created', {
        v: 1,
        type: 'crm.note.created',
        note,
        ts: new Date().toISOString(),
      });
    }

    res.status(201).json({ comment });
  } catch (e: any) {
    if (e?.name === 'ZodError') {
      res.status(400).json({ error: 'Payload inválido', details: e.errors });
      return;
    }
    console.error('[postMessageComment]', e);
    res.status(500).json({ error: e?.message || 'Erro ao criar comentário' });
  }
}

/** GET /api/chat/messages/:messageId/comments */
export async function getMessageComments(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { messageId } = req.params;
    if (!(await canChatAction(userId, 'view', req))) {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }

    const check = await pool.query(
      `
      SELECT m.id
      FROM chat_messages m
      INNER JOIN chat_conversations c ON c.id = m.conversation_id
      WHERE m.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}
      `,
      [messageId, userId]
    );
    if (check.rowCount === 0) {
      res.status(404).json({ error: 'Mensagem não encontrada' });
      return;
    }

    const r = await pool.query(
      `
      SELECT cmc.*, u.email AS author_email,
        COALESCE(
          NULLIF(trim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
          split_part(u.email, '@', 1)
        ) AS author_display
      FROM chat_message_comments cmc
      INNER JOIN users u ON u.id = cmc.author_user_id
      LEFT JOIN profiles pr ON pr.id = u.id
      WHERE cmc.message_id = $1 AND cmc.deleted_at IS NULL
      ORDER BY cmc.created_at ASC
      `,
      [messageId]
    );
    res.json({ comments: r.rows });
  } catch (e: any) {
    console.error('[getMessageComments]', e);
    res.status(500).json({ error: e?.message || 'Erro ao listar comentários' });
  }
}

/** PATCH /api/chat/message-comments/:commentId */
export async function patchMessageComment(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { commentId } = req.params;
    const tenantId = await getTenantIdForUser(userId);
    const body = patchCommentSchema.parse(req.body);
    const admin = await isTenantAdmin(userId);

    const found = await pool.query<{
      id: string;
      author_user_id: string;
      tenant_id: string;
    }>(
      `SELECT id, author_user_id, tenant_id FROM chat_message_comments WHERE id = $1 AND deleted_at IS NULL`,
      [commentId]
    );
    if (found.rowCount === 0) {
      res.status(404).json({ error: 'Comentário não encontrado' });
      return;
    }
    const row = found.rows[0];
    if (tenantId && row.tenant_id !== tenantId) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    if (row.author_user_id !== userId && !admin) {
      res.status(403).json({ error: 'Apenas o autor ou admin pode editar' });
      return;
    }

    const upd = await pool.query(
      `
      UPDATE chat_message_comments
      SET comment_text = $2, updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
      `,
      [commentId, body.commentText.trim()]
    );
    res.json({ comment: upd.rows[0] });
  } catch (e: any) {
    if (e?.name === 'ZodError') {
      res.status(400).json({ error: 'Payload inválido', details: e.errors });
      return;
    }
    console.error('[patchMessageComment]', e);
    res.status(500).json({ error: e?.message || 'Erro ao atualizar' });
  }
}

/** DELETE /api/chat/message-comments/:commentId */
export async function deleteMessageComment(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { commentId } = req.params;
    const tenantId = await getTenantIdForUser(userId);
    const admin = await isTenantAdmin(userId);

    const found = await pool.query<{
      id: string;
      author_user_id: string;
      tenant_id: string;
    }>(
      `SELECT id, author_user_id, tenant_id FROM chat_message_comments WHERE id = $1 AND deleted_at IS NULL`,
      [commentId]
    );
    if (found.rowCount === 0) {
      res.status(404).json({ error: 'Comentário não encontrado' });
      return;
    }
    const row = found.rows[0];
    if (tenantId && row.tenant_id !== tenantId) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    if (row.author_user_id !== userId && !admin) {
      res.status(403).json({ error: 'Apenas o autor ou admin pode remover' });
      return;
    }

    await pool.query(
      `UPDATE chat_message_comments SET deleted_at = now(), updated_at = now() WHERE id = $1`,
      [commentId]
    );
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[deleteMessageComment]', e);
    res.status(500).json({ error: e?.message || 'Erro ao remover' });
  }
}

/** GET /api/chat/crm-notes */
export async function listCrmNotes(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const q = listNotesQuerySchema.parse(req.query);
    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      res.status(403).json({ error: 'Conta sem tenant' });
      return;
    }
    if (!(await canChatAction(userId, 'view', req))) {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }

    const limit = q.limit ?? 20;

    if (q.clientId) {
      const r = await pool.query(
        `
        SELECT n.*, u.email AS author_email
        FROM crm_notes n
        INNER JOIN users u ON u.id = n.author_user_id
        INNER JOIN clients cl ON cl.id = n.client_id
        INNER JOIN users owner ON owner.id = cl.user_id
        INNER JOIN users actor ON actor.id = $2
        WHERE n.tenant_id = $1 AND n.deleted_at IS NULL AND n.client_id = $3
          AND (
            cl.user_id = actor.id
            OR (
              owner.tenant_id IS NOT NULL
              AND actor.tenant_id IS NOT NULL
              AND owner.tenant_id = actor.tenant_id
            )
          )
        ORDER BY n.pinned DESC, n.created_at DESC
        LIMIT $4
        `,
        [tenantId, userId, q.clientId, limit]
      );
      res.json({ notes: r.rows });
      return;
    }

    if (q.leadId) {
      const r = await pool.query(
        `
        SELECT n.*, u.email AS author_email
        FROM crm_notes n
        INNER JOIN users u ON u.id = n.author_user_id
        INNER JOIN leads l ON l.id = n.lead_id
        INNER JOIN users owner ON owner.id = l.user_id
        INNER JOIN users actor ON actor.id = $2
        WHERE n.tenant_id = $1 AND n.deleted_at IS NULL AND n.lead_id = $3
          AND (
            l.user_id = actor.id
            OR (
              owner.tenant_id IS NOT NULL
              AND actor.tenant_id IS NOT NULL
              AND owner.tenant_id = actor.tenant_id
            )
          )
        ORDER BY n.pinned DESC, n.created_at DESC
        LIMIT $4
        `,
        [tenantId, userId, q.leadId, limit]
      );
      res.json({ notes: r.rows });
      return;
    }

    if (q.conversationId) {
      if (!(await assertCanAccessConversation(userId, q.conversationId))) {
        res.status(404).json({ error: 'Conversa não encontrada' });
        return;
      }
      const r = await pool.query(
        `
        SELECT n.*, u.email AS author_email
        FROM crm_notes n
        INNER JOIN users u ON u.id = n.author_user_id
        WHERE n.tenant_id = $1 AND n.deleted_at IS NULL AND n.conversation_id = $2
        ORDER BY n.pinned DESC, n.created_at DESC
        LIMIT $3
        `,
        [tenantId, q.conversationId, limit]
      );
      res.json({ notes: r.rows });
      return;
    }

    res.status(400).json({ error: 'Informe clientId, leadId ou conversationId' });
  } catch (e: any) {
    if (e?.name === 'ZodError') {
      res.status(400).json({ error: 'Query inválida', details: e.errors });
      return;
    }
    console.error('[listCrmNotes]', e);
    res.status(500).json({ error: e?.message || 'Erro ao listar notas' });
  }
}

/** POST /api/chat/crm-notes */
export async function postCrmNote(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      res.status(403).json({ error: 'Conta sem tenant' });
      return;
    }
    if (!(await canChatAction(userId, 'reply', req))) {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }
    const body = postNoteSchema.parse(req.body);

    if (body.clientId && body.leadId) {
      res.status(400).json({ error: 'Informe apenas clientId ou leadId' });
      return;
    }

    if (body.conversationId && !(await assertCanAccessConversation(userId, body.conversationId))) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    if (body.clientId) {
      const ok = await pool.query(
        `
        SELECT 1 FROM clients cl
        INNER JOIN users owner ON owner.id = cl.user_id
        INNER JOIN users actor ON actor.id = $2
        WHERE cl.id = $1 AND (
          cl.user_id = actor.id OR (
            owner.tenant_id IS NOT NULL AND actor.tenant_id IS NOT NULL AND owner.tenant_id = actor.tenant_id
          )
        )
        `,
        [body.clientId, userId]
      );
      if (ok.rowCount === 0) {
        res.status(404).json({ error: 'Cliente não encontrado' });
        return;
      }
    }
    if (body.leadId) {
      const ok = await pool.query(
        `
        SELECT 1 FROM leads l
        INNER JOIN users owner ON owner.id = l.user_id
        INNER JOIN users actor ON actor.id = $2
        WHERE l.id = $1 AND (
          l.user_id = actor.id OR (
            owner.tenant_id IS NOT NULL AND actor.tenant_id IS NOT NULL AND owner.tenant_id = actor.tenant_id
          )
        )
        `,
        [body.leadId, userId]
      );
      if (ok.rowCount === 0) {
        res.status(404).json({ error: 'Lead não encontrado' });
        return;
      }
    }

    if (body.messageId) {
      const mk = await pool.query(
        `
        SELECT m.id FROM chat_messages m
        INNER JOIN chat_conversations c ON c.id = m.conversation_id
        WHERE m.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}
        `,
        [body.messageId, userId]
      );
      if (mk.rowCount === 0) {
        res.status(404).json({ error: 'Mensagem não encontrada' });
        return;
      }
    }

    const ins = await pool.query(
      `
      INSERT INTO crm_notes (
        tenant_id, client_id, lead_id, conversation_id, message_id, author_user_id,
        note_type, note_text, pinned, source_comment_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, false), $10)
      RETURNING *
      `,
      [
        tenantId,
        body.clientId ?? null,
        body.leadId ?? null,
        body.conversationId ?? null,
        body.messageId ?? null,
        userId,
        body.noteType,
        body.noteText.trim(),
        body.pinned ?? false,
        body.sourceCommentId ?? null,
      ]
    );
    const note = ins.rows[0];
    emitToTenant(tenantId, 'crm.note.created', {
      v: 1,
      type: 'crm.note.created',
      note,
      ts: new Date().toISOString(),
    });
    res.status(201).json({ note });
  } catch (e: any) {
    if (e?.name === 'ZodError') {
      res.status(400).json({ error: 'Payload inválido', details: e.errors });
      return;
    }
    console.error('[postCrmNote]', e);
    res.status(500).json({ error: e?.message || 'Erro ao criar nota' });
  }
}

/** PATCH /api/chat/crm-notes/:noteId */
export async function patchCrmNote(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { noteId } = req.params;
    const tenantId = await getTenantIdForUser(userId);
    const body = patchNoteSchema.parse(req.body);
    const admin = await isTenantAdmin(userId);

    const found = await pool.query<{
      id: string;
      author_user_id: string;
      tenant_id: string;
    }>(`SELECT id, author_user_id, tenant_id FROM crm_notes WHERE id = $1 AND deleted_at IS NULL`, [noteId]);
    if (found.rowCount === 0) {
      res.status(404).json({ error: 'Nota não encontrada' });
      return;
    }
    const row = found.rows[0];
    if (tenantId && row.tenant_id !== tenantId) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    if (row.author_user_id !== userId && !admin) {
      res.status(403).json({ error: 'Apenas o autor ou admin pode editar' });
      return;
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (body.noteText != null) {
      vals.push(body.noteText.trim());
      sets.push(`note_text = $${vals.length}`);
    }
    if (body.pinned != null) {
      vals.push(body.pinned);
      sets.push(`pinned = $${vals.length}`);
    }
    if (sets.length === 0) {
      res.status(400).json({ error: 'Nada para atualizar' });
      return;
    }
    sets.push(`updated_at = now()`);
    vals.push(noteId);
    const idParam = vals.length;
    const upd = await pool.query(
      `UPDATE crm_notes SET ${sets.join(', ')} WHERE id = $${idParam} AND deleted_at IS NULL RETURNING *`,
      vals
    );
    res.json({ note: upd.rows[0] });
  } catch (e: any) {
    if (e?.name === 'ZodError') {
      res.status(400).json({ error: 'Payload inválido', details: e.errors });
      return;
    }
    console.error('[patchCrmNote]', e);
    res.status(500).json({ error: e?.message || 'Erro ao atualizar' });
  }
}

/** DELETE /api/chat/crm-notes/:noteId */
export async function deleteCrmNote(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { noteId } = req.params;
    const tenantId = await getTenantIdForUser(userId);
    const admin = await isTenantAdmin(userId);

    const found = await pool.query<{
      id: string;
      author_user_id: string;
      tenant_id: string;
    }>(`SELECT id, author_user_id, tenant_id FROM crm_notes WHERE id = $1 AND deleted_at IS NULL`, [noteId]);
    if (found.rowCount === 0) {
      res.status(404).json({ error: 'Nota não encontrada' });
      return;
    }
    const row = found.rows[0];
    if (tenantId && row.tenant_id !== tenantId) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    if (row.author_user_id !== userId && !admin) {
      res.status(403).json({ error: 'Apenas o autor ou admin pode remover' });
      return;
    }

    await pool.query(`UPDATE crm_notes SET deleted_at = now(), updated_at = now() WHERE id = $1`, [noteId]);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[deleteCrmNote]', e);
    res.status(500).json({ error: e?.message || 'Erro ao remover' });
  }
}
