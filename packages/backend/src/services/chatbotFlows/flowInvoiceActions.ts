/**
 * Ações de fatura CRM no runtime Chatbot Flows (S11).
 * Link público = {FRONTEND_URL}/pay/{payment_token} (mesmo das notificações invoice.*).
 */
import { pool } from '../../utils/db.js';
import { listInvoices } from '../customerBillingService.js';

export const FLOW_INVOICE_OPEN_STATUSES = [
  'pending',
  'waiting_payment',
  'processing',
  'overdue',
] as const;

/** Catálogo interno da sessão (JSON) para o nó select_invoice. */
export const FLOW_INVOICE_ITEMS_KEY = 'invoice._items';

export type FlowInvoiceItemBag = {
  id: string;
  number: string;
  total: string;
  due_date: string;
  status: string;
  public_link: string;
  amount_cents: number;
};

function publicAppBaseUrl(): string {
  const raw =
    (process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || '').split(',')[0]?.trim() ?? '';
  return raw.replace(/\/$/, '');
}

export function buildCustomerInvoicePayUrl(paymentToken: string | null | undefined): string {
  const t = String(paymentToken || '').trim();
  if (!t) return '';
  const base = publicAppBaseUrl();
  if (!base) return `/pay/${t}`;
  return `${base}/pay/${t}`;
}

export function formatInvoiceAmountBrl(cents: number): string {
  const n = Number(cents) || 0;
  return (n / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDueDate(ymd: string | null | undefined): string {
  const s = String(ymd || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s || '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function invoiceRowToBag(row: {
  id: string;
  invoice_number?: string | null;
  amount_cents?: number | null;
  due_date?: string | null;
  status?: string | null;
  payment_token?: string | null;
}): FlowInvoiceItemBag {
  const cents = Number(row.amount_cents) || 0;
  return {
    id: String(row.id),
    number: String(row.invoice_number || row.id).trim() || String(row.id),
    total: formatInvoiceAmountBrl(cents),
    due_date: formatDueDate(row.due_date),
    status: String(row.status || ''),
    public_link: buildCustomerInvoicePayUrl(row.payment_token),
    amount_cents: cents,
  };
}

/** Aplica campos da fatura selecionada (sobrescreve invoice.*). */
export function applySelectedInvoiceVars(
  bag: Record<string, unknown>,
  item: FlowInvoiceItemBag
): void {
  bag['invoice.id'] = item.id;
  bag['invoice.number'] = item.number;
  bag['invoice.total'] = item.total;
  bag['invoice.due_date'] = item.due_date;
  bag['invoice.status'] = item.status;
  bag['invoice.public_link'] = item.public_link;
  bag['invoice.amount_cents'] = String(item.amount_cents);
  bag.invoice_id = item.id;
  bag.invoice_number = item.number;
  bag.invoice_total = item.total;
  bag.invoice_due_date = item.due_date;
  bag.invoice_public_link = item.public_link;
}

export function buildInvoiceMenuText(items: FlowInvoiceItemBag[]): string {
  if (items.length === 0) return '';
  return items
    .map((it, i) => `${i + 1}) ${it.number} — ${it.total} — vence ${it.due_date}`)
    .join('\n');
}

export function parseInvoiceItemsFromSession(
  variables: Record<string, unknown>
): FlowInvoiceItemBag[] {
  const raw = variables[FLOW_INVOICE_ITEMS_KEY];
  if (raw == null) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => {
        if (!x || typeof x !== 'object') return null;
        const o = x as Record<string, unknown>;
        if (!o.id) return null;
        return {
          id: String(o.id),
          number: String(o.number || o.id),
          total: String(o.total || ''),
          due_date: String(o.due_date || ''),
          status: String(o.status || ''),
          public_link: String(o.public_link || ''),
          amount_cents: Number(o.amount_cents) || 0,
        } satisfies FlowInvoiceItemBag;
      })
      .filter(Boolean) as FlowInvoiceItemBag[];
  } catch {
    return [];
  }
}

/** Interpreta resposta do usuário (1, "1)", "opção 2"…). */
export function pickInvoiceIndexFromAnswer(answer: string, count: number): number | null {
  const t = String(answer || '').trim();
  if (!t || count <= 0) return null;
  const m = t.match(/(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1 || n > count) return null;
  return n - 1;
}

export function selectInvoiceFromSessionVars(
  variables: Record<string, unknown>,
  answerVariable: string
): { ok: true; item: FlowInvoiceItemBag } | { ok: false; reason: string } {
  const items = parseInvoiceItemsFromSession(variables);
  if (items.length === 0) return { ok: false, reason: 'Sem catálogo de faturas na sessão' };
  const answer = variables[answerVariable] == null ? '' : String(variables[answerVariable]);
  const idx = pickInvoiceIndexFromAnswer(answer, items.length);
  if (idx == null) return { ok: false, reason: 'Opção inválida' };
  return { ok: true, item: items[idx]! };
}

export async function resolveClientIdForConversation(opts: {
  tenantId: string;
  conversationId: string;
}): Promise<string | null> {
  const conv = await pool.query<{
    client_id: string | null;
    phone_normalized: string | null;
    phone_number: string | null;
  }>(
    `SELECT c.client_id, c.phone_normalized, c.phone_number
     FROM chat_conversations c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.id = $1::uuid AND u.tenant_id = $2::uuid
     LIMIT 1`,
    [opts.conversationId, opts.tenantId]
  );
  const row = conv.rows[0];
  if (!row) return null;
  if (row.client_id) return String(row.client_id);

  const phone = String(row.phone_normalized || row.phone_number || '').replace(/\D/g, '');
  if (phone.length < 8) return null;

  const clients = await pool.query<{ id: string }>(
    `SELECT c.id
     FROM clients c
     INNER JOIN users u ON u.id = c.user_id
     WHERE u.tenant_id = $1::uuid
       AND c.phone IS NOT NULL
       AND c.phone <> ''
       AND (
         regexp_replace(c.phone, '\\D', '', 'g') = $2
         OR regexp_replace(c.phone, '\\D', '', 'g') = substring($2 from 3)
       )
     ORDER BY c.updated_at DESC NULLS LAST
     LIMIT 1`,
    [opts.tenantId, phone]
  );
  return clients.rows[0]?.id ? String(clients.rows[0].id) : null;
}

export type RuntimeLookupInvoiceResult = {
  found: boolean;
  mapped: Record<string, string>;
};

/**
 * Consulta faturas em aberto do cliente vinculado à conversa.
 * mode last_open → 1 fatura em invoice.*
 * mode open_menu → menu + invoice._items (até limit)
 */
export async function runtimeLookupInvoice(opts: {
  tenantId: string;
  conversationId: string;
  mode: 'last_open' | 'open_menu';
  limit?: number;
}): Promise<RuntimeLookupInvoiceResult> {
  const clientId = await resolveClientIdForConversation({
    tenantId: opts.tenantId,
    conversationId: opts.conversationId,
  });
  if (!clientId) {
    return {
      found: false,
      mapped: {
        'invoice.count': '0',
        invoice_count: '0',
        'invoice.menu': '',
        [FLOW_INVOICE_ITEMS_KEY]: '[]',
      },
    };
  }

  const limit =
    opts.mode === 'last_open'
      ? 1
      : Math.min(Math.max(1, Number(opts.limit) || 8), 20);

  const rows = await listInvoices(opts.tenantId, {
    client_id: clientId,
    status_in: [...FLOW_INVOICE_OPEN_STATUSES],
    limit,
  });

  const items = rows.map(invoiceRowToBag);
  const mapped: Record<string, string> = {
    'client.id': clientId,
    client_id: clientId,
    'invoice.count': String(items.length),
    invoice_count: String(items.length),
    [FLOW_INVOICE_ITEMS_KEY]: JSON.stringify(items),
  };

  if (items.length === 0) {
    mapped['invoice.menu'] = '';
    return { found: false, mapped };
  }

  if (opts.mode === 'open_menu') {
    mapped['invoice.menu'] = buildInvoiceMenuText(items);
    mapped.invoice_menu = mapped['invoice.menu'];
  } else {
    applySelectedInvoiceVars(mapped, items[0]!);
    mapped['invoice.menu'] = buildInvoiceMenuText(items);
    mapped.invoice_menu = mapped['invoice.menu'];
  }

  return { found: true, mapped };
}
