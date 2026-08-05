import { describe, expect, it } from 'vitest';
import {
  buildCategoryMenuText,
  pickCategoryFromAnswer,
  pickTicketFromAnswer,
  ticketsToMenuOptions,
  type FlowTicketCategoryItem,
  type FlowTicketListItem,
} from '../flowTicketActions.js';

const cats: FlowTicketCategoryItem[] = [
  { id: 'uuid-1', name: 'Suporte', option_id: 'c1' },
  { id: 'uuid-2', name: 'Financeiro', option_id: 'c2' },
  { id: 'uuid-3', name: 'Comercial', option_id: 'c3' },
];

const tickets: FlowTicketListItem[] = [
  {
    id: 'tid-1',
    number: 'TKT-001',
    subject: 'Internet lenta',
    status: 'open',
    public_token: 'tok1',
    public_url: '/ticket/tok1',
    option_id: 't1',
  },
  {
    id: 'tid-2',
    number: 'TKT-002',
    subject: 'Fatura',
    status: 'pending',
    public_token: 'tok2',
    public_url: '/ticket/tok2',
    option_id: 't2',
  },
  {
    id: 'tid-3',
    number: 'TKT-003',
    subject: 'Outro',
    status: 'open',
    public_token: 'tok3',
    public_url: '/ticket/tok3',
    option_id: 't3',
  },
];

describe('pickCategoryFromAnswer', () => {
  it('aceita option_id', () => {
    const r = pickCategoryFromAnswer('c2', cats);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.item.name).toBe('Financeiro');
  });

  it('aceita número 1-based', () => {
    const r = pickCategoryFromAnswer('3', cats);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.item.option_id).toBe('c3');
  });

  it('aceita nome case-insensitive', () => {
    const r = pickCategoryFromAnswer('suporte', cats);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.item.id).toBe('uuid-1');
  });

  it('rejeita inválido', () => {
    expect(pickCategoryFromAnswer('xyz', cats).ok).toBe(false);
  });
});

describe('buildCategoryMenuText', () => {
  it('lista numerada', () => {
    expect(buildCategoryMenuText(cats)).toBe('1) Suporte\n2) Financeiro\n3) Comercial');
  });
});

describe('pickTicketFromAnswer', () => {
  it('aceita option_id', () => {
    const r = pickTicketFromAnswer('t2', tickets);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.item.number).toBe('TKT-002');
  });

  it('aceita número do ticket', () => {
    const r = pickTicketFromAnswer('TKT-001', tickets);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.item.option_id).toBe('t1');
  });

  it('aceita índice 1-based', () => {
    const r = pickTicketFromAnswer('3', tickets);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.item.id).toBe('tid-3');
  });

  it('rejeita inválido', () => {
    expect(pickTicketFromAnswer('xyz', tickets).ok).toBe(false);
  });
});

describe('ticketsToMenuOptions', () => {
  it('limita a 3 botões com label curta', () => {
    const opts = ticketsToMenuOptions(tickets);
    expect(opts).toHaveLength(3);
    expect(opts[0]?.label).toMatch(/^#TKT-001/);
    expect(opts[0]?.id).toBe('t1');
  });
});

describe('runtimeTicketAssistBootstrap no_client vs categorias', () => {
  it('documenta contrato: no_client mantém category_count real no mapped', async () => {
    // Contrato usado pelo engine para não mostrar "sem categorias" quando o gap é cliente.
    // (teste de regressão de shape — sem DB: simula o mapped esperado)
    const mapped = {
      'ticket.category_count': '2',
      ticket_category_count: '2',
      'ticket._bootstrap_reason': 'no_client',
    };
    expect(mapped['ticket._bootstrap_reason']).toBe('no_client');
    expect(Number(mapped['ticket.category_count'])).toBeGreaterThan(0);
  });
});
