/**
 * Conversão de vínculo CRM na conversa (S26.1) — to_lead / to_client.
 * Espelha Kanban lead_create_or_link / ensure_client sem stamps de coluna.
 */
import type { PoolClient } from 'pg';
import { pool } from '../../utils/db.js';
import { migrateTicketsLeadToClientInTransaction } from '../leadConversionMigrationService.js';
import { classifyCrmLinkKind, type CrmLinkKind } from './flowCrmLinkActions.js';

export type CrmConvertMode = 'to_lead' | 'to_client';
export type CrmConvertResult = 'created' | 'linked' | 'unchanged';
export type CrmConvertOutHandle = 'default' | 'already_client' | 'error';

export type RuntimeCrmConvertResult = {
  outHandle: CrmConvertOutHandle;
  mapped: Record<string, string>;
  ok: boolean;
};

type ConvRow = {
  id: string;
  user_id: string;
  client_id: string | null;
  lead_id: string | null;
  display_name: string | null;
  contact_name: string | null;
  profile_name: string | null;
  phone_number: string | null;
  canonical_phone: string | null;
  metadata: unknown;
};

const FLOW_LEAD_SOURCE = 'chatbot_flow';
const FLOW_CLIENT_SOURCE = 'chatbot_flow';

function digitsOnly(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return '';
  return value.replace(/\D/g, '');
}

function extractEmailFromConversationMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  for (const key of ['email', 'contact_email', 'contactEmail']) {
    const v = m[key];
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return t;
    }
  }
  return null;
}

function contactDisplayName(row: ConvRow): string {
  return (
    [row.display_name, row.contact_name, row.profile_name]
      .find((s) => typeof s === 'string' && s.trim().length > 0)
      ?.trim() || ''
  );
}

type Identity = {
  phoneDigits: string;
  emailNorm: string | null;
  name: string;
};

function identityFromConversation(row: ConvRow): Identity {
  const fromCanon = digitsOnly(row.canonical_phone);
  const fromPhone = digitsOnly(row.phone_number);
  const phoneDigits = fromCanon.length >= fromPhone.length ? fromCanon : fromPhone;
  const emailNorm = extractEmailFromConversationMetadata(row.metadata);
  let name = contactDisplayName(row).slice(0, 200);
  if (!name && phoneDigits.length >= 8) name = `WhatsApp +${phoneDigits}`.slice(0, 200);
  if (!name && emailNorm) name = emailNorm.split('@')[0]!.slice(0, 200);
  if (!name) name = 'Contato';
  return { phoneDigits, emailNorm, name };
}

function hasMinIdentity(id: Identity): boolean {
  return id.phoneDigits.length >= 8 || !!id.emailNorm;
}

async function conversationHasLeadIdColumn(client: PoolClient): Promise<boolean> {
  const r = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'lead_id'
     ) AS exists`
  );
  return Boolean(r.rows[0]?.exists);
}

function baseMapped(opts: {
  mode: CrmConvertMode;
  result?: CrmConvertResult | '';
  kind: CrmLinkKind;
  error?: string;
  clientId?: string | null;
  leadId?: string | null;
  clientName?: string | null;
  leadName?: string | null;
}): Record<string, string> {
  const mapped: Record<string, string> = {
    'crm.convert_mode': opts.mode,
    crm_convert_mode: opts.mode,
    'crm.convert_result': opts.result || '',
    crm_convert_result: opts.result || '',
    'crm.link_kind': opts.kind,
    crm_link_kind: opts.kind,
    'crm.convert_error': opts.error || '',
    crm_convert_error: opts.error || '',
    'client.id': opts.clientId || '',
    client_id: opts.clientId || '',
    'lead.id': opts.leadId || '',
    lead_id: opts.leadId || '',
  };
  if (opts.clientName) {
    mapped['client.name'] = opts.clientName;
    mapped.client_name = opts.clientName;
  }
  if (opts.leadName) {
    mapped['lead.name'] = opts.leadName;
    mapped.lead_name = opts.leadName;
  }
  return mapped;
}

async function loadClientName(client: PoolClient, clientId: string, fallback: string): Promise<string> {
  const r = await client.query<{ name: string | null }>(
    `SELECT name FROM clients WHERE id = $1::uuid LIMIT 1`,
    [clientId]
  );
  return String(r.rows[0]?.name || fallback || '').trim();
}

async function loadLeadName(client: PoolClient, leadId: string, fallback: string): Promise<string> {
  const r = await client.query<{ name: string | null }>(
    `SELECT name FROM leads WHERE id = $1::uuid LIMIT 1`,
    [leadId]
  );
  return String(r.rows[0]?.name || fallback || '').trim();
}

async function findUniqueLead(
  client: PoolClient,
  tenantId: string,
  id: Identity
): Promise<{ id: string } | 'ambiguous' | null> {
  if (id.phoneDigits.length >= 8) {
    const r = await client.query<{ id: string }>(
      `SELECT l.id
       FROM leads l
       INNER JOIN users u ON u.id = l.user_id
       WHERE u.tenant_id = $1
         AND regexp_replace(COALESCE(l.phone, ''), '\\D', '', 'g') = $2
       LIMIT 3`,
      [tenantId, id.phoneDigits]
    );
    if (r.rows.length > 1) return 'ambiguous';
    if (r.rows.length === 1) return r.rows[0]!;
  }
  if (id.emailNorm) {
    const r = await client.query<{ id: string }>(
      `SELECT l.id
       FROM leads l
       INNER JOIN users u ON u.id = l.user_id
       WHERE u.tenant_id = $1
         AND l.email IS NOT NULL
         AND lower(trim(l.email)) = $2
       LIMIT 3`,
      [tenantId, id.emailNorm]
    );
    if (r.rows.length > 1) return 'ambiguous';
    if (r.rows.length === 1) return r.rows[0]!;
  }
  return null;
}

async function findUniqueClient(
  client: PoolClient,
  tenantId: string,
  cand: { phoneNorm: string | null; emailNorm: string | null }
): Promise<{ id: string } | 'ambiguous' | null> {
  if (cand.phoneNorm) {
    const r = await client.query<{ id: string }>(
      `SELECT c.id
       FROM clients c
       INNER JOIN users u ON u.id = c.user_id
       WHERE u.tenant_id = $1
         AND c.phone IS NOT NULL
         AND c.phone <> ''
         AND (
           regexp_replace(c.phone, '\\D', '', 'g') = $2
           OR regexp_replace(c.phone, '\\D', '', 'g') = substring($2 from 3)
         )
       LIMIT 3`,
      [tenantId, cand.phoneNorm]
    );
    if (r.rows.length > 1) return 'ambiguous';
    if (r.rows.length === 1) return r.rows[0]!;
  }
  if (cand.emailNorm) {
    const r = await client.query<{ id: string }>(
      `SELECT c.id
       FROM clients c
       INNER JOIN users u ON u.id = c.user_id
       WHERE u.tenant_id = $1
         AND c.email IS NOT NULL
         AND lower(trim(c.email)) = $2
       LIMIT 3`,
      [tenantId, cand.emailNorm]
    );
    if (r.rows.length > 1) return 'ambiguous';
    if (r.rows.length === 1) return r.rows[0]!;
  }
  return null;
}

async function linkConversationClient(
  client: PoolClient,
  row: ConvRow,
  clientId: string,
  previousLeadId: string | null,
  actorUserId: string,
  hasLeadCol: boolean
): Promise<void> {
  const migrationPayload = previousLeadId
    ? {
        type: 'lead_to_client',
        at: new Date().toISOString(),
        previous_lead_id: previousLeadId,
        new_client_id: clientId,
        actor_user_id: actorUserId,
        reason: 'chatbot_flow_crm_convert',
      }
    : null;
  const up = await client.query(
    hasLeadCol
      ? `UPDATE chat_conversations
         SET client_id = $1::uuid,
             lead_id = NULL,
             metadata = COALESCE(metadata, '{}'::jsonb) ||
               jsonb_build_object(
                 'link_source','system',
                 'link_confidence','high',
                 'link_state','client_linked'
               ) ||
               CASE WHEN $2::jsonb IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('link_migration', $2::jsonb) END,
             updated_at = now()
         WHERE id = $3::uuid
         RETURNING id`
      : `UPDATE chat_conversations
         SET client_id = $1::uuid,
             metadata = COALESCE(metadata, '{}'::jsonb) ||
               jsonb_build_object(
                 'link_source','system',
                 'link_confidence','high',
                 'link_state','client_linked'
               ) ||
               CASE WHEN $2::jsonb IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('link_migration', $2::jsonb) END,
             updated_at = now()
         WHERE id = $3::uuid
         RETURNING id`,
    [clientId, migrationPayload ? JSON.stringify(migrationPayload) : null, row.id]
  );
  if ((up.rowCount ?? 0) === 0) {
    throw new Error('Falha ao vincular cliente na conversa.');
  }
}

async function convertToLead(
  client: PoolClient,
  opts: {
    tenantId: string;
    actorUserId: string;
    row: ConvRow;
    hasLeadCol: boolean;
  }
): Promise<RuntimeCrmConvertResult> {
  const { row, tenantId, actorUserId, hasLeadCol } = opts;
  const fallbackName = contactDisplayName(row);

  if (row.client_id) {
    const name = await loadClientName(client, row.client_id, fallbackName);
    return {
      ok: true,
      outHandle: 'already_client',
      mapped: baseMapped({
        mode: 'to_lead',
        result: 'unchanged',
        kind: 'client',
        clientId: row.client_id,
        clientName: name,
        error: 'already_client',
      }),
    };
  }

  if (!hasLeadCol) {
    return {
      ok: false,
      outHandle: 'error',
      mapped: baseMapped({
        mode: 'to_lead',
        kind: 'unlinked',
        error: 'lead_column_unavailable',
      }),
    };
  }

  if (row.lead_id) {
    const name = await loadLeadName(client, row.lead_id, fallbackName);
    return {
      ok: true,
      outHandle: 'default',
      mapped: baseMapped({
        mode: 'to_lead',
        result: 'unchanged',
        kind: 'lead',
        leadId: row.lead_id,
        leadName: name,
      }),
    };
  }

  const id = identityFromConversation(row);
  if (!hasMinIdentity(id)) {
    return {
      ok: false,
      outHandle: 'error',
      mapped: baseMapped({
        mode: 'to_lead',
        kind: 'unlinked',
        error: 'insufficient_identity',
      }),
    };
  }

  const found = await findUniqueLead(client, tenantId, id);
  if (found === 'ambiguous') {
    return {
      ok: false,
      outHandle: 'error',
      mapped: baseMapped({
        mode: 'to_lead',
        kind: 'unlinked',
        error: 'ambiguous_lead_phone',
      }),
    };
  }

  let leadId: string;
  let result: CrmConvertResult;
  if (found) {
    leadId = found.id;
    result = 'linked';
  } else {
    const phoneForLead =
      id.phoneDigits.length >= 8 ? id.phoneDigits : id.phoneDigits.length > 0 ? id.phoneDigits : null;
    const notes = `Chatbot flow crm_convert to_lead: conversation=${row.id}`.slice(0, 2000);
    const ins = await client.query<{ id: string }>(
      `INSERT INTO leads (
        user_id, name, email, phone, company, source, status, notes, profile_id
      ) VALUES ($1, $2, $3, $4, NULL, $5, NULL, $6, NULL)
      RETURNING id`,
      [actorUserId, id.name, id.emailNorm, phoneForLead, FLOW_LEAD_SOURCE, notes]
    );
    leadId = ins.rows[0]?.id || '';
    if (!leadId) {
      return {
        ok: false,
        outHandle: 'error',
        mapped: baseMapped({
          mode: 'to_lead',
          kind: 'unlinked',
          error: 'create_lead_failed',
        }),
      };
    }
    result = 'created';
  }

  const up = await client.query(
    `UPDATE chat_conversations
     SET lead_id = $1::uuid, updated_at = now()
     WHERE id = $2::uuid AND lead_id IS NULL AND client_id IS NULL
     RETURNING id`,
    [leadId, row.id]
  );
  if ((up.rowCount ?? 0) === 0) {
    // Race: someone linked meanwhile — re-read
    const again = await client.query<{ client_id: string | null; lead_id: string | null }>(
      `SELECT client_id, lead_id FROM chat_conversations WHERE id = $1::uuid LIMIT 1`,
      [row.id]
    );
    const cur = again.rows[0];
    if (cur?.client_id) {
      const name = await loadClientName(client, cur.client_id, fallbackName);
      return {
        ok: true,
        outHandle: 'already_client',
        mapped: baseMapped({
          mode: 'to_lead',
          result: 'unchanged',
          kind: 'client',
          clientId: cur.client_id,
          clientName: name,
          error: 'already_client',
        }),
      };
    }
    if (cur?.lead_id) {
      const name = await loadLeadName(client, cur.lead_id, fallbackName);
      return {
        ok: true,
        outHandle: 'default',
        mapped: baseMapped({
          mode: 'to_lead',
          result: 'unchanged',
          kind: 'lead',
          leadId: cur.lead_id,
          leadName: name,
        }),
      };
    }
    return {
      ok: false,
      outHandle: 'error',
      mapped: baseMapped({
        mode: 'to_lead',
        kind: 'unlinked',
        error: 'link_lead_failed',
      }),
    };
  }

  const leadName = await loadLeadName(client, leadId, id.name);
  return {
    ok: true,
    outHandle: 'default',
    mapped: baseMapped({
      mode: 'to_lead',
      result,
      kind: 'lead',
      leadId,
      leadName,
    }),
  };
}

async function convertToClient(
  client: PoolClient,
  opts: {
    tenantId: string;
    actorUserId: string;
    row: ConvRow;
    hasLeadCol: boolean;
  }
): Promise<RuntimeCrmConvertResult> {
  const { row, tenantId, actorUserId, hasLeadCol } = opts;
  const fallbackName = contactDisplayName(row);

  if (row.client_id) {
    const name = await loadClientName(client, row.client_id, fallbackName);
    return {
      ok: true,
      outHandle: 'default',
      mapped: baseMapped({
        mode: 'to_client',
        result: 'unchanged',
        kind: 'client',
        clientId: row.client_id,
        clientName: name,
      }),
    };
  }

  if (row.lead_id) {
    const leadRow = await client.query<{
      id: string;
      user_id: string;
      name: string;
      email: string | null;
      phone: string | null;
      company: string | null;
      notes: string | null;
      source: string | null;
      cpf_cnpj: string | null;
    }>(
      `SELECT l.id, l.user_id, l.name, l.email, l.phone, l.company, l.notes, l.source, l.cpf_cnpj
       FROM leads l
       INNER JOIN users u ON u.id = l.user_id
       WHERE l.id = $1::uuid AND u.tenant_id = $2::uuid
       LIMIT 1`,
      [row.lead_id, tenantId]
    );
    const lead = leadRow.rows[0];
    if (!lead) {
      return {
        ok: false,
        outHandle: 'error',
        mapped: baseMapped({
          mode: 'to_client',
          kind: 'lead',
          leadId: row.lead_id,
          error: 'lead_not_in_tenant',
        }),
      };
    }

    const phoneNorm = digitsOnly(lead.phone) || null;
    const emailNorm = lead.email?.trim().toLowerCase() || null;
    const existing = await findUniqueClient(client, tenantId, {
      phoneNorm: phoneNorm && phoneNorm.length >= 8 ? phoneNorm : null,
      emailNorm,
    });
    if (existing === 'ambiguous') {
      return {
        ok: false,
        outHandle: 'error',
        mapped: baseMapped({
          mode: 'to_client',
          kind: 'lead',
          leadId: lead.id,
          leadName: lead.name,
          error: 'ambiguous_client',
        }),
      };
    }

    let clientId = existing?.id || null;
    let result: CrmConvertResult = 'linked';
    if (!clientId) {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO clients (
          user_id, name, email, phone, company, status, source, notes, funnel_stage, cpf_cnpj
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9)
        RETURNING id`,
        [
          lead.user_id,
          (lead.name || 'Cliente').trim().slice(0, 200),
          lead.email?.trim() || null,
          lead.phone?.trim() || null,
          lead.company?.trim() || null,
          'Ativo',
          (lead.source || FLOW_CLIENT_SOURCE).trim().slice(0, 120),
          lead.notes ? lead.notes.slice(0, 2000) : null,
          lead.cpf_cnpj?.replace(/\D/g, '') || null,
        ]
      );
      clientId = ins.rows[0]?.id ?? null;
      if (!clientId) {
        return {
          ok: false,
          outHandle: 'error',
          mapped: baseMapped({
            mode: 'to_client',
            kind: 'lead',
            leadId: lead.id,
            leadName: lead.name,
            error: 'create_client_failed',
          }),
        };
      }
      result = 'created';
    }

    await linkConversationClient(client, row, clientId, lead.id, actorUserId, hasLeadCol);
    await client.query(`UPDATE leads SET status = 'Convertido', updated_at = now() WHERE id = $1::uuid`, [
      lead.id,
    ]);
    await migrateTicketsLeadToClientInTransaction(client, {
      tenantId,
      leadId: lead.id,
      clientId,
      actorUserId,
    });

    const clientName = await loadClientName(client, clientId, lead.name || fallbackName);
    return {
      ok: true,
      outHandle: 'default',
      mapped: baseMapped({
        mode: 'to_client',
        result,
        kind: 'client',
        clientId,
        clientName,
      }),
    };
  }

  // unlinked
  const id = identityFromConversation(row);
  if (!hasMinIdentity(id)) {
    return {
      ok: false,
      outHandle: 'error',
      mapped: baseMapped({
        mode: 'to_client',
        kind: 'unlinked',
        error: 'insufficient_identity',
      }),
    };
  }

  const phoneNorm = id.phoneDigits.length >= 8 ? id.phoneDigits : null;
  const existing = await findUniqueClient(client, tenantId, {
    phoneNorm,
    emailNorm: id.emailNorm,
  });
  if (existing === 'ambiguous') {
    return {
      ok: false,
      outHandle: 'error',
      mapped: baseMapped({
        mode: 'to_client',
        kind: 'unlinked',
        error: 'ambiguous_client',
      }),
    };
  }

  let clientId = existing?.id || null;
  let result: CrmConvertResult = 'linked';
  if (!clientId) {
    const notes = `Chatbot flow crm_convert to_client: conversation=${row.id}`.slice(0, 2000);
    const ins = await client.query<{ id: string }>(
      `INSERT INTO clients (
        user_id, name, email, phone, company, status, source, notes, funnel_stage
      ) VALUES ($1,$2,$3,$4,NULL,'Ativo',$5,$6,NULL)
      RETURNING id`,
      [
        row.user_id,
        id.name,
        id.emailNorm,
        phoneNorm ? `+${phoneNorm}` : null,
        FLOW_CLIENT_SOURCE,
        notes,
      ]
    );
    clientId = ins.rows[0]?.id ?? null;
    if (!clientId) {
      return {
        ok: false,
        outHandle: 'error',
        mapped: baseMapped({
          mode: 'to_client',
          kind: 'unlinked',
          error: 'create_client_failed',
        }),
      };
    }
    result = 'created';
  }

  await linkConversationClient(client, row, clientId, null, actorUserId, hasLeadCol);
  const clientName = await loadClientName(client, clientId, id.name);
  return {
    ok: true,
    outHandle: 'default',
    mapped: baseMapped({
      mode: 'to_client',
      result,
      kind: 'client',
      clientId,
      clientName,
    }),
  };
}

/**
 * Garante lead ou cliente na conversa (fail-closed via handle error).
 */
export async function runtimeCrmConvert(opts: {
  tenantId: string;
  conversationId: string;
  actorUserId: string;
  mode: CrmConvertMode;
}): Promise<RuntimeCrmConvertResult> {
  const mode: CrmConvertMode = opts.mode === 'to_client' ? 'to_client' : 'to_lead';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hasLeadCol = await conversationHasLeadIdColumn(client);
    const conv = await client.query<ConvRow>(
      `SELECT c.id, c.user_id, c.client_id,
              ${hasLeadCol ? 'c.lead_id' : 'NULL::uuid AS lead_id'},
              c.display_name, c.contact_name, c.profile_name,
              c.phone_number, c.canonical_phone, c.metadata
       FROM chat_conversations c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.id = $1::uuid AND u.tenant_id = $2::uuid
       FOR UPDATE OF c
       LIMIT 1`,
      [opts.conversationId, opts.tenantId]
    );
    const row = conv.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        outHandle: 'error',
        mapped: baseMapped({
          mode,
          kind: 'unlinked',
          error: 'conversation_not_found',
        }),
      };
    }

    const result =
      mode === 'to_lead'
        ? await convertToLead(client, {
            tenantId: opts.tenantId,
            actorUserId: opts.actorUserId,
            row,
            hasLeadCol,
          })
        : await convertToClient(client, {
            tenantId: opts.tenantId,
            actorUserId: opts.actorUserId,
            row,
            hasLeadCol,
          });

    if (result.ok) {
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : 'convert_failed';
    return {
      ok: false,
      outHandle: 'error',
      mapped: baseMapped({
        mode,
        kind: classifyCrmLinkKind({}),
        error: msg.slice(0, 200),
      }),
    };
  } finally {
    client.release();
  }
}

/**
 * Classificação pura de handles (testes / simulador FE).
 * Não cobre dedupe ambígua — só identidade mínima e vínculos existentes.
 */
export function classifyCrmConvertOutcome(opts: {
  mode: CrmConvertMode;
  clientId?: string | null;
  leadId?: string | null;
  hasIdentity: boolean;
}): { outHandle: CrmConvertOutHandle; result: CrmConvertResult | 'error'; error?: string } {
  const mode = opts.mode === 'to_client' ? 'to_client' : 'to_lead';
  if (mode === 'to_lead') {
    if (opts.clientId) {
      return { outHandle: 'already_client', result: 'unchanged', error: 'already_client' };
    }
    if (opts.leadId) return { outHandle: 'default', result: 'unchanged' };
    if (!opts.hasIdentity) {
      return { outHandle: 'error', result: 'error', error: 'insufficient_identity' };
    }
    return { outHandle: 'default', result: 'created' };
  }
  if (opts.clientId) return { outHandle: 'default', result: 'unchanged' };
  if (opts.leadId) return { outHandle: 'default', result: 'created' };
  if (!opts.hasIdentity) {
    return { outHandle: 'error', result: 'error', error: 'insufficient_identity' };
  }
  return { outHandle: 'default', result: 'created' };
}
