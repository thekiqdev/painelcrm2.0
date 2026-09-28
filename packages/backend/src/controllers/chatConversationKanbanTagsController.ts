/**
 * Tags Kanban em conversas (/chat) + listagem de tags do tenant.
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { conversationVisibleToTenantUser } from './chatKanbanController.js';
import {
  DEFAULT_KANBAN_TAG_COLOR_UI,
  listKanbanTagsForTenant,
  getOrCreateKanbanTag,
  normalizeKanbanTagLabel,
  normalizeKanbanTagColor,
  patchKanbanTag,
} from '../services/chatKanbanTagStore.js';
import {
  addKanbanTagToConversation,
  attachResolvedKanbanTagsToConversationPayload,
  getConversationKanbanTagsResolved,
  removeKanbanTagFromConversation,
  resolveTagForAdd,
} from '../services/chatKanbanConversationKanbanTagsService.js';
import { pool } from '../utils/db.js';
import { emitConversationUpdatedToTenant, emitConversationUpdate } from '../services/websocketService.js';
import { conversationRowForClientApi } from '../utils/uazapiIdentityResolve.js';
import { canChatAction } from '../services/chatAccess.js';

const addTagBodySchema = z
  .object({
    tag_id: z.string().uuid().optional(),
    label: z.string().min(1).max(80).optional(),
    color: z.string().max(16).optional(),
  })
  .refine((d) => Boolean(d.tag_id?.trim()) || Boolean(d.label?.trim()), {
    message: 'Informe tag_id ou label',
  });

const patchTenantTagBodySchema = z.object({
  label: z.string().min(1).max(80).optional(),
  color: z.string().max(16).nullable().optional(),
});

export async function patchTenantKanbanTag(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!(await canChatAction(req.userId!, 'manage_tags', req))) {
      res.status(403).json({ error: 'Sem permissão para gerir tags do chat.' });
      return;
    }
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const { tagId } = req.params;
    if (!z.string().uuid().safeParse(tagId).success) {
      res.status(400).json({ error: 'tagId inválido' });
      return;
    }
    const body = patchTenantTagBodySchema.parse(req.body || {});
    const updated = await patchKanbanTag(tenantId, tagId, {
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
    });
    if (!updated) {
      res.status(404).json({ error: 'Tag não encontrada' });
      return;
    }
    res.json({
      id: updated.id,
      label: updated.label,
      color: updated.color?.trim() || DEFAULT_KANBAN_TAG_COLOR_UI,
      created_at: updated.created_at,
    });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    const code = (e as Error & { code?: string })?.code;
    if (code === 'BAD_REQUEST') {
      res.status(400).json({ error: e.message });
      return;
    }
    console.error('[chatKanbanTags] patchTenantKanbanTag', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

async function loadConversationRowForEmit(conversationId: string): Promise<Record<string, unknown> | null> {
  const r = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
  return (r.rows[0] as Record<string, unknown>) ?? null;
}

async function emitConversationMetadataRefresh(conversationId: string, tenantId: string): Promise<void> {
  const row = await loadConversationRowForEmit(conversationId);
  if (!row?.id) return;
  const payload = conversationRowForClientApi(row);
  await attachResolvedKanbanTagsToConversationPayload(tenantId, payload);
  const ownerId = typeof row.user_id === 'string' ? row.user_id : String(row.user_id ?? '');
  if (ownerId) emitConversationUpdate(ownerId, payload);
  emitConversationUpdatedToTenant(tenantId, { id: conversationId });
}

export async function listTenantKanbanTags(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!(await canChatAction(req.userId!, 'view', req))) {
      res.status(403).json({ error: 'Sem permissão para ver o chat.' });
      return;
    }
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const rows = await listKanbanTagsForTenant(tenantId);
    res.json(
      rows.map((r) => ({
        id: r.id,
        label: r.label,
        color: r.color?.trim() || DEFAULT_KANBAN_TAG_COLOR_UI,
        created_at: r.created_at,
      })),
    );
  } catch (e: any) {
    console.error('[chatKanbanTags] listTenantKanbanTags', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

const createTagBodySchema = z.object({
  label: z.string().min(1).max(80),
  color: z.string().max(16).optional(),
});

export async function createTenantKanbanTag(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!(await canChatAction(req.userId!, 'manage_tags', req))) {
      res.status(403).json({ error: 'Sem permissão para gerir tags do chat.' });
      return;
    }
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const body = createTagBodySchema.parse(req.body || {});
    const colorNorm = body.color ? normalizeKanbanTagColor(body.color) : null;
    const tag = await getOrCreateKanbanTag(tenantId, body.label, { color: colorNorm });
    res.status(201).json({
      id: tag.id,
      label: tag.label,
      color: tag.color?.trim() || DEFAULT_KANBAN_TAG_COLOR_UI,
      created_at: tag.created_at,
    });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    console.error('[chatKanbanTags] createTenantKanbanTag', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

export async function getConversationKanbanTags(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!(await canChatAction(req.userId!, 'view', req))) {
      res.status(403).json({ error: 'Sem permissão para ver o chat.' });
      return;
    }
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const { id: conversationId } = req.params;
    const vis = await conversationVisibleToTenantUser(conversationId, userId);
    if (!vis) {
      res.status(403).json({ error: 'Sem acesso a esta conversa' });
      return;
    }
    const resolved = await getConversationKanbanTagsResolved(tenantId, conversationId);
    if (!resolved) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    res.json(resolved);
  } catch (e: any) {
    console.error('[chatKanbanTags] getConversationKanbanTags', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

export async function postConversationKanbanTag(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!(await canChatAction(req.userId!, 'manage_tags', req))) {
      res.status(403).json({ error: 'Sem permissão para gerir tags do chat.' });
      return;
    }
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const { id: conversationId } = req.params;
    const body = addTagBodySchema.parse(req.body || {});
    const vis = await conversationVisibleToTenantUser(conversationId, userId);
    if (!vis) {
      res.status(403).json({ error: 'Sem acesso a esta conversa' });
      return;
    }
    const colorOpt = body.color ? normalizeKanbanTagColor(body.color) : null;
    const tag = await resolveTagForAdd({
      tenantId,
      tagId: body.tag_id ?? null,
      label: body.label ? normalizeKanbanTagLabel(body.label) : null,
      color: colorOpt,
    });
    await addKanbanTagToConversation({
      tenantId,
      actorUserId: userId,
      conversationId,
      tag,
    });
    await emitConversationMetadataRefresh(conversationId, tenantId);
    res.json({
      ok: true,
      tag: {
        id: tag.id,
        label: tag.label,
        color: tag.color?.trim() || DEFAULT_KANBAN_TAG_COLOR_UI,
      },
    });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: e.errors.map((x) => x.message).join('; ') });
      return;
    }
    const code = (e as Error & { code?: string })?.code;
    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: e.message });
      return;
    }
    if (code === 'BAD_REQUEST') {
      res.status(400).json({ error: e.message });
      return;
    }
    console.error('[chatKanbanTags] postConversationKanbanTag', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

export async function deleteConversationKanbanTag(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!(await canChatAction(req.userId!, 'manage_tags', req))) {
      res.status(403).json({ error: 'Sem permissão para gerir tags do chat.' });
      return;
    }
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const { id: conversationId, tagId } = req.params;
    if (!z.string().uuid().safeParse(tagId).success) {
      res.status(400).json({ error: 'tagId inválido' });
      return;
    }
    const vis = await conversationVisibleToTenantUser(conversationId, userId);
    if (!vis) {
      res.status(403).json({ error: 'Sem acesso a esta conversa' });
      return;
    }
    await removeKanbanTagFromConversation({ tenantId, conversationId, tagId });
    await emitConversationMetadataRefresh(conversationId, tenantId);
    res.json({ ok: true });
  } catch (e: any) {
    const code = (e as Error & { code?: string })?.code;
    if (code === 'NOT_FOUND') {
      res.status(404).json({ error: e.message });
      return;
    }
    console.error('[chatKanbanTags] deleteConversationKanbanTag', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}
