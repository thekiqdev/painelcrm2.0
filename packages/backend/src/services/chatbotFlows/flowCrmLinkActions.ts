/**
 * Classificação de vínculo CRM na conversa (S26) — cliente / lead / não vinculado.
 */
import { pool } from '../../utils/db.js';
import { resolveClientIdForConversation } from './flowInvoiceActions.js';

export type CrmLinkKind = 'client' | 'lead' | 'unlinked';

export type RuntimeResolveCrmLinkResult = {
  kind: CrmLinkKind;
  /** Handle de saída do nó crm_link_check */
  outHandle: CrmLinkKind;
  mapped: Record<string, string>;
  /** Se atualizou client_id na conversa via match telefone */
  linkedClient: boolean;
};

async function conversationHasLeadIdColumn(): Promise<boolean> {
  const r = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'lead_id'
     ) AS exists`
  );
  return Boolean(r.rows[0]?.exists);
}

/**
 * Resolve vínculo fresco da conversa.
 * Prioridade D26.1: client > lead > unlinked.
 * D26.2: se refreshClientMatch e sem client_id, tenta match por telefone e grava client_id.
 */
export async function runtimeResolveCrmLink(opts: {
  tenantId: string;
  conversationId: string;
  refreshClientMatch?: boolean;
}): Promise<RuntimeResolveCrmLinkResult> {
  const refresh = opts.refreshClientMatch !== false;
  const hasLeadCol = await conversationHasLeadIdColumn();

  const r = await pool.query<{
    client_id: string | null;
    lead_id: string | null;
    display_name: string | null;
    contact_name: string | null;
    profile_name: string | null;
  }>(
    `SELECT c.client_id,
            ${hasLeadCol ? 'c.lead_id' : 'NULL::uuid AS lead_id'},
            c.display_name, c.contact_name, c.profile_name
     FROM chat_conversations c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.id = $1::uuid AND u.tenant_id = $2::uuid
     LIMIT 1`,
    [opts.conversationId, opts.tenantId]
  );

  const row = r.rows[0];
  let clientId = row?.client_id != null ? String(row.client_id) : null;
  const leadId = row?.lead_id != null ? String(row.lead_id) : null;
  let linkedClient = false;

  if (!clientId && refresh) {
    const matched = await resolveClientIdForConversation({
      tenantId: opts.tenantId,
      conversationId: opts.conversationId,
    });
    if (matched) {
      clientId = matched;
      const upd = await pool.query(
        `UPDATE chat_conversations
         SET client_id = $1::uuid, updated_at = now()
         WHERE id = $2::uuid AND client_id IS NULL
         RETURNING id`,
        [matched, opts.conversationId]
      );
      linkedClient = (upd.rowCount ?? 0) > 0;
    }
  }

  const kind: CrmLinkKind = clientId ? 'client' : leadId ? 'lead' : 'unlinked';
  const contactName =
    (row?.display_name || row?.contact_name || row?.profile_name || '').trim() || '';

  const mapped: Record<string, string> = {
    'crm.link_kind': kind,
    crm_link_kind: kind,
  };

  if (clientId) {
    mapped['client.id'] = clientId;
    mapped.client_id = clientId;
    const cl = await pool.query<{ name: string | null }>(
      `SELECT name FROM clients WHERE id = $1::uuid LIMIT 1`,
      [clientId]
    );
    const name = String(cl.rows[0]?.name || contactName || '').trim();
    if (name) {
      mapped['client.name'] = name;
      mapped.client_name = name;
    }
  } else {
    mapped['client.id'] = '';
    mapped.client_id = '';
  }

  if (leadId && !clientId) {
    mapped['lead.id'] = leadId;
    mapped.lead_id = leadId;
    try {
      const ld = await pool.query<{ name: string | null }>(
        `SELECT name FROM leads WHERE id = $1::uuid LIMIT 1`,
        [leadId]
      );
      const name = String(ld.rows[0]?.name || contactName || '').trim();
      if (name) {
        mapped['lead.name'] = name;
        mapped.lead_name = name;
      }
    } catch {
      if (contactName) {
        mapped['lead.name'] = contactName;
        mapped.lead_name = contactName;
      }
    }
  } else {
    mapped['lead.id'] = '';
    mapped.lead_id = '';
  }

  if (linkedClient) {
    mapped['crm.client_match'] = 'linked';
  }

  return { kind, outHandle: kind, mapped, linkedClient };
}

/** Classificação pura (testes / simulador FE). */
export function classifyCrmLinkKind(opts: {
  clientId?: string | null;
  leadId?: string | null;
}): CrmLinkKind {
  if (opts.clientId) return 'client';
  if (opts.leadId) return 'lead';
  return 'unlinked';
}
