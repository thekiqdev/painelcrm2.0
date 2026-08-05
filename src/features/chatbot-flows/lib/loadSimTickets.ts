/**
 * Carrega categorias/tickets reais do tenant para o simulador (S25.2).
 * Mesma fonte que Configurações → Suporte → Categorias (`/api/ticket-categories`).
 */
import { ticketsService } from '@/services/tickets';
import {
  applySelectedTicketVars,
  buildCategoryMenuText,
  buildTicketMenuText,
  FLOW_TICKET_CATEGORIES_KEY,
  FLOW_TICKET_ITEMS_KEY,
  FLOW_TICKET_OPEN_STATUSES,
  type FlowTicketCategoryItem,
  type FlowTicketListItem,
} from './flowTicketVars';

function categoriesFromApi(
  rows: Array<{ id: string; name: string }>
): FlowTicketCategoryItem[] {
  return rows.map((c, i) => ({
    id: String(c.id),
    name: String(c.name || '').trim() || 'Categoria',
    option_id: `c${i + 1}`,
  }));
}

export async function loadTicketAssistBootstrapForSim(opts: {
  clientId?: string | null;
  requireClient?: boolean;
}): Promise<{
  ok: boolean;
  reason?: 'no_client' | 'no_categories';
  mapped: Record<string, string>;
  categories: FlowTicketCategoryItem[];
}> {
  const requireClient = opts.requireClient !== false;
  const rows = await ticketsService.getTicketCategories({ force: true });
  const categories = categoriesFromApi(rows);
  const menu = buildCategoryMenuText(categories);
  const mapped: Record<string, string> = {
    'ticket.category_count': String(categories.length),
    ticket_category_count: String(categories.length),
    [FLOW_TICKET_CATEGORIES_KEY]: JSON.stringify(categories),
    'ticket.menu': menu,
    ticket_menu: menu,
    'ticket._bootstrap_reason': '',
  };
  if (opts.clientId) {
    mapped['client.id'] = opts.clientId;
    mapped.client_id = opts.clientId;
  }

  if (requireClient && !opts.clientId) {
    mapped['ticket._bootstrap_reason'] = 'no_client';
    return { ok: false, reason: 'no_client', mapped, categories };
  }
  if (categories.length === 0) {
    mapped['ticket._bootstrap_reason'] = 'no_categories';
    return { ok: false, reason: 'no_categories', mapped, categories: [] };
  }
  return { ok: true, mapped, categories };
}

function ticketToListItem(
  t: {
    id: string;
    ticket_number?: string | null;
    subject?: string | null;
    status?: string | null;
    public_access_token?: string | null;
  },
  index: number
): FlowTicketListItem {
  const token = String(t.public_access_token || '').trim();
  const number = String(t.ticket_number || t.id).trim();
  return {
    id: String(t.id),
    number,
    subject: String(t.subject || '').trim(),
    status: String(t.status || ''),
    public_token: token,
    public_url: token ? `/ticket/${encodeURIComponent(token)}` : '',
    option_id: `t${index + 1}`,
  };
}

export async function loadOpenTicketsMappedForSim(opts: {
  clientId: string;
  mode: 'last_open' | 'open_menu';
  limit?: number;
  includeClosed?: boolean;
}): Promise<{ found: boolean; mapped: Record<string, string>; items: FlowTicketListItem[] }> {
  const limit =
    opts.mode === 'last_open' ? 1 : Math.min(20, Math.max(1, opts.limit ?? 8));
  const rows = await ticketsService.getTickets({ client_id: opts.clientId });
  const open = new Set<string>(FLOW_TICKET_OPEN_STATUSES);
  let filtered = opts.includeClosed
    ? rows
    : rows.filter((t) => open.has(String(t.status || '')));
  // API pode não ordenar por updated_at; manter ordem recebida e cortar
  filtered = filtered.slice(0, limit);
  const items = filtered.map((t, i) => ticketToListItem(t, i));
  const mapped: Record<string, string> = {
    'ticket.count': String(items.length),
    ticket_count: String(items.length),
    'ticket.menu': buildTicketMenuText(items),
    ticket_menu: buildTicketMenuText(items),
    [FLOW_TICKET_ITEMS_KEY]: JSON.stringify(items),
    'client.id': opts.clientId,
    client_id: opts.clientId,
  };
  if (items.length === 1) {
    applySelectedTicketVars(mapped, items[0]!);
  }
  return { found: items.length > 0, mapped, items };
}
