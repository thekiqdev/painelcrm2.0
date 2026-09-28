/**

 * S29 / S29.1 — nó ensure_conversation: telefone → create/reuse conversa → bind na sessão.

 * S29.1: idempotência opcional, DM-only estrito, falha explícita se instância desconectada.

 */

import { pool } from '../../utils/db.js';

import { digitsOnlyMsisdn } from '../../utils/groupInvitePhoneNormalize.js';

import { normalizeAttendanceStatusForDb } from '../../utils/chatAttendanceStatus.js';

import { applyKanbanAutomationForConversation } from '../chatKanbanAutomationService.js';

import { findStartNode, interpolateTemplate, type RuntimeGraph } from './flowRuntimeEngine.js';

import { parseStartGuardConfig } from './flowStartGuards.js';

import { isGroupExternalChatId } from './flowStartTrigger.js';



export type EnsureConversationReusePolicy = 'open' | 'any' | 'always_create';



export type EnsureConversationNodeData = {

  phone: string;

  normalize_br: boolean;

  instance_id?: string | null;

  reuse_policy: EnsureConversationReusePolicy;

  /** Template opcional (ex. {{order.id}}) — vazio = desligado. */

  idempotency_key: string;

};



const IDEMPOTENCY_KEY_MAX = 256;



export function parseEnsureConversationData(

  raw: Record<string, unknown> | null | undefined

): EnsureConversationNodeData {

  const d = raw || {};

  const policyRaw = String(d.reuse_policy || 'open');

  const reuse_policy: EnsureConversationReusePolicy =

    policyRaw === 'any' || policyRaw === 'always_create' ? policyRaw : 'open';

  const instanceRaw = d.instance_id != null ? String(d.instance_id).trim() : '';

  return {

    phone: String(d.phone ?? ''),

    normalize_br: d.normalize_br !== false,

    instance_id: instanceRaw || null,

    reuse_policy,

    idempotency_key: String(d.idempotency_key ?? '').trim(),

  };

}



/**

 * Normaliza telefone para dígitos WhatsApp (DM).

 * Com normalize_br: prefixa 55 em números BR 10–11 dígitos (igual outbound manual).

 * Rejeita JIDs de grupo (S29.1 DM-only).

 */

export function normalizeEnsureConversationPhone(

  raw: string,

  normalizeBr = true

): { ok: true; digits: string } | { ok: false; error: string } {

  const trimmed = String(raw || '').trim();

  if (!trimmed) return { ok: false, error: 'Telefone vazio' };



  if (isGroupExternalChatId(trimmed) || /@g\.us/i.test(trimmed)) {

    return { ok: false, error: 'Somente conversa 1:1 (DM); grupos não são permitidos' };

  }



  let digits = digitsOnlyMsisdn(trimmed);

  while (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('5555') && digits.length > 13) {

    digits = digits.slice(2);

  }



  if (normalizeBr && !digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {

    digits = `55${digits}`;

  }



  if (!digits || digits.length < 10 || digits.length > 15) {

    return { ok: false, error: 'Telefone inválido' };

  }



  if (normalizeBr && digits.startsWith('55')) {

    const rest = digits.slice(2);

    if (rest.length < 10 || rest.length > 11) {

      return { ok: false, error: 'Telefone brasileiro inválido' };

    }

  }



  return { ok: true, digits };

}



/** Preview editor (sem side-effects). */

export function previewNormalizedPhone(raw: string, normalizeBr = true): string {

  const r = normalizeEnsureConversationPhone(raw, normalizeBr);

  return r.ok ? `+${r.digits}` : '';

}



export function resolveEnsureIdempotencyKey(

  template: string | null | undefined,

  variables: Record<string, unknown>

): string | null {

  const raw = String(template || '').trim();

  if (!raw) return null;

  const resolved = interpolateTemplate(raw, variables).trim();

  if (!resolved) return null;

  return resolved.slice(0, IDEMPOTENCY_KEY_MAX);

}



function whatsappDirectJidFromDigits(digits: string): string {

  return `${digits}@s.whatsapp.net`;

}



const CONNECTED_STATUSES = new Set(['connected', 'open']);



export async function resolveEnsureConversationInstance(opts: {

  tenantId: string;

  ownerUserId: string;

  instanceIdFromNode: string | null;

  graph?: RuntimeGraph | null;

}): Promise<{ ok: true; instanceId: string; userId: string } | { ok: false; error: string }> {

  const fromNode = (opts.instanceIdFromNode || '').trim();

  if (fromNode) {

    const r = await pool.query<{ id: string; user_id: string; status: string | null }>(

      `SELECT i.id, i.user_id, i.status

       FROM chat_instances i

       INNER JOIN users u ON u.id = i.user_id

       WHERE i.id = $1::uuid AND u.tenant_id = $2::uuid

       LIMIT 1`,

      [fromNode, opts.tenantId]

    );

    const row = r.rows[0];

    if (!row) return { ok: false, error: 'Instância não encontrada no tenant' };

    const st = String(row.status || '').toLowerCase();

    if (!CONNECTED_STATUSES.has(st)) {

      return { ok: false, error: 'Instância desconectada' };

    }

    return { ok: true, instanceId: String(row.id), userId: String(row.user_id) };

  }



  // Herda start.instance_ids quando há exatamente uma.

  if (opts.graph) {

    const start = findStartNode(opts.graph);

    const guards = parseStartGuardConfig(

      start?.data && typeof start.data === 'object' ? (start.data as Record<string, unknown>) : {}

    );

    if (guards.instanceIds.length === 1) {

      return resolveEnsureConversationInstance({

        ...opts,

        instanceIdFromNode: guards.instanceIds[0]!,

        graph: null,

      });

    }

  }



  const r = await pool.query<{ id: string; user_id: string }>(

    `SELECT i.id, i.user_id

     FROM chat_instances i

     INNER JOIN users u ON u.id = i.user_id

     WHERE u.tenant_id = $1::uuid

       AND i.user_id = $2::uuid

       AND i.status IN ('connected', 'open')

     ORDER BY i.updated_at DESC NULLS LAST

     LIMIT 1`,

    [opts.tenantId, opts.ownerUserId]

  );

  let row = r.rows[0];

  if (!row) {

    const any = await pool.query<{ id: string; user_id: string }>(

      `SELECT i.id, i.user_id

       FROM chat_instances i

       INNER JOIN users u ON u.id = i.user_id

       WHERE u.tenant_id = $1::uuid

         AND i.status IN ('connected', 'open')

       ORDER BY i.updated_at DESC NULLS LAST

       LIMIT 1`,

      [opts.tenantId]

    );

    row = any.rows[0];

  }

  if (!row) return { ok: false, error: 'Nenhuma instância WhatsApp ativa' };

  return { ok: true, instanceId: String(row.id), userId: String(row.user_id) };

}



async function findConversationByPhone(opts: {

  tenantId: string;

  instanceId: string;

  digits: string;

  jid: string;

  onlyOpen: boolean;

}): Promise<{

  id: string;

  assigned_to_user_id: string | null;

  attendance_status: string | null;

  status: string | null;

  conversation_type: string | null;

  external_chat_id: string | null;

} | null> {

  const candidates = [

    opts.jid.toLowerCase(),

    opts.jid.replace(/@s\.whatsapp\.net$/i, '@c.us').toLowerCase(),

    opts.digits,

  ];

  const openClause = opts.onlyOpen

    ? `AND c.status = 'open'

       AND COALESCE(c.attendance_status, 'pending') NOT IN ('closed', 'archived')`

    : '';



  const r = await pool.query<{

    id: string;

    assigned_to_user_id: string | null;

    attendance_status: string | null;

    status: string | null;

    conversation_type: string | null;

    external_chat_id: string | null;

  }>(

    `SELECT c.id, c.assigned_to_user_id, c.attendance_status, c.status,

            c.conversation_type, c.external_chat_id

     FROM chat_conversations c

     INNER JOIN users owner ON owner.id = c.user_id

     WHERE owner.tenant_id = $1::uuid

       AND c.instance_id = $2::uuid

       AND COALESCE(c.conversation_type, 'direct') = 'direct'

       ${openClause}

       AND (

         lower(c.external_chat_id) = ANY($3::text[])

         OR lower(COALESCE(c.canonical_chat_id, '')) = ANY($3::text[])

         OR lower(COALESCE(c.provider_conversation_id, '')) = ANY($3::text[])

         OR NULLIF(regexp_replace(COALESCE(c.phone_number, ''), '[^0-9]', '', 'g'), '') = $4

         OR NULLIF(regexp_replace(COALESCE(c.canonical_phone, ''), '[^0-9]', '', 'g'), '') = $4

       )

     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC NULLS LAST

     LIMIT 1`,

    [opts.tenantId, opts.instanceId, candidates, opts.digits]

  );

  return r.rows[0] ?? null;

}



async function loadConversationMeta(

  tenantId: string,

  conversationId: string

): Promise<{

  id: string;

  assigned_to_user_id: string | null;

  attendance_status: string | null;

  conversation_type: string | null;

  external_chat_id: string | null;

} | null> {

  const r = await pool.query<{

    id: string;

    assigned_to_user_id: string | null;

    attendance_status: string | null;

    conversation_type: string | null;

    external_chat_id: string | null;

  }>(

    `SELECT c.id, c.assigned_to_user_id, c.attendance_status,

            c.conversation_type, c.external_chat_id

     FROM chat_conversations c

     INNER JOIN users u ON u.id = c.user_id

     WHERE c.id = $1::uuid AND u.tenant_id = $2::uuid

     LIMIT 1`,

    [conversationId, tenantId]

  );

  return r.rows[0] ?? null;

}



function isDmConversation(row: {

  conversation_type?: string | null;

  external_chat_id?: string | null;

}): boolean {

  const type = String(row.conversation_type || 'direct').toLowerCase();

  if (type === 'group') return false;

  if (isGroupExternalChatId(row.external_chat_id)) return false;

  return true;

}



async function createConversation(opts: {

  tenantId: string;

  actorUserId: string;

  instanceUserId: string;

  instanceId: string;

  digits: string;

  jid: string;

}): Promise<string> {

  const metadata = {

    source: 'chatbot_flows/ensure_conversation',

    phone_normalized: opts.digits,

    created_by_ensure_conversation_at: new Date().toISOString(),

  };

  const inserted = await pool.query<{ id: string }>(

    `INSERT INTO chat_conversations (

      user_id, instance_id, external_chat_id, contact_name, profile_name, phone_number,

      status, last_message_at, unread_count, metadata, client_id, lead_id,

      canonical_chat_id, canonical_phone, display_name, identity_source, identity_strength,

      identity_state, history_sync_status, last_history_sync_reason, provider,

      provider_conversation_id, conversation_type, attendance_status

    )

    VALUES (

      $1, $2, $3, $4, $4, $5,

      'open', NULL, 0, $6::jsonb, NULL, NULL,

      $3, $5, $4, 'phone_derived', 'medium',

      'resolved', 'ready', 'ensure_conversation',

      'whatsapp_uazapi', $3, 'direct', $7

    )

    RETURNING id`,

    [

      opts.instanceUserId,

      opts.instanceId,

      opts.jid,

      opts.digits,

      opts.digits,

      JSON.stringify(metadata),

      normalizeAttendanceStatusForDb(undefined),

    ]

  );

  const conversationId = String(inserted.rows[0]!.id);

  void applyKanbanAutomationForConversation({

    tenantId: opts.tenantId,

    actorUserId: opts.actorUserId,

    conversationId,

    reason: 'new_conversation',

  }).catch((err) =>

    console.error('[kanban-entry-automation] new_conversation (ensure_conversation)', err)

  );

  return conversationId;

}



async function lookupIdempotentConversation(opts: {

  tenantId: string;

  flowId: string;

  key: string;

}): Promise<string | null> {

  try {

    const r = await pool.query<{ conversation_id: string }>(

      `SELECT conversation_id

       FROM chatbot_flow_ensure_idempotency

       WHERE tenant_id = $1::uuid

         AND flow_id = $2::uuid

         AND idempotency_key = $3

       LIMIT 1`,

      [opts.tenantId, opts.flowId, opts.key]

    );

    return r.rows[0] ? String(r.rows[0].conversation_id) : null;

  } catch (e) {

    const code = (e as { code?: string })?.code;

    // Tabela ainda não migrada — fail-open (sem idempotência).

    if (code === '42P01') return null;

    throw e;

  }

}



async function upsertIdempotentConversation(opts: {

  tenantId: string;

  flowId: string;

  key: string;

  conversationId: string;

}): Promise<void> {

  try {

    await pool.query(

      `INSERT INTO chatbot_flow_ensure_idempotency

         (tenant_id, flow_id, idempotency_key, conversation_id)

       VALUES ($1::uuid, $2::uuid, $3, $4::uuid)

       ON CONFLICT (tenant_id, flow_id, idempotency_key)

       DO UPDATE SET

         conversation_id = EXCLUDED.conversation_id,

         updated_at = now()`,

      [opts.tenantId, opts.flowId, opts.key, opts.conversationId]

    );

  } catch (e) {

    const code = (e as { code?: string })?.code;

    if (code === '42P01') return;

    throw e;

  }

}



export type RuntimeEnsureConversationResult =

  | {

      ok: true;

      conversationId: string;

      created: boolean;

      reused: boolean;

      idempotent: boolean;

      digits: string;

      /** Conversa já em atendimento humano — runner deve pausar (D1). */

      humanInProgress: boolean;

      mappedVariables: Record<string, string>;

    }

  | { ok: false; error: string; mappedVariables: Record<string, string> };



/**

 * Resolve telefone, find-or-create conversa e devolve vars de seed para a sessão.

 * Bind em `chatbot_flow_sessions` fica a cargo do runner.

 */

export async function runtimeEnsureConversation(opts: {

  tenantId: string;

  ownerUserId: string;

  flowId?: string | null;

  /** Já amarrada (webhook legado) — no-op sucesso. */

  existingConversationId?: string | null;

  phoneTemplate: string;

  normalizeBr: boolean;

  instanceId?: string | null;

  reusePolicy: EnsureConversationReusePolicy;

  /** Template opcional interpolado (S29.1). */

  idempotencyKeyTemplate?: string | null;

  variables: Record<string, unknown>;

  graph?: RuntimeGraph | null;

}): Promise<RuntimeEnsureConversationResult> {

  if (opts.existingConversationId) {

    const id = String(opts.existingConversationId);

    const meta = await loadConversationMeta(opts.tenantId, id);

    if (meta && !isDmConversation(meta)) {

      return {

        ok: false,

        error: 'Somente conversa 1:1 (DM); grupos não são permitidos',

        mappedVariables: {

          'ensure_conversation.error': 'Somente conversa 1:1 (DM); grupos não são permitidos',

        },

      };

    }

    return {

      ok: true,

      conversationId: id,

      created: false,

      reused: true,

      idempotent: false,

      digits: String(opts.variables['contact.phone'] || opts.variables.contact_phone || ''),

      humanInProgress: false,

      mappedVariables: {

        'conversation.id': id,

        conversation_id: id,

        'ensure_conversation.reused': 'true',

        'ensure_conversation.created': 'false',

        'ensure_conversation.idempotent': 'false',

      },

    };

  }



  const idemKey = resolveEnsureIdempotencyKey(opts.idempotencyKeyTemplate, opts.variables);

  const flowId = opts.flowId != null ? String(opts.flowId).trim() : '';



  if (idemKey && flowId) {

    const existingId = await lookupIdempotentConversation({

      tenantId: opts.tenantId,

      flowId,

      key: idemKey,

    });

    if (existingId) {

      const meta = await loadConversationMeta(opts.tenantId, existingId);

      if (meta && isDmConversation(meta)) {

        const humanInProgress =

          meta.assigned_to_user_id != null ||

          String(meta.attendance_status || '') === 'in_progress';

        return {

          ok: true,

          conversationId: existingId,

          created: false,

          reused: true,

          idempotent: true,

          digits: String(opts.variables['contact.phone'] || opts.variables.contact_phone || ''),

          humanInProgress,

          mappedVariables: {

            'conversation.id': existingId,

            conversation_id: existingId,

            'ensure_conversation.reused': 'true',

            'ensure_conversation.created': 'false',

            'ensure_conversation.idempotent': 'true',

            'ensure_conversation.idempotency_key': idemKey,

          },

        };

      }

    }

  }



  const phoneRaw = interpolateTemplate(opts.phoneTemplate, opts.variables).trim();

  const normalized = normalizeEnsureConversationPhone(phoneRaw, opts.normalizeBr);

  if (!normalized.ok) {

    return {

      ok: false,

      error: normalized.error,

      mappedVariables: {

        'ensure_conversation.error': normalized.error,

      },

    };

  }



  const inst = await resolveEnsureConversationInstance({

    tenantId: opts.tenantId,

    ownerUserId: opts.ownerUserId,

    instanceIdFromNode: opts.instanceId || null,

    graph: opts.graph,

  });

  if (!inst.ok) {

    return {

      ok: false,

      error: inst.error,

      mappedVariables: { 'ensure_conversation.error': inst.error },

    };

  }



  const digits = normalized.digits;

  const jid = whatsappDirectJidFromDigits(digits);

  let conversationId: string;

  let created = false;

  let reused = false;

  let humanInProgress = false;



  if (opts.reusePolicy !== 'always_create') {

    const found = await findConversationByPhone({

      tenantId: opts.tenantId,

      instanceId: inst.instanceId,

      digits,

      jid,

      onlyOpen: opts.reusePolicy === 'open',

    });

    if (found) {

      if (!isDmConversation(found)) {

        return {

          ok: false,

          error: 'Somente conversa 1:1 (DM); grupos não são permitidos',

          mappedVariables: {

            'ensure_conversation.error': 'Somente conversa 1:1 (DM); grupos não são permitidos',

          },

        };

      }

      conversationId = String(found.id);

      reused = true;

      humanInProgress =

        found.assigned_to_user_id != null ||

        String(found.attendance_status || '') === 'in_progress';

    } else {

      conversationId = await createConversation({

        tenantId: opts.tenantId,

        actorUserId: opts.ownerUserId,

        instanceUserId: inst.userId,

        instanceId: inst.instanceId,

        digits,

        jid,

      });

      created = true;

    }

  } else {

    conversationId = await createConversation({

      tenantId: opts.tenantId,

      actorUserId: opts.ownerUserId,

      instanceUserId: inst.userId,

      instanceId: inst.instanceId,

      digits,

      jid,

    });

    created = true;

  }



  if (idemKey && flowId) {

    await upsertIdempotentConversation({

      tenantId: opts.tenantId,

      flowId,

      key: idemKey,

      conversationId,

    });

  }



  return {

    ok: true,

    conversationId,

    created,

    reused,

    idempotent: false,

    digits,

    humanInProgress,

    mappedVariables: {

      'conversation.id': conversationId,

      conversation_id: conversationId,

      'contact.phone': digits,

      contact_phone: digits,

      canonical_phone: digits,

      'ensure_conversation.phone': digits,

      'ensure_conversation.reused': reused ? 'true' : 'false',

      'ensure_conversation.created': created ? 'true' : 'false',

      'ensure_conversation.idempotent': 'false',

      'ensure_conversation.instance_id': inst.instanceId,

      ...(idemKey ? { 'ensure_conversation.idempotency_key': idemKey } : {}),

    },

  };

}



export async function bindSessionConversation(opts: {

  sessionId: string;

  conversationId: string;

}): Promise<void> {

  await pool.query(

    `UPDATE chatbot_flow_sessions

     SET conversation_id = $2::uuid,

         updated_at = now()

     WHERE id = $1::uuid`,

    [opts.sessionId, opts.conversationId]

  );

}



export async function resolveFlowIdFromSession(sessionId: string): Promise<string | null> {

  const r = await pool.query<{ flow_id: string }>(

    `SELECT flow_id FROM chatbot_flow_sessions WHERE id = $1::uuid LIMIT 1`,

    [sessionId]

  );

  return r.rows[0] ? String(r.rows[0].flow_id) : null;

}


