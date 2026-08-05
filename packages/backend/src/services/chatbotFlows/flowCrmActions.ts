/**
 * Ações CRM do runtime Chatbot Flows (S4) — tag, assign, move kanban.
 * S15 — nota interna + resolver atendimento.
 */
import { pool } from '../../utils/db.js';
import { hasAssignedTeamColumn } from '../../utils/chatAttendanceSchema.js';
import { getOrCreateKanbanTag } from '../chatKanbanTagStore.js';
import { addKanbanTagToConversation } from '../chatKanbanConversationKanbanTagsService.js';
import { emitToTenant } from '../realtimeService.js';
import { emitConversationAttendanceUpdated } from '../websocketService.js';

export async function runtimeAddTag(opts: {
  tenantId: string;
  actorUserId: string;
  conversationId: string;
  tagLabel?: string;
  tagId?: string;
}): Promise<void> {
  let tag;
  if (opts.tagId) {
    const r = await pool.query(
      `SELECT id, tenant_id, label, color FROM chat_kanban_tags
       WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`,
      [opts.tenantId, opts.tagId]
    );
    tag = r.rows[0];
    if (!tag) throw new Error('Tag não encontrada');
  } else {
    const label = String(opts.tagLabel || '').trim();
    if (!label) throw new Error('Label da tag obrigatório');
    tag = await getOrCreateKanbanTag(opts.tenantId, label);
  }
  await addKanbanTagToConversation({
    tenantId: opts.tenantId,
    actorUserId: opts.actorUserId,
    conversationId: opts.conversationId,
    tag,
  });
}

export async function runtimeAssignConversation(opts: {
  conversationId: string;
  mode: 'user' | 'team' | 'queue';
  userId?: string;
  teamId?: string;
  queueId?: string;
}): Promise<void> {
  if (opts.mode === 'user') {
    const userId = opts.userId?.trim();
    if (!userId) throw new Error('userId obrigatório');
    await pool.query(
      `UPDATE chat_conversations
       SET assigned_to_user_id = $2::uuid,
           assigned_team_id = NULL,
           attendance_status = 'in_progress',
           assigned_at = now(),
           last_assigned_at = now(),
           closed_at = NULL,
           closed_by = NULL,
           last_assignment_reason = 'chatbot_flows_assign',
           updated_at = now()
       WHERE id = $1::uuid`,
      [opts.conversationId, userId]
    );
    return;
  }
  if (opts.mode === 'team') {
    const teamId = opts.teamId?.trim();
    if (!teamId) throw new Error('teamId obrigatório');
    await pool.query(
      `UPDATE chat_conversations
       SET assigned_team_id = $2::uuid,
           assigned_to_user_id = NULL,
           queue_id = NULL,
           attendance_status = 'pending',
           last_assignment_reason = 'chatbot_flows_assign_team',
           updated_at = now()
       WHERE id = $1::uuid`,
      [opts.conversationId, teamId]
    );
    return;
  }
  const queueId = opts.queueId?.trim() || null;
  await pool.query(
    `UPDATE chat_conversations
     SET queue_id = $2::uuid,
         assigned_to_user_id = NULL,
         attendance_status = 'pending',
         last_assignment_reason = 'chatbot_flows_queue',
         updated_at = now()
     WHERE id = $1::uuid`,
    [opts.conversationId, queueId]
  );
}

/**
 * Move card da conversa para a coluna. Cria card se não existir no board da coluna.
 */
/**
 * Garante a conversa no board/coluna do kanban (vínculo = conversation_id).
 * - Card existe → move para a coluna alvo
 * - Não existe → cria
 * Title/description opcionais vão em metadata (schema kanban sem coluna title).
 */
export async function runtimeEnsureKanbanCard(opts: {
  tenantId: string;
  actorUserId?: string;
  conversationId: string;
  boardId?: string;
  columnId: string;
  title?: string;
  description?: string;
  tagLabel?: string;
  tagId?: string;
}): Promise<{
  ok: boolean;
  created: boolean;
  moved: boolean;
  cardId?: string;
  boardId?: string;
  columnId?: string;
  error?: string;
}> {
  const col = await pool.query<{ id: string; board_id: string }>(
    `SELECT id, board_id FROM chat_kanban_columns
     WHERE id = $1::uuid AND tenant_id = $2::uuid
     LIMIT 1`,
    [opts.columnId, opts.tenantId]
  );
  const column = col.rows[0];
  if (!column) {
    return { ok: false, created: false, moved: false, error: 'Coluna Kanban não encontrada' };
  }
  if (opts.boardId && String(column.board_id) !== String(opts.boardId)) {
    return {
      ok: false,
      created: false,
      moved: false,
      error: 'Coluna não pertence ao board selecionado',
    };
  }
  const boardId = String(column.board_id);

  const boardOk = await pool.query(
    `SELECT 1 FROM chat_kanban_boards
     WHERE id = $1::uuid AND tenant_id = $2::uuid AND archived_at IS NULL
     LIMIT 1`,
    [boardId, opts.tenantId]
  );
  if (!boardOk.rows[0]) {
    return { ok: false, created: false, moved: false, error: 'Board Kanban não encontrado' };
  }

  const existing = await pool.query<{ id: string; column_id: string }>(
    `SELECT id, column_id FROM chat_kanban_cards
     WHERE tenant_id = $1::uuid AND board_id = $2::uuid AND conversation_id = $3::uuid
       AND archived_at IS NULL
     LIMIT 1`,
    [opts.tenantId, boardId, opts.conversationId]
  );

  if (existing.rows[0]) {
    const cardId = String(existing.rows[0].id);
    const sameColumn = String(existing.rows[0].column_id) === column.id;
    if (!sameColumn) {
      await pool.query(
        `UPDATE chat_kanban_cards
         SET column_id = $2::uuid, updated_at = now()
         WHERE id = $1::uuid`,
        [cardId, column.id]
      );
    }
    if (opts.tagId || opts.tagLabel) {
      try {
        await runtimeAddTag({
          tenantId: opts.tenantId,
          actorUserId: opts.actorUserId || opts.tenantId,
          conversationId: opts.conversationId,
          tagId: opts.tagId,
          tagLabel: opts.tagLabel,
        });
      } catch (e) {
        console.warn('[chatbot_flows] move_kanban tag failed', e);
      }
    }
    return {
      ok: true,
      created: false,
      moved: !sameColumn,
      cardId,
      boardId,
      columnId: column.id,
    };
  }

  const meta: Record<string, unknown> = {
    source: 'chatbot_flows',
  };
  const title = String(opts.title || '').trim();
  const description = String(opts.description || '').trim();
  if (title) meta.title = title;
  if (description) meta.description = description;

  const pos = await pool.query(
    `SELECT COALESCE(MAX(position), 0)::int + 1 AS p
     FROM chat_kanban_cards
     WHERE board_id = $1::uuid AND column_id = $2::uuid AND archived_at IS NULL`,
    [boardId, column.id]
  );

  let cardId: string;
  try {
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO chat_kanban_cards (
         tenant_id, board_id, column_id, conversation_id, position, metadata, created_by_user_id
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::jsonb, $7::uuid)
       RETURNING id::text AS id`,
      [
        opts.tenantId,
        boardId,
        column.id,
        opts.conversationId,
        pos.rows[0]?.p ?? 1,
        JSON.stringify(meta),
        opts.actorUserId || null,
      ]
    );
    cardId = String(ins.rows[0]?.id || '');
  } catch (e: unknown) {
    const code =
      typeof e === 'object' && e !== null && 'code' in e
        ? String((e as { code: unknown }).code)
        : '';
    if (code === '23505') {
      const again = await pool.query<{ id: string; column_id: string }>(
        `SELECT id, column_id FROM chat_kanban_cards
         WHERE tenant_id = $1::uuid AND board_id = $2::uuid AND conversation_id = $3::uuid
           AND archived_at IS NULL
         LIMIT 1`,
        [opts.tenantId, boardId, opts.conversationId]
      );
      if (again.rows[0]) {
        const cardIdRace = String(again.rows[0].id);
        if (String(again.rows[0].column_id) !== column.id) {
          await pool.query(
            `UPDATE chat_kanban_cards
             SET column_id = $2::uuid, updated_at = now()
             WHERE id = $1::uuid`,
            [cardIdRace, column.id]
          );
        }
        return {
          ok: true,
          created: false,
          moved: String(again.rows[0].column_id) !== column.id,
          cardId: cardIdRace,
          boardId,
          columnId: column.id,
        };
      }
      return {
        ok: false,
        created: false,
        moved: false,
        error: 'Conversa já possui card neste board',
      };
    }
    throw e;
  }

  if (opts.tagId || opts.tagLabel) {
    try {
      await runtimeAddTag({
        tenantId: opts.tenantId,
        actorUserId: opts.actorUserId || opts.tenantId,
        conversationId: opts.conversationId,
        tagId: opts.tagId,
        tagLabel: opts.tagLabel,
      });
    } catch (e) {
      console.warn('[chatbot_flows] move_kanban tag failed', e);
    }
  }

  return {
    ok: true,
    created: true,
    moved: false,
    cardId,
    boardId,
    columnId: column.id,
  };
}

/** @deprecated use runtimeEnsureKanbanCard — mantido para callers legados */
export async function runtimeMoveKanban(opts: {
  tenantId: string;
  conversationId: string;
  columnId: string;
}): Promise<void> {
  const res = await runtimeEnsureKanbanCard(opts);
  if (!res.ok) throw new Error(res.error || 'Falha no Kanban');
}

/** Alias S16 — mesmo create-or-move por conversation_id. */
export async function runtimeKanbanAddCard(opts: {
  tenantId: string;
  actorUserId: string;
  conversationId: string;
  boardId: string;
  columnId: string;
  title?: string;
  description?: string;
  onlyIfNotExists?: boolean;
  tagLabel?: string;
  tagId?: string;
}): Promise<{
  ok: boolean;
  created: boolean;
  moved: boolean;
  cardId?: string;
  boardId?: string;
  columnId?: string;
  error?: string;
}> {
  return runtimeEnsureKanbanCard(opts);
}

/** Nota CRM interna (não envia WhatsApp). */
export async function runtimeCreateConversationNote(opts: {
  tenantId: string;
  actorUserId: string;
  conversationId: string;
  noteText: string;
  noteType?: 'internal' | 'general';
}): Promise<void> {
  const text = String(opts.noteText || '').trim();
  if (!text) throw new Error('Texto da nota vazio');

  const conv = await pool.query<{
    client_id: string | null;
    lead_id: string | null;
  }>(
    `SELECT client_id, lead_id FROM chat_conversations
     WHERE id = $1::uuid AND tenant_id = $2::uuid
     LIMIT 1`,
    [opts.conversationId, opts.tenantId]
  );
  const row = conv.rows[0];
  if (!row) throw new Error('Conversa não encontrada');

  const noteType = opts.noteType === 'general' ? 'general' : 'internal';
  const ins = await pool.query(
    `INSERT INTO crm_notes (
       tenant_id, client_id, lead_id, conversation_id, message_id, author_user_id,
       note_type, note_text, pinned, source_comment_id
     )
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, NULL, $5::uuid, $6, $7, false, NULL)
     RETURNING *`,
    [
      opts.tenantId,
      row.client_id,
      row.lead_id,
      opts.conversationId,
      opts.actorUserId,
      noteType,
      text,
    ]
  );
  emitToTenant(opts.tenantId, 'crm.note.created', {
    v: 1,
    type: 'crm.note.created',
    note: ins.rows[0],
    ts: new Date().toISOString(),
  });
}

/** Fecha atendimento (attendance closed) — espelha action close do chat. */
export async function runtimeResolveConversation(opts: {
  tenantId: string;
  actorUserId: string;
  conversationId: string;
}): Promise<void> {
  const hasTeamCol = await hasAssignedTeamColumn();
  const clearTeam = hasTeamCol ? ', assigned_team_id = NULL' : '';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prevRes = await client.query<{
      id: string;
      user_id: string;
      attendance_status: string | null;
      assigned_to_user_id: string | null;
      queue_id: string | null;
      tenant_id: string | null;
    }>(
      `SELECT id, user_id, attendance_status, assigned_to_user_id, queue_id, tenant_id
       FROM chat_conversations
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       FOR UPDATE`,
      [opts.conversationId, opts.tenantId]
    );
    const prev = prevRes.rows[0];
    if (!prev) {
      await client.query('ROLLBACK');
      throw new Error('Conversa não encontrada');
    }
    if (prev.attendance_status === 'closed' || prev.attendance_status === 'archived') {
      await client.query('COMMIT');
      return;
    }

    const upd = await client.query(
      `UPDATE chat_conversations
       SET attendance_status = 'closed',
           assigned_to_user_id = NULL,
           queue_id = NULL
           ${clearTeam},
           closed_at = now(),
           closed_by = $2::uuid,
           last_assignment_reason = 'chatbot_flows_resolve',
           assigned_at = NULL,
           updated_at = now()
       WHERE id = $1::uuid
       RETURNING id, user_id, attendance_status, assigned_to_user_id, queue_id,
                 assigned_at, closed_at, last_assignment_reason, closed_by`,
      [opts.conversationId, opts.actorUserId]
    );

    await client.query(
      `INSERT INTO chat_conversation_assignment_history (
         conversation_id, tenant_id, from_status, to_status, from_user_id, to_user_id,
         queue_id, actor_user_id, operation, reason, to_team_id
       ) VALUES ($1::uuid, $2::uuid, $3, 'closed', $4::uuid, NULL, $5::uuid, $6::uuid,
                 'close', 'chatbot_flows_resolve', NULL)`,
      [
        opts.conversationId,
        prev.tenant_id || opts.tenantId,
        prev.attendance_status,
        prev.assigned_to_user_id,
        prev.queue_id,
        opts.actorUserId,
      ]
    );

    await client.query('COMMIT');

    const row = upd.rows[0] as Record<string, unknown> | undefined;
    if (row) {
      emitConversationAttendanceUpdated(opts.tenantId, String(row.user_id || prev.user_id), {
        id: opts.conversationId,
        attendance_status: 'closed',
        assigned_to_user_id: null,
        queue_id: null,
        closed_at: row.closed_at,
        closed_by: opts.actorUserId,
        last_assignment_reason: 'chatbot_flows_resolve',
      });
    }
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

export type ContactPersistField = 'name' | 'email' | 'phone' | 'company' | 'cpf_cnpj';

/**
 * S20 — grava resposta de wait_input no cliente/lead vinculado à conversa.
 * Soft-fail: sem entidade CRM ou valor inválido → warn, não lança.
 */
export async function runtimeUpdateContact(opts: {
  tenantId: string;
  conversationId: string;
  field: ContactPersistField;
  value: string;
}): Promise<{ ok: boolean; entity?: 'client' | 'lead'; reason?: string }> {
  const raw = String(opts.value || '').trim();
  if (!raw) return { ok: false, reason: 'empty_value' };

  const conv = await pool.query<{
    client_id: string | null;
    lead_id: string | null;
  }>(
    `SELECT client_id, lead_id FROM chat_conversations
     WHERE id = $1::uuid AND tenant_id = $2::uuid
     LIMIT 1`,
    [opts.conversationId, opts.tenantId]
  );
  const row = conv.rows[0];
  if (!row) return { ok: false, reason: 'conversation_not_found' };

  let value = raw;
  if (opts.field === 'cpf_cnpj') {
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 11 && digits.length !== 14) {
      return { ok: false, reason: 'invalid_cpf_cnpj' };
    }
    value = digits;
  } else if (opts.field === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      return { ok: false, reason: 'invalid_email' };
    }
  }

  const allowedCols = new Set(['name', 'email', 'phone', 'company', 'cpf_cnpj']);
  if (!allowedCols.has(opts.field)) return { ok: false, reason: 'invalid_field' };

  if (row.client_id) {
    const r = await pool.query(
      `UPDATE clients c
       SET ${opts.field} = $1, updated_at = now()
       FROM users u
       WHERE c.id = $2::uuid
         AND c.user_id = u.id
         AND u.tenant_id = $3::uuid
       RETURNING c.id`,
      [value, row.client_id, opts.tenantId]
    );
    if (r.rowCount && r.rows[0]) return { ok: true, entity: 'client' };
    return { ok: false, reason: 'client_update_failed' };
  }

  if (row.lead_id) {
    if (opts.field === 'cpf_cnpj') {
      // leads não têm cpf_cnpj no schema HTTP; evita SQL em coluna inexistente
      return { ok: false, reason: 'cpf_cnpj_requires_client' };
    }
    const r = await pool.query(
      `UPDATE leads l
       SET ${opts.field} = $1, updated_at = now()
       FROM users u
       WHERE l.id = $2::uuid
         AND l.user_id = u.id
         AND u.tenant_id = $3::uuid
       RETURNING l.id`,
      [value, row.lead_id, opts.tenantId]
    );
    if (r.rowCount && r.rows[0]) return { ok: true, entity: 'lead' };
    return { ok: false, reason: 'lead_update_failed' };
  }

  return { ok: false, reason: 'no_crm_entity' };
}
