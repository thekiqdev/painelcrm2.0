/**
 * Helpers puros de ticket no motor FE / simulador (S25) — espelho do BE.
 */
export const FLOW_TICKET_CATEGORIES_KEY = 'ticket._categories';
export const TICKET_ASSIST_STEP_KEY = 'ticket._assist_step';
export const TICKET_ASSIST_RETRIES_KEY = 'ticket._assist_retries';
export const TICKET_ASSIST_PHASE_KEY = 'ticket._assist_phase';
export const TICKET_CATEGORY_BUTTON_LIMIT = 3;

export type FlowTicketCategoryItem = {
  id: string;
  name: string;
  option_id: string;
};

export function buildCategoryMenuText(items: FlowTicketCategoryItem[]): string {
  if (items.length === 0) return '';
  return items.map((it, i) => `${i + 1}) ${it.name}`).join('\n');
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

export function categoriesToMenuOptions(
  items: FlowTicketCategoryItem[]
): Array<{ id: string; label: string }> {
  return items.slice(0, TICKET_CATEGORY_BUTTON_LIMIT).map((it) => ({
    id: it.option_id,
    label: it.name.slice(0, 24),
  }));
}

export function buildMockTicketCreatedMapped(): Record<string, string> {
  return {
    'ticket.id': 'sim-ticket-id',
    ticket_id: 'sim-ticket-id',
    'ticket.number': 'TKT-SIM-001',
    ticket_number: 'TKT-SIM-001',
    'ticket.subject': 'Assunto simulado',
    ticket_subject: 'Assunto simulado',
    'ticket.status': 'new',
    'ticket.category_id': 'sim-cat',
    'ticket.category_name': 'Suporte',
    'ticket.public_token': 'sim-token',
    'ticket.public_url': '/ticket/sim-token',
    ticket_public_url: '/ticket/sim-token',
    ticket_public_link: '/ticket/sim-token',
  };
}

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

export function ticketsToMenuOptions(
  items: FlowTicketListItem[]
): Array<{ id: string; label: string; description?: string }> {
  return items.slice(0, TICKET_CATEGORY_BUTTON_LIMIT).map((it) => ({
    id: it.option_id,
    label: `#${it.number}`.slice(0, 24),
    description: it.subject.slice(0, 72),
  }));
}

export function buildMockTicketLookupMapped(mode: 'last_open' | 'open_menu'): Record<string, string> {
  const items: FlowTicketListItem[] = [
    {
      id: 'sim-t1',
      number: 'TKT-001',
      subject: 'Problema simulado',
      status: 'open',
      public_token: 'tok1',
      public_url: '/ticket/tok1',
      option_id: 't1',
    },
    {
      id: 'sim-t2',
      number: 'TKT-002',
      subject: 'Outro chamado',
      status: 'pending',
      public_token: 'tok2',
      public_url: '/ticket/tok2',
      option_id: 't2',
    },
  ];
  const use = mode === 'last_open' ? items.slice(0, 1) : items;
  const mapped: Record<string, string> = {
    'ticket.count': String(use.length),
    ticket_count: String(use.length),
    [FLOW_TICKET_ITEMS_KEY]: JSON.stringify(use),
    'ticket.menu': buildTicketMenuText(use),
    ticket_menu: buildTicketMenuText(use),
  };
  if (mode === 'last_open' && use[0]) applySelectedTicketVars(mapped, use[0]);
  return mapped;
}
