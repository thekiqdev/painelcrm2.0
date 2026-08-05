/**
 * Contexto de variáveis para Chatbot Flows (S10) — seeds contact/conversation/agent/tenant/system.
 * Inclui keys canônicas dotted + aliases flat (compat {{contact_name}}).
 */
import { pool } from '../../utils/db.js';

function put(bag: Record<string, string>, key: string, value: string | null | undefined) {
  const v = (value ?? '').trim();
  if (!v) return;
  bag[key] = v;
}

function todayParts(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return {
    iso: `${y}-${m}-${day}`,
    formatted: `${day}/${m}/${y}`,
  };
}

/**
 * Monta bag flat para session.variables (não sobrescreve keys já definidas pelo flow).
 */
export async function buildFlowSessionVariableBag(opts: {
  tenantId: string;
  conversationId: string;
  actorUserId?: string | null;
}): Promise<Record<string, string>> {
  const bag: Record<string, string> = {};
  const dates = todayParts();
  put(bag, 'system.date', dates.iso);
  put(bag, 'system.date_formatted', dates.formatted);
  put(bag, 'system.name', process.env.APP_PUBLIC_NAME?.trim() || 'PainelCRM');

  put(bag, 'conversation.id', opts.conversationId);
  put(bag, 'conversation_id', opts.conversationId);

  try {
    const conv = await pool.query<{
      display_name: string | null;
      contact_name: string | null;
      profile_name: string | null;
      phone_normalized: string | null;
      assigned_team_id: string | null;
      assigned_to_user_id: string | null;
      user_id: string;
      client_id: string | null;
    }>(
      `SELECT c.display_name, c.contact_name, c.profile_name, c.phone_normalized,
              c.assigned_team_id, c.assigned_to_user_id, c.user_id, c.client_id
       FROM chat_conversations c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.id = $1::uuid AND u.tenant_id = $2::uuid
       LIMIT 1`,
      [opts.conversationId, opts.tenantId]
    );
    const row = conv.rows[0];
    if (row) {
      const contact =
        (row.display_name || row.contact_name || row.profile_name || '').trim() || '';
      put(bag, 'contact.name', contact);
      put(bag, 'contact_name', contact);
      put(bag, 'client_name', contact);
      put(bag, 'display_name', contact);

      const phone = (row.phone_normalized || '').trim();
      put(bag, 'contact.phone', phone);
      put(bag, 'canonical_phone', phone);
      put(bag, 'contact_phone', phone);

      if (row.client_id) {
        put(bag, 'client.id', row.client_id);
        put(bag, 'client_id', row.client_id);
      }

      // Kanban column/board (best-effort)
      try {
        const kanban = await pool.query<{ column_name: string | null; board_name: string | null }>(
          `SELECT col.name AS column_name, b.name AS board_name
           FROM chat_kanban_cards card
           INNER JOIN chat_kanban_columns col ON col.id = card.column_id
           INNER JOIN chat_kanban_boards b ON b.id = col.board_id
           WHERE card.conversation_id = $1::uuid AND b.tenant_id = $2::uuid
           ORDER BY card.updated_at DESC NULLS LAST
           LIMIT 1`,
          [opts.conversationId, opts.tenantId]
        );
        const k = kanban.rows[0];
        if (k) {
          put(bag, 'conversation.column_name', k.column_name);
          put(bag, 'column_name', k.column_name);
          put(bag, 'conversation.board_name', k.board_name);
          put(bag, 'board_name', k.board_name);
        }
      } catch {
        /* tabela pode variar — ignore */
      }

      const agentUserId =
        opts.actorUserId || row.assigned_to_user_id || row.user_id || null;
      if (agentUserId) {
        try {
          const userRow = await pool.query<{
            first_name: string | null;
            last_name: string | null;
            email: string | null;
          }>(
            `SELECT first_name, last_name, email FROM users WHERE id = $1::uuid LIMIT 1`,
            [agentUserId]
          );
          const u = userRow.rows[0];
          if (u) {
            const op =
              [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
              (u.email || '').trim();
            put(bag, 'agent.name', op);
            put(bag, 'operator_name', op);
          }
        } catch {
          /* ignore */
        }
      }

      if (row.assigned_team_id) {
        try {
          const teamRow = await pool.query<{ name: string }>(
            `SELECT name FROM teams WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
            [row.assigned_team_id, opts.tenantId]
          );
          const teamName = teamRow.rows[0]?.name;
          put(bag, 'agent.team_name', teamName);
          put(bag, 'team_name', teamName);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const tenantRow = await pool.query<{ name: string | null; domain: string | null }>(
      `SELECT name, domain FROM tenants WHERE id = $1::uuid LIMIT 1`,
      [opts.tenantId]
    );
    const t = tenantRow.rows[0];
    if (t) {
      put(bag, 'tenant.name', t.name);
      put(bag, 'company_name', t.name);
      put(bag, 'tenant_name', t.name);
      put(bag, 'system.tenant_name', t.name);
      put(bag, 'tenant.domain', t.domain);
      put(bag, 'system.tenant_domain', t.domain);
    }
  } catch {
    /* ignore */
  }

  return bag;
}

/** Mescla seed sem sobrescrever variáveis já definidas pelo flow. */
export function mergeFlowVariableSeed(
  existing: Record<string, unknown>,
  seed: Record<string, string>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...seed, ...existing };
  // existing wins for keys already set (including empty string intentional)
  for (const [k, v] of Object.entries(existing)) {
    out[k] = v;
  }
  // fill only missing from seed
  for (const [k, v] of Object.entries(seed)) {
    if (out[k] == null || out[k] === '') out[k] = v;
  }
  return out;
}
