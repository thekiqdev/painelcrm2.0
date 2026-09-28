/**
 * Ações de ticket CRM no runtime Chatbot Flows (S25) — abrir chamado.
 * Link público = {FRONTEND_URL}/ticket/{public_access_token} (PublicTicketView).
 */
import { randomBytes } from 'crypto';
import { pool } from '../../utils/db.js';
import { resolveClientIdForConversation } from './flowInvoiceActions.js';

export const FLOW_TICKET_CATEGORIES_KEY = 'ticket._categories';
export const TICKET_ASSIST_STEP_KEY = 'ticket._assist_step';
export const TICKET_ASSIST_RETRIES_KEY = 'ticket._assist_retries';
export const TICKET_ASSIST_PHASE_KEY = 'ticket._assist_phase';
/** Limite prático de botões WhatsApp / UazAPI (D25.6). */
export const TICKET_CATEGORY_BUTTON_LIMIT = 3;

export type FlowTicketCategoryItem = {
  id: string;
  name: string;
  /** id curto para botão WA (c1, c2…) */
  option_id: string;
};

export type FlowTicketCreatedBag = {
  id: string;
  number: string;
  subject: string;
  status: string;
  category_id: string;
  category_name: string;
  public_token: string;
  public_url: string;
};

function publicAppBaseUrl(): string {
  const raw =
    (process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || '').split(',')[0]?.trim() ?? '';
  return raw.replace(/\/$/, '');
}

export function buildTicketPublicUrl(token: string | null | undefined): string {
  const t = String(token || '').trim();
  if (!t) return '';
  const base = publicAppBaseUrl();
  if (!base) return `/ticket/${encodeURIComponent(t)}`;
  return `${base}/ticket/${encodeURIComponent(t)}`;
}

function generatePublicAccessToken(): string {
  return randomBytes(24).toString('base64url');
}

export function parseTicketCategoriesFromSession(
  variables: Record<string, unknown>
): FlowTicketCategoryItem[] {
  const raw = variables[FLOW_TICKET_CATEGORIES_KEY];
  if (raw == null) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => {
        if (!x || typeof x !== 'object') return null;
        const o = x as Record<string, unknown>;
        if (!o.id || !o.option_id) return null;
        return {
          id: String(o.id),
          name: String(o.name || o.id),
          option_id: String(o.option_id),
        } satisfies FlowTicketCategoryItem;
      })
      .filter(Boolean) as FlowTicketCategoryItem[];
  } catch {
    return [];
  }
}

export function buildCategoryMenuText(items: FlowTicketCategoryItem[]): string {
  if (items.length === 0) return '';
  return items.map((it, i) => `${i + 1}) ${it.name}`).join('\n');
}

/** Interpreta resposta: id curto (c1), UUID, ou número 1-based. */
export function pickCategoryFromAnswer(
  answer: string,
  items: FlowTicketCategoryItem[]
): { ok: true; item: FlowTicketCategoryItem } | { ok: false; reason: string } {
  if (items.length === 0) return { ok: false, reason: 'Sem categorias na sessão' };
  const t = String(answer || '').trim();
  if (!t) return { ok: false, reason: 'Resposta vazia' };

  const byOption = items.find((i) => i.option_id === t || i.id === t);
  if (byOption) return { ok: true, item: byOption };

  const lower = t.toLowerCase();
  const byName = items.find((i) => i.name.trim().toLowerCase() === lower);
  if (byName) return { ok: true, item: byName };

  const m = t.match(/(\d{1,2})/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= items.length) {
      return { ok: true, item: items[n - 1]! };
    }
  }
  return { ok: false, reason: 'Opção inválida' };
}

export function applyCreatedTicketVars(
  bag: Record<string, unknown>,
  item: FlowTicketCreatedBag
): void {
  bag['ticket.id'] = item.id;
  bag['ticket.number'] = item.number;
  bag['ticket.subject'] = item.subject;
  bag['ticket.status'] = item.status;
  bag['ticket.category_id'] = item.category_id;
  bag['ticket.category_name'] = item.category_name;
  bag['ticket.public_token'] = item.public_token;
  bag['ticket.public_url'] = item.public_url;
  bag.ticket_id = item.id;
  bag.ticket_number = item.number;
  bag.ticket_subject = item.subject;
  bag.ticket_public_url = item.public_url;
  bag.ticket_public_link = item.public_url;
}

export async function listTicketCategoriesForTenant(
  tenantId: string
): Promise<FlowTicketCategoryItem[]> {
  const r = await pool.query<{ id: string; name: string }>(
    `SELECT tc.id, tc.name
     FROM ticket_categories tc
     INNER JOIN users u ON u.id = tc.user_id AND u.tenant_id = $1::uuid
     ORDER BY tc.name ASC`,
    [tenantId]
  );
  return r.rows.map((row, i) => ({
    id: String(row.id),
    name: String(row.name || '').trim() || 'Categoria',
    option_id: `c${i + 1}`,
  }));
}

async function loadConversationContact(opts: {
  tenantId: string;
  conversationId: string;
}): Promise<{
  clientId: string | null;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  externalChatId: string | null;
  instanceId: string | null;
  ownerUserId: string;
}> {
  const r = await pool.query<{
    client_id: string | null;
    display_name: string | null;
    contact_name: string | null;
    profile_name: string | null;
    phone_number: string | null;
    canonical_phone: string | null;
    external_chat_id: string | null;
    instance_id: string | null;
    user_id: string;
  }>(
    `SELECT c.client_id, c.display_name, c.contact_name, c.profile_name,
            c.phone_number, c.canonical_phone, c.external_chat_id, c.instance_id, c.user_id
     FROM chat_conversations c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.id = $1::uuid AND u.tenant_id = $2::uuid
     LIMIT 1`,
    [opts.conversationId, opts.tenantId]
  );
  const row = r.rows[0];
  if (!row) {
    return {
      clientId: null,
      contactName: 'Cliente WhatsApp',
      contactPhone: null,
      contactEmail: null,
      externalChatId: null,
      instanceId: null,
      ownerUserId: '',
    };
  }

  let clientId = row.client_id != null ? String(row.client_id) : null;
  if (!clientId) {
    clientId = await resolveClientIdForConversation({
      tenantId: opts.tenantId,
      conversationId: opts.conversationId,
    });
  }

  let contactEmail: string | null = null;
  let clientName: string | null = null;
  let clientPhone: string | null = null;
  if (clientId) {
    const cl = await pool.query<{ name: string | null; email: string | null; phone: string | null }>(
      `SELECT name, email, phone FROM clients WHERE id = $1::uuid LIMIT 1`,
      [clientId]
    );
    clientName = cl.rows[0]?.name != null ? String(cl.rows[0].name) : null;
    contactEmail = cl.rows[0]?.email != null ? String(cl.rows[0].email).trim() || null : null;
    clientPhone = cl.rows[0]?.phone != null ? String(cl.rows[0].phone) : null;
  }

  const phone =
    String(row.canonical_phone || row.phone_number || clientPhone || '')
      .replace(/\D/g, '')
      .trim() || null;
  const contactName =
    (clientName || row.display_name || row.contact_name || row.profile_name || '').trim() ||
    (phone ? phone : 'Cliente WhatsApp');

  return {
    clientId,
    contactName,
    contactPhone: phone,
    contactEmail,
    externalChatId: row.external_chat_id != null ? String(row.external_chat_id) : null,
    instanceId: row.instance_id != null ? String(row.instance_id) : null,
    ownerUserId: String(row.user_id),
  };
}

export type TicketAssistBootstrapResult = {
  ok: boolean;
  reason?: 'no_client' | 'no_categories' | 'conversation_not_found';
  mapped: Record<string, string>;
  categories: FlowTicketCategoryItem[];
};

/** Carrega categorias + valida cliente (D25.1 / D25.2). */
export async function runtimeTicketAssistBootstrap(opts: {
  tenantId: string;
  conversationId: string;
  requireClient?: boolean;
}): Promise<TicketAssistBootstrapResult> {
  const requireClient = opts.requireClient !== false;
  const contact = await loadConversationContact({
    tenantId: opts.tenantId,
    conversationId: opts.conversationId,
  });
  if (!contact.ownerUserId) {
    return {
      ok: false,
      reason: 'conversation_not_found',
      mapped: {
        'ticket.category_count': '0',
        ticket_category_count: '0',
        [FLOW_TICKET_CATEGORIES_KEY]: '[]',
        'ticket.menu': '',
        'ticket._bootstrap_reason': 'conversation_not_found',
      },
      categories: [],
    };
  }

  // Sempre carrega categorias (mesmo em no_client) para não mentir "sem categorias"
  // quando o problema real é cliente não vinculado.
  const categories = await listTicketCategoriesForTenant(opts.tenantId);
  const mapped: Record<string, string> = {
    'ticket.category_count': String(categories.length),
    ticket_category_count: String(categories.length),
    [FLOW_TICKET_CATEGORIES_KEY]: JSON.stringify(categories),
    'ticket.menu': buildCategoryMenuText(categories),
    ticket_menu: buildCategoryMenuText(categories),
    'ticket._bootstrap_reason': '',
  };
  if (contact.clientId) {
    mapped['client.id'] = contact.clientId;
    mapped.client_id = contact.clientId;
  }

  if (requireClient && !contact.clientId) {
    mapped['ticket._bootstrap_reason'] = 'no_client';
    return { ok: false, reason: 'no_client', mapped, categories };
  }
  if (categories.length === 0) {
    mapped['ticket._bootstrap_reason'] = 'no_categories';
    return { ok: false, reason: 'no_categories', mapped, categories: [] };
  }
  return { ok: true, mapped, categories };
}

export type RuntimeCreateTicketResult = {
  ok: boolean;
  error?: string;
  mapped: Record<string, string>;
};

export async function runtimeCreateTicketFromAssist(opts: {
  tenantId: string;
  conversationId: string;
  sessionId: string;
  flowId?: string | null;
  subject: string;
  description: string;
  categoryId: string;
  categoryName?: string;
  priority?: string;
}): Promise<RuntimeCreateTicketResult> {
  const subject = String(opts.subject || '').trim();
  const description = String(opts.description || '').trim();
  const categoryId = String(opts.categoryId || '').trim();
  if (!subject || !description || !categoryId) {
    return {
      ok: false,
      error: 'missing_fields',
      mapped: {},
    };
  }

  const contact = await loadConversationContact({
    tenantId: opts.tenantId,
    conversationId: opts.conversationId,
  });
  if (!contact.ownerUserId) {
    return { ok: false, error: 'conversation_not_found', mapped: {} };
  }

  const email =
    contact.contactEmail ||
    `chat-${opts.conversationId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}@no-email.painelcrm.local`;
  const publicAccessToken = generatePublicAccessToken();
  const priority = ['low', 'normal', 'high', 'urgent'].includes(String(opts.priority || ''))
    ? String(opts.priority)
    : 'normal';

  const customFields = {
    source: 'chatbot_flow',
    conversation_id: opts.conversationId,
    session_id: opts.sessionId,
    flow_id: opts.flowId || null,
    phone: contact.contactPhone,
    email_missing: !contact.contactEmail,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const insert = await client.query(
      `INSERT INTO tickets (
         user_id, contact_name, contact_email, contact_phone,
         subject, description, category_id, priority, status, channel,
         client_id, tags, custom_fields, public_access_token
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8, 'new', 'whatsapp',
         $9::uuid, $10::jsonb, $11::jsonb, $12
       )
       RETURNING id, ticket_number, subject, status, category_id, public_access_token`,
      [
        contact.ownerUserId,
        contact.contactName,
        email,
        contact.contactPhone,
        subject.slice(0, 500),
        description.slice(0, 20000),
        categoryId,
        priority,
        contact.clientId,
        JSON.stringify(['chatbot_flow']),
        JSON.stringify(customFields),
        publicAccessToken,
      ]
    );
    const row = insert.rows[0] as Record<string, unknown>;
    const ticketId = String(row.id);
    await client.query(
      `INSERT INTO ticket_messages (
         ticket_id, user_id, content, visibility, attachments, mentions
       ) VALUES ($1::uuid, $2::uuid, $3, 'public', '[]'::jsonb, '[]'::jsonb)`,
      [ticketId, contact.ownerUserId, description.trim()]
    );
    await client.query('COMMIT');

    const token = String(row.public_access_token || publicAccessToken);
    const ensured = token.trim()
      ? token
      : await ensureTicketPublicToken(ticketId, null);
    const item: FlowTicketCreatedBag = {
      id: ticketId,
      number: String(row.ticket_number || ticketId.slice(0, 8)),
      subject: String(row.subject || subject),
      status: String(row.status || 'new'),
      category_id: categoryId,
      category_name: String(opts.categoryName || ''),
      public_token: ensured,
      public_url: buildTicketPublicUrl(ensured),
    };
    const mapped: Record<string, string> = {};
    applyCreatedTicketVars(mapped, item);
    return { ok: true, mapped };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : 'create_failed';
    return { ok: false, error: msg, mapped: {} };
  } finally {
    client.release();
  }
}

/** Opções para send_menu (≤3) — id = option_id curto. */
export function categoriesToMenuOptions(
  items: FlowTicketCategoryItem[]
): Array<{ id: string; label: string; description?: string }> {
  return items.slice(0, TICKET_CATEGORY_BUTTON_LIMIT).map((it) => ({
    id: it.option_id,
    label: it.name.slice(0, 24),
  }));
}

/** ——— S25.1 consulta ——— */

export const FLOW_TICKET_ITEMS_KEY = 'ticket._items';
export const TICKET_LOOKUP_ASSIST_RETRIES_KEY = 'ticket._lookup_retries';
export const TICKET_LOOKUP_CHOICE_VAR = 'answer';

export const FLOW_TICKET_OPEN_STATUSES = [
  'new',
  'open',
  'pending',
  'waiting_customer',
  'in_progress',
] as const;

export type FlowTicketListItem = {
  id: string;
  number: string;
  subject: string;
  status: string;
  public_token: string;
  public_url: string;
  option_id: string;
};

export function ticketRowToListItem(
  row: {
    id: string;
    ticket_number?: string | null;
    subject?: string | null;
    status?: string | null;
    public_access_token?: string | null;
  },
  index: number
): FlowTicketListItem {
  const token = String(row.public_access_token || '').trim();
  const number = String(row.ticket_number || row.id).trim() || String(row.id);
  return {
    id: String(row.id),
    number,
    subject: String(row.subject || '').trim() || 'Sem assunto',
    status: String(row.status || ''),
    public_token: token,
    public_url: buildTicketPublicUrl(token),
    option_id: `t${index + 1}`,
  };
}

export function applySelectedTicketVars(
  bag: Record<string, unknown>,
  item: FlowTicketListItem
): void {
  bag['ticket.id'] = item.id;
  bag['ticket.number'] = item.number;
  bag['ticket.subject'] = item.subject;
  bag['ticket.status'] = item.status;
  bag['ticket.public_token'] = item.public_token;
  bag['ticket.public_url'] = item.public_url;
  bag.ticket_id = item.id;
  bag.ticket_number = item.number;
  bag.ticket_subject = item.subject;
  bag.ticket_public_url = item.public_url;
  bag.ticket_public_link = item.public_url;
}

export function buildTicketMenuText(items: FlowTicketListItem[]): string {
  if (items.length === 0) return '';
  return items
    .map((it, i) => {
      const subj = it.subject.length > 40 ? `${it.subject.slice(0, 37)}…` : it.subject;
      return `${i + 1}) #${it.number} — ${subj}`;
    })
    .join('\n');
}

export function parseTicketItemsFromSession(
  variables: Record<string, unknown>
): FlowTicketListItem[] {
  const raw = variables[FLOW_TICKET_ITEMS_KEY];
  if (raw == null) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x, i) => {
        if (!x || typeof x !== 'object') return null;
        const o = x as Record<string, unknown>;
        if (!o.id) return null;
        return {
          id: String(o.id),
          number: String(o.number || o.id),
          subject: String(o.subject || ''),
          status: String(o.status || ''),
          public_token: String(o.public_token || ''),
          public_url: String(o.public_url || ''),
          option_id: String(o.option_id || `t${i + 1}`),
        } satisfies FlowTicketListItem;
      })
      .filter(Boolean) as FlowTicketListItem[];
  } catch {
    return [];
  }
}

export function pickTicketFromAnswer(
  answer: string,
  items: FlowTicketListItem[]
): { ok: true; item: FlowTicketListItem } | { ok: false; reason: string } {
  if (items.length === 0) return { ok: false, reason: 'Sem catálogo de tickets na sessão' };
  const t = String(answer || '').trim();
  if (!t) return { ok: false, reason: 'Resposta vazia' };

  const byOption = items.find((i) => i.option_id === t || i.id === t || i.number === t);
  if (byOption) return { ok: true, item: byOption };

  const m = t.match(/(\d{1,2})/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= items.length) {
      return { ok: true, item: items[n - 1]! };
    }
  }
  return { ok: false, reason: 'Opção inválida' };
}

export function selectTicketFromSessionVars(
  variables: Record<string, unknown>,
  answerVariable: string
): { ok: true; item: FlowTicketListItem } | { ok: false; reason: string } {
  const items = parseTicketItemsFromSession(variables);
  const answer = variables[answerVariable] == null ? '' : String(variables[answerVariable]);
  return pickTicketFromAnswer(answer, items);
}

export function ticketsToMenuOptions(
  items: FlowTicketListItem[]
): Array<{ id: string; label: string; description?: string }> {
  return items.slice(0, TICKET_CATEGORY_BUTTON_LIMIT).map((it) => {
    const label = `#${it.number}`.slice(0, 24);
    const desc = it.subject.slice(0, 72);
    return { id: it.option_id, label, description: desc };
  });
}

async function ensureTicketPublicToken(ticketId: string, current: string | null): Promise<string> {
  const existing = String(current || '').trim();
  if (existing) return existing;
  const token = generatePublicAccessToken();
  await pool.query(
    `UPDATE tickets SET public_access_token = $1, updated_at = now()
     WHERE id = $2::uuid AND (public_access_token IS NULL OR btrim(public_access_token) = '')`,
    [token, ticketId]
  );
  return token;
}

export type RuntimeLookupTicketResult = {
  found: boolean;
  mapped: Record<string, string>;
};

/**
 * Lista tickets abertos do cliente da conversa.
 * last_open → 1 ticket em ticket.*
 * open_menu → menu + ticket._items
 */
export async function runtimeLookupTicket(opts: {
  tenantId: string;
  conversationId: string;
  mode: 'last_open' | 'open_menu';
  limit?: number;
  includeClosed?: boolean;
}): Promise<RuntimeLookupTicketResult> {
  const clientId = await resolveClientIdForConversation({
    tenantId: opts.tenantId,
    conversationId: opts.conversationId,
  });
  if (!clientId) {
    return {
      found: false,
      mapped: {
        'ticket.count': '0',
        ticket_count: '0',
        'ticket.menu': '',
        [FLOW_TICKET_ITEMS_KEY]: '[]',
      },
    };
  }

  const limit =
    opts.mode === 'last_open' ? 1 : Math.min(Math.max(1, Number(opts.limit) || 8), 20);

  const statusFilter = opts.includeClosed
    ? null
    : [...FLOW_TICKET_OPEN_STATUSES];

  const params: unknown[] = [opts.tenantId, clientId, limit];
  let statusSql = '';
  if (statusFilter) {
    params.push(statusFilter);
    statusSql = `AND t.status::text = ANY($${params.length}::text[])`;
  }

  const r = await pool.query<{
    id: string;
    ticket_number: string | null;
    subject: string | null;
    status: string;
    public_access_token: string | null;
  }>(
    `SELECT t.id, t.ticket_number, t.subject, t.status::text AS status, t.public_access_token
     FROM tickets t
     INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1::uuid
     WHERE t.client_id = $2::uuid
       ${statusSql}
     ORDER BY t.updated_at DESC NULLS LAST
     LIMIT $3`,
    params
  );

  const items: FlowTicketListItem[] = [];
  for (let i = 0; i < r.rows.length; i++) {
    const row = r.rows[i]!;
    const token = await ensureTicketPublicToken(String(row.id), row.public_access_token);
    items.push(
      ticketRowToListItem(
        { ...row, public_access_token: token },
        i
      )
    );
  }

  const mapped: Record<string, string> = {
    'client.id': clientId,
    client_id: clientId,
    'ticket.count': String(items.length),
    ticket_count: String(items.length),
    [FLOW_TICKET_ITEMS_KEY]: JSON.stringify(items),
  };

  if (items.length === 0) {
    mapped['ticket.menu'] = '';
    mapped.ticket_menu = '';
    return { found: false, mapped };
  }

  mapped['ticket.menu'] = buildTicketMenuText(items);
  mapped.ticket_menu = mapped['ticket.menu'];

  if (opts.mode === 'last_open') {
    applySelectedTicketVars(mapped, items[0]!);
  }

  return { found: true, mapped };
}
