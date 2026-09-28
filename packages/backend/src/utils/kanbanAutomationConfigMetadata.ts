import { pool } from './db.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readBool(v: unknown): boolean {
  return v === true;
}

/**
 * Normaliza `metadata.automation_config` ao guardar coluna.
 * Formato: `{ enabled, sources?: { new_conversations?, leads?, clients?, tags?: string[] } }`
 */
export async function sanitizeKanbanAutomationConfigInMetadata(
  meta: Record<string, unknown>,
  tenantId: string,
): Promise<void> {
  const raw = meta.automation_config;
  if (raw == null) return;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    delete meta.automation_config;
    return;
  }
  const ac = raw as Record<string, unknown>;
  const enabled = ac.enabled === true;
  const src =
    ac.sources && typeof ac.sources === 'object' && !Array.isArray(ac.sources)
      ? (ac.sources as Record<string, unknown>)
      : {};
  const newConversations = readBool(src.new_conversations);
  const leads = readBool(src.leads);
  const clients = readBool(src.clients);
  const tagsRaw = src.tags;
  const candidates: string[] = Array.isArray(tagsRaw)
    ? tagsRaw.map((x) => String(x).trim()).filter((x) => UUID_RE.test(x))
    : [];
  const uniq = [...new Set(candidates)];
  let filtered: string[] = [];
  if (uniq.length > 0) {
    const r = await pool.query<{ id: string }>(
      `SELECT id::text FROM chat_kanban_tags WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
      [tenantId, uniq],
    );
    const allowed = new Set(r.rows.map((x) => x.id));
    filtered = uniq.filter((id) => allowed.has(id));
  }

  const hasAnySource = newConversations || leads || clients || filtered.length > 0;
  if (!hasAnySource) {
    meta.automation_config = {
      enabled: false,
      sources: {
        new_conversations: false,
        leads: false,
        clients: false,
        tags: [],
      },
    };
    return;
  }

  meta.automation_config = {
    enabled: enabled && hasAnySource,
    sources: {
      new_conversations: newConversations,
      leads,
      clients,
      tags: filtered,
    },
  };
}
