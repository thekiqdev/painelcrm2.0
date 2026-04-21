/**
 * Cria proposta ao entrar na coluna quando `kanban_proposals.auto_create_proposal_on_enter` está ativo
 * e existe modelo oficial (`proposal_templates`) ou legado (rascunho `proposals`).
 *
 * Idempotência (backend): em `chat_kanban_cards.metadata.kanban_auto_proposal_by_column[columnId]`
 * guarda-se o `proposal_id` da última criação automática para essa coluna. Se essa proposta ainda existe
 * e está `draft` ou `sent`, não cria outra. Se foi aceita/faturada/recusada/expirada ou apagada, permite nova criação.
 */
import type { PoolClient } from 'pg';
import { checkPermission } from '../permissions/permissionEngine.js';
import { parseKanbanProposalsMetadata } from '../utils/kanbanProposalsMetadata.js';
import { insertProposalTimelineEvent } from './proposalTimelineService.js';

const METADATA_KEY = 'kanban_auto_proposal_by_column';

export type KanbanAutoCreatedProposalPayload = {
  id: string;
  title: string;
  public_link_path: string | null;
};

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

type NormItem = {
  id?: number | string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
};

function normalizeProposalItemsFromRaw(raw: unknown[]): { items: NormItem[]; sum: number } {
  let sum = 0;
  const out: NormItem[] = raw.map((it, idx) => {
    const row = it as Record<string, unknown>;
    const discount = Number(row.discount) || 0;
    const qty = Number(row.quantity) || 0;
    const up = Number(row.unitPrice) || 0;
    const total = Math.max(0, roundMoney2(qty * up - discount));
    sum += total;
    const rid = row.id;
    const id = typeof rid === 'string' || typeof rid === 'number' ? rid : idx;
    return {
      id,
      description: String(row.description ?? ''),
      quantity: qty,
      unitPrice: up,
      discount,
      total,
    };
  });
  return { items: out, sum: roundMoney2(sum) };
}

export async function runKanbanAutoCreateProposalInTransaction(
  client: PoolClient,
  input: {
    tenantId: string;
    actorUserId: string;
    cardId: string;
    conversationId: string;
    destColumnId: string;
    destColumnMetadata: unknown;
    boardId: string;
  },
): Promise<KanbanAutoCreatedProposalPayload | null> {
  const kp = parseKanbanProposalsMetadata(input.destColumnMetadata);
  if (!kp.auto_create_proposal_on_enter) {
    return null;
  }

  const modelId = kp.default_proposal_model_id?.trim() || null;
  const legacyDraftId =
    !modelId && kp.default_proposal_template_id?.trim() ? kp.default_proposal_template_id.trim() : null;
  if (!modelId && !legacyDraftId) {
    return null;
  }

  const canCreate = await checkPermission({
    userId: input.actorUserId,
    tenantId: input.tenantId,
    role: null,
    module: 'proposals',
    action: 'create',
  });
  if (!canCreate) {
    console.warn('[kanbanAutoProposal] skip: sem permissão create em proposals', {
      cardId: input.cardId,
      actorUserId: input.actorUserId,
    });
    return null;
  }

  const cardRow = await client.query<{ metadata: unknown }>(
    `SELECT metadata FROM chat_kanban_cards WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
    [input.cardId, input.tenantId],
  );
  if (cardRow.rows.length === 0) return null;

  const metaRoot = cardRow.rows[0].metadata;
  const meta =
    metaRoot && typeof metaRoot === 'object' && !Array.isArray(metaRoot)
      ? ({ ...(metaRoot as Record<string, unknown>) } as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const byColRaw = meta[METADATA_KEY];
  const byCol =
    byColRaw && typeof byColRaw === 'object' && !Array.isArray(byColRaw)
      ? ({ ...(byColRaw as Record<string, { proposal_id?: string }>) } as Record<
          string,
          { proposal_id?: string }
        >)
      : {};

  const existingPid = byCol[input.destColumnId]?.proposal_id?.trim();
  if (existingPid) {
    const st = await client.query<{ status: string }>(
      `SELECT p.status FROM proposals p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $2
       WHERE p.id = $1 LIMIT 1`,
      [existingPid, input.tenantId],
    );
    if (st.rows.length > 0) {
      const status = st.rows[0].status;
      if (status === 'draft' || status === 'sent') {
        return null;
      }
    }
  }

  const convRes = await client.query<{ client_id: string | null; lead_id: string | null }>(
    `SELECT client_id::text, lead_id::text FROM chat_conversations WHERE id = $1 LIMIT 1`,
    [input.conversationId],
  );
  if (convRes.rows.length === 0) return null;
  const cid = convRes.rows[0].client_id?.trim() || null;
  const lid = convRes.rows[0].lead_id?.trim() || null;
  if (cid && lid) return null;
  if (!cid && !lid) return null;

  let title = '';
  let description: string | null = null;
  let amount = 0;
  let items: NormItem[] = [];
  let funnel_id: string | null = null;
  let stage_id: string | null = null;
  let postMode: 'none' | 'notify_team' | 'auto_pending_invoice' = 'none';
  let valid_until: string | null = null;
  let sourceLabel: 'proposal_template' | 'proposal_draft_legacy' = 'proposal_template';

  if (modelId) {
    const tRes = await client.query<{
      default_title: string | null;
      name: string;
      description: string | null;
      amount: string;
      items: unknown;
      funnel_id: string | null;
      stage_id: string | null;
      post_accept_billing_mode: string | null;
    }>(
      `SELECT pt.default_title, pt.name, pt.description, pt.amount::text, pt.items, pt.funnel_id::text, pt.stage_id::text,
              pt.post_accept_billing_mode::text
       FROM proposal_templates pt
       INNER JOIN users u ON u.id = pt.user_id AND u.tenant_id = $2
       WHERE pt.id = $1 AND pt.is_active = true`,
      [modelId, input.tenantId],
    );
    if (tRes.rows.length === 0) return null;
    const t = tRes.rows[0];
    title = (t.default_title?.trim() || t.name?.trim() || 'Proposta').slice(0, 500);
    description = t.description?.trim() ? t.description : null;
    const rawItems = Array.isArray(t.items) ? t.items : [];
    const normalized =
      rawItems.length > 0 ? normalizeProposalItemsFromRaw(rawItems as unknown[]) : { items: [] as NormItem[], sum: 0 };
    items = normalized.items;
    amount = items.length > 0 ? normalized.sum : Math.max(0, parseFloat(String(t.amount)) || 0);
    funnel_id = t.funnel_id;
    stage_id = t.stage_id;
    const pm = t.post_accept_billing_mode?.trim();
    if (pm === 'notify_team' || pm === 'auto_pending_invoice' || pm === 'none') {
      postMode = pm;
    }
  } else if (legacyDraftId) {
    const pRes = await client.query<{
      title: string;
      description: string | null;
      amount: string;
      items: unknown;
      funnel_id: string | null;
      stage_id: string | null;
      post_accept_billing_mode: string | null;
      valid_until: string | null;
    }>(
      `SELECT p.title, p.description, p.amount::text, p.items, p.funnel_id::text, p.stage_id::text,
              p.post_accept_billing_mode::text, p.valid_until::text
       FROM proposals p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $2
       WHERE p.id = $1 AND p.status = 'draft'`,
      [legacyDraftId, input.tenantId],
    );
    if (pRes.rows.length === 0) return null;
    const p = pRes.rows[0];
    sourceLabel = 'proposal_draft_legacy';
    title = (p.title?.trim() || 'Proposta').slice(0, 500);
    description = p.description?.trim() ? p.description : null;
    const rawItems = Array.isArray(p.items) ? p.items : [];
    const normalized =
      rawItems.length > 0 ? normalizeProposalItemsFromRaw(rawItems as unknown[]) : { items: [] as NormItem[], sum: 0 };
    items = normalized.items;
    amount = items.length > 0 ? normalized.sum : Math.max(0, parseFloat(String(p.amount)) || 0);
    funnel_id = p.funnel_id;
    stage_id = p.stage_id;
    const pm = p.post_accept_billing_mode?.trim();
    if (pm === 'notify_team' || pm === 'auto_pending_invoice' || pm === 'none') {
      postMode = pm;
    }
    valid_until = p.valid_until?.trim() || null;
  } else {
    return null;
  }

  if (lid && postMode === 'auto_pending_invoice') {
    postMode = 'none';
  }

  const today = new Date().toISOString().slice(0, 10);
  const ins = await client.query<{ id: string }>(
    `INSERT INTO proposals (
      user_id, client_id, lead_id, funnel_id, stage_id, title, description, amount,
      status, sent_date, valid_until, items, post_accept_billing_mode
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sent', $9, $10, $11::jsonb, $12)
    RETURNING id::text`,
    [
      input.actorUserId,
      cid,
      lid,
      funnel_id,
      stage_id,
      title,
      description,
      amount,
      today,
      valid_until,
      JSON.stringify(items),
      postMode,
    ],
  );
  const newId = ins.rows[0]?.id;
  if (!newId) throw new Error('Falha ao criar proposta automática');

  const nextByCol = {
    ...byCol,
    [input.destColumnId]: { proposal_id: newId, model_id: modelId || legacyDraftId, source: sourceLabel },
  };
  const nextMeta = { ...meta, [METADATA_KEY]: nextByCol };
  await client.query(
    `UPDATE chat_kanban_cards SET metadata = $1::jsonb, updated_at = now(), updated_by_user_id = $4 WHERE id = $2 AND tenant_id = $3`,
    [JSON.stringify(nextMeta), input.cardId, input.tenantId, input.actorUserId],
  );

  await insertProposalTimelineEvent({
    proposalId: newId,
    eventType: 'kanban_column_auto_proposal_created',
    payload: {
      source: 'kanban_column_enter',
      board_id: input.boardId,
      column_id: input.destColumnId,
      card_id: input.cardId,
      conversation_id: input.conversationId,
      model_id: modelId,
      legacy_draft_id: legacyDraftId,
      automation: 'auto_create_proposal_on_enter',
    },
    actorUserId: input.actorUserId,
    dbClient: client,
  });

  return { id: newId, title, public_link_path: null };
}
