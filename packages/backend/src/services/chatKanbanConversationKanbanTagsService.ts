import { pool } from '../utils/db.js';
import {
  DEFAULT_KANBAN_TAG_COLOR_UI,
  getKanbanTagById,
  getOrCreateKanbanTag,
  type ChatKanbanTagRow,
} from './chatKanbanTagStore.js';
import { applyKanbanAutomationForConversation } from './chatKanbanAutomationService.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readKanbanTagIdsFromConversationMetadata(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object') return [];
  const raw = (meta as Record<string, unknown>).kanban_tag_ids;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((x) => String(x).trim()).filter((x) => UUID_RE.test(x)))];
}

/** Resolve tags com cor para payload de API (lista / websocket). */
export async function attachResolvedKanbanTagsToConversationPayload(
  tenantId: string | null | undefined,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!tenantId) return;
  const ids = readKanbanTagIdsFromConversationMetadata(payload.metadata);
  if (ids.length === 0) {
    payload.tags = [];
    return;
  }
  const r = await pool.query<{ id: string; label: string; color: string | null }>(
    `SELECT id::text, label, color FROM chat_kanban_tags WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
    [tenantId, ids],
  );
  const byId = new Map(r.rows.map((x) => [x.id, x]));
  const tags = ids
    .map((id) => {
      const t = byId.get(id);
      if (!t) return null;
      const color = t.color?.trim() || DEFAULT_KANBAN_TAG_COLOR_UI;
      return { id, label: t.label, name: t.label, color };
    })
    .filter((x): x is { id: string; label: string; name: string; color: string } => Boolean(x));
  payload.tags = tags;
}

function readLabelsFromMeta(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object') return [];
  const raw = (meta as Record<string, unknown>).kanban_labels;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x).trim()).filter(Boolean);
}

function mergeLabelUnique(labels: string[], add: string): string[] {
  const low = add.toLowerCase();
  if (labels.some((l) => l.toLowerCase() === low)) return labels;
  return [...labels, add];
}

function removeLabelCaseInsensitive(labels: string[], rem: string): string[] {
  const low = rem.toLowerCase();
  return labels.filter((l) => l.toLowerCase() !== low);
}

export type ConversationKanbanTagsResolved = {
  tags: Array<{ id: string; label: string; color: string }>;
  /** Textos em kanban_labels sem id correspondente (legado / regras de coluna). */
  legacy_labels: string[];
};

export async function getConversationKanbanTagsResolved(
  tenantId: string,
  conversationId: string,
): Promise<ConversationKanbanTagsResolved | null> {
  const row = await pool.query<{ metadata: unknown }>(
    `SELECT metadata FROM chat_conversations WHERE id = $1 LIMIT 1`,
    [conversationId],
  );
  if (!row.rows[0]) return null;
  const meta = row.rows[0].metadata;
  const ids = readKanbanTagIdsFromConversationMetadata(meta);
  const labels = readLabelsFromMeta(meta);
  const tags: Array<{ id: string; label: string; color: string }> = [];
  if (ids.length > 0) {
    const r = await pool.query<{ id: string; label: string; color: string | null }>(
      `SELECT id::text, label, color FROM chat_kanban_tags WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
      [tenantId, ids],
    );
    const byId = new Map(r.rows.map((x) => [x.id, x]));
    for (const id of ids) {
      const rowTag = byId.get(id);
      if (rowTag) {
        tags.push({
          id,
          label: rowTag.label,
          color: rowTag.color?.trim() || DEFAULT_KANBAN_TAG_COLOR_UI,
        });
      }
    }
  }
  const resolvedLower = new Set(tags.map((t) => t.label.toLowerCase()));
  const legacy_labels = labels.filter((l) => !resolvedLower.has(l.toLowerCase()));
  return { tags, legacy_labels };
}

/**
 * Adiciona tag à conversa (metadata), sincroniza kanban_labels e dispara automação Kanban.
 * S31: opcionalmente dispara flows com trigger `tag` (exceto source=chatbot_flows).
 */
export async function addKanbanTagToConversation(params: {
  tenantId: string;
  actorUserId: string;
  conversationId: string;
  tag: ChatKanbanTagRow;
  /** user | chatbot_flows | system — chatbot_flows não dispara flow (loop-safe). */
  source?: 'user' | 'chatbot_flows' | 'system' | string;
}): Promise<void> {
  const client = await pool.connect();
  let added = false;
  try {
    await client.query('BEGIN');
    const row = await client.query<{ metadata: unknown; user_id: string }>(
      `SELECT metadata, user_id FROM chat_conversations WHERE id = $1 FOR UPDATE`,
      [params.conversationId],
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
    const ids = readKanbanTagIdsFromConversationMetadata(meta);
    if (ids.includes(params.tag.id)) {
      await client.query('COMMIT');
      return;
    }
    const nextIds = [...ids, params.tag.id];
    const labels = readLabelsFromMeta(meta);
    const nextLabels = mergeLabelUnique(labels, params.tag.label);
    meta.kanban_tag_ids = nextIds;
    meta.kanban_labels = nextLabels;
    await client.query(`UPDATE chat_conversations SET metadata = $2::jsonb, updated_at = now() WHERE id = $1`, [
      params.conversationId,
      JSON.stringify(meta),
    ]);
    await client.query('COMMIT');
    added = true;
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

  await applyKanbanAutomationForConversation({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    conversationId: params.conversationId,
    tagId: params.tag.id,
    reason: 'tag_added',
  });

  if (added && params.source !== 'chatbot_flows') {
    try {
      const { runChatbotFlowsRuntimeFromCrmEvent } = await import(
        './chatbotFlows/chatbotFlowsRuntimeRunner.js'
      );
      void runChatbotFlowsRuntimeFromCrmEvent({
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        conversationId: params.conversationId,
        event: {
          kind: 'tag',
          tagId: params.tag.id,
          tagLabel: params.tag.label,
        },
        source: params.source || 'user',
      });
    } catch (e) {
      console.warn('[chatbot_flows] tag trigger failed', e);
    }
  }
}

/** Remove tag por id. Não altera cartões Kanban. */
export async function removeKanbanTagFromConversation(params: {
  tenantId: string;
  conversationId: string;
  tagId: string;
}): Promise<void> {
  const tag = await getKanbanTagById(params.tenantId, params.tagId);
  if (!tag) {
    const err = new Error('Tag não encontrada');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await client.query<{ metadata: unknown }>(
      `SELECT metadata FROM chat_conversations WHERE id = $1 FOR UPDATE`,
      [params.conversationId],
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
    const ids = readKanbanTagIdsFromConversationMetadata(meta);
    const nextIds = ids.filter((x) => x !== params.tagId);
    let labels = readLabelsFromMeta(meta);
    labels = removeLabelCaseInsensitive(labels, tag.label);
    meta.kanban_tag_ids = nextIds;
    meta.kanban_labels = labels;
    await client.query(`UPDATE chat_conversations SET metadata = $2::jsonb, updated_at = now() WHERE id = $1`, [
      params.conversationId,
      JSON.stringify(meta),
    ]);
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

export async function resolveTagForAdd(params: {
  tenantId: string;
  tagId?: string | null;
  label?: string | null;
  color?: string | null;
}): Promise<ChatKanbanTagRow> {
  if (params.tagId && UUID_RE.test(params.tagId)) {
    const t = await getKanbanTagById(params.tenantId, params.tagId);
    if (!t) {
      const err = new Error('Tag não encontrada nesta empresa');
      (err as Error & { code?: string }).code = 'NOT_FOUND';
      throw err;
    }
    return t;
  }
  if (params.label && params.label.trim()) {
    return getOrCreateKanbanTag(params.tenantId, params.label, { color: params.color ?? null });
  }
  const err = new Error('Envie tag_id ou label');
  (err as Error & { code?: string }).code = 'BAD_REQUEST';
  throw err;
}
