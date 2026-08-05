/**
 * Helpers puros de faturas no motor FE / simulador (S11) — espelho do BE.
 */
export const FLOW_INVOICE_ITEMS_KEY = 'invoice._items';

export const FLOW_INVOICE_OPEN_STATUSES = [
  'pending',
  'waiting_payment',
  'processing',
  'overdue',
] as const;

export type FlowInvoiceItemBag = {
  id: string;
  number: string;
  total: string;
  due_date: string;
  status: string;
  public_link: string;
  amount_cents: number;
};

export function formatInvoiceAmountBrl(cents: number): string {
  const n = Number(cents) || 0;
  return (n / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata vencimento para exibição BR (dd/mm/yyyy).
 * Espelho do BE — Date do driver não deve virar "Wed Aug 05".
 */
export function formatDueDate(ymd: string | Date | null | undefined): string {
  if (ymd == null || ymd === '') return '—';

  if (ymd instanceof Date && !Number.isNaN(ymd.getTime())) {
    const y = ymd.getUTCFullYear();
    const mo = String(ymd.getUTCMonth() + 1).padStart(2, '0');
    const d = String(ymd.getUTCDate()).padStart(2, '0');
    return `${d}/${mo}/${y}`;
  }

  const raw = String(ymd).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const mo = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    return `${d}/${mo}/${y}`;
  }

  return raw || '—';
}

export function buildPayUrlFromToken(paymentToken: string | null | undefined): string {
  const t = String(paymentToken || '').trim();
  if (!t) return '';
  const base =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin.replace(/\/$/, '')
      : '';
  return base ? `${base}/pay/${t}` : `/pay/${t}`;
}

export function invoiceRowToBag(row: {
  id: string;
  invoice_number?: string | null;
  amount_cents?: number | null;
  due_date?: string | Date | null;
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
    public_link: buildPayUrlFromToken(row.payment_token),
    amount_cents: cents,
  };
}

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
          due_date: formatDueDate(o.due_date as string | Date | null | undefined),
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

/** Monta bag de lookup a partir de faturas reais (simulador S12). */
export function buildInvoiceLookupMappedFromItems(
  clientId: string,
  items: FlowInvoiceItemBag[],
  mode: 'last_open' | 'open_menu'
): { found: boolean; mapped: Record<string, string> } {
  const list = mode === 'last_open' ? items.slice(0, 1) : items;
  const mapped: Record<string, string> = {
    'client.id': clientId,
    client_id: clientId,
    'invoice.count': String(list.length),
    invoice_count: String(list.length),
    [FLOW_INVOICE_ITEMS_KEY]: JSON.stringify(list),
    'invoice.menu': buildInvoiceMenuText(list),
    invoice_menu: buildInvoiceMenuText(list),
  };
  if (list.length === 0) {
    return { found: false, mapped };
  }
  if (mode === 'last_open' && list[0]) {
    applySelectedInvoiceVars(mapped, list[0]);
  }
  return { found: true, mapped };
}

/** Mock de faturas para o simulador do editor. */
export function buildMockInvoiceLookupMapped(mode: 'last_open' | 'open_menu'): Record<string, string> {
  const items: FlowInvoiceItemBag[] = [
    {
      id: 'sim-inv-1',
      number: 'FAT-1001',
      total: 'R$ 150,00',
      due_date: '10/08/2026',
      status: 'pending',
      public_link: 'https://exemplo.app/pay/sim-token-1',
      amount_cents: 15000,
    },
    {
      id: 'sim-inv-2',
      number: 'FAT-1002',
      total: 'R$ 89,90',
      due_date: '15/08/2026',
      status: 'overdue',
      public_link: 'https://exemplo.app/pay/sim-token-2',
      amount_cents: 8990,
    },
  ];
  return buildInvoiceLookupMappedFromItems('sim-client-id', items, mode).mapped;
}
