import { describe, expect, it, vi } from 'vitest';

vi.mock('../chatInstanceOperableStatus.js', () => ({
  CHAT_INSTANCE_OPERABLE_STATUS_SQL: `(i.status IN ('connected', 'open'))`,
  isChatInstanceStatusOperable: (status: string | null | undefined) => {
    const s = String(status ?? '').toLowerCase();
    return s === 'connected' || s === 'open';
  },
}));

import {
  maybeSeedDefaultPurposeRouting,
  resolveInvoiceRoutedWhatsAppInstance,
  resolveModuleRoutedWhatsAppInstance,
  resolveWhatsAppRoutingForEventKey,
} from './whatsappInstanceRoutingService.js';

function mockPool(rowsByCall: unknown[][]) {
  let i = 0;
  return {
    query: vi.fn(async () => {
      const rows = rowsByCall[i] ?? [];
      i += 1;
      return { rows, rowCount: rows.length };
    }),
  } as any;
}

describe('resolveInvoiceRoutedWhatsAppInstance', () => {
  it('retorna null sem rota', async () => {
    const pool = mockPool([[], []]);
    const r = await resolveInvoiceRoutedWhatsAppInstance(pool, 'tenant-1');
    expect(r).toBeNull();
  });

  it('prioriza instância operable da rota invoice', async () => {
    const pool = mockPool([
      [
        {
          chat_instance_id: 'inst-a',
          sender_user_id: 'user-a',
          status: 'connected',
        },
      ],
    ]);
    const r = await resolveInvoiceRoutedWhatsAppInstance(pool, 'tenant-1');
    expect(r).toMatchObject({
      chat_instance_id: 'inst-a',
      sender_user_id: 'user-a',
      status: 'connected',
      routing_source: 'explicit',
      purpose: 'invoice',
    });
  });
});

describe('resolveModuleRoutedWhatsAppInstance', () => {
  it('resolve rota de módulo agenda', async () => {
    const pool = mockPool([
      [
        {
          chat_instance_id: 'inst-agenda',
          sender_user_id: 'user-a',
          status: 'open',
        },
      ],
    ]);
    const r = await resolveModuleRoutedWhatsAppInstance(pool, 'tenant-1', 'agenda');
    expect(r).toMatchObject({
      chat_instance_id: 'inst-agenda',
      purpose: 'module',
      module_key: 'agenda',
      routing_source: 'explicit',
    });
  });

  it('ignora module invoices (usa purpose invoice)', async () => {
    const pool = mockPool([]);
    const r = await resolveModuleRoutedWhatsAppInstance(pool, 'tenant-1', 'invoices');
    expect(r).toBeNull();
  });
});

describe('resolveWhatsAppRoutingForEventKey', () => {
  it('invoice.* → purpose invoice', async () => {
    const pool = mockPool([
      [
        {
          chat_instance_id: 'inst-inv',
          sender_user_id: 'user-a',
          status: 'connected',
        },
      ],
    ]);
    const r = await resolveWhatsAppRoutingForEventKey(pool, 't1', 'invoice.created');
    expect(r).toMatchObject({ purpose: 'invoice', chat_instance_id: 'inst-inv' });
  });

  it('sem rota de módulo → null (fallback no caller)', async () => {
    const pool = mockPool([[{ module: 'proposals' }], [], []]);
    const r = await resolveWhatsAppRoutingForEventKey(pool, 't1', 'proposal.sent');
    expect(r).toBeNull();
  });
});

describe('maybeSeedDefaultPurposeRouting', () => {
  it('não sobrescreve se já existe routing', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT i.status')) {
        return { rows: [{ status: 'connected' }], rowCount: 1 };
      }
      if (sql.includes('FROM tenant_whatsapp_instance_routing WHERE tenant_id')) {
        return { rows: [{}], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await maybeSeedDefaultPurposeRouting({
      pool: { query } as any,
      tenantId: 't1',
      chatInstanceId: 'inst-1',
    });
    expect(r).toEqual({ seeded: false, reason: 'already_configured' });
  });

  it('não seed com várias instâncias operable', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT i.status')) {
        return { rows: [{ status: 'connected' }], rowCount: 1 };
      }
      if (sql.includes('FROM tenant_whatsapp_instance_routing WHERE tenant_id')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('ORDER BY i.updated_at')) {
        return { rows: [{ id: 'inst-1' }, { id: 'inst-2' }], rowCount: 2 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await maybeSeedDefaultPurposeRouting({
      pool: { query } as any,
      tenantId: 't1',
      chatInstanceId: 'inst-1',
    });
    expect(r).toEqual({ seeded: false, reason: 'not_sole_operable' });
  });

  it('seed fatura + módulos na única operable', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT i.status')) {
        return { rows: [{ status: 'connected' }], rowCount: 1 };
      }
      if (
        sql.includes('FROM tenant_whatsapp_instance_routing WHERE tenant_id = $1') &&
        !sql.includes('purpose')
      ) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('ORDER BY i.updated_at')) {
        return { rows: [{ id: 'inst-1' }], rowCount: 1 };
      }
      if (sql.includes('INNER JOIN users u ON u.id = i.user_id') && sql.includes('SELECT 1')) {
        return { rows: [{}], rowCount: 1 };
      }
      if (sql.includes('DISTINCT module')) {
        return { rows: [{ module_key: 'agenda' }, { module_key: 'proposals' }], rowCount: 2 };
      }
      if (sql.includes('FROM notification_event_catalog')) {
        return { rows: [{}], rowCount: 1 };
      }
      if (sql.startsWith('DELETE') || sql.startsWith('INSERT') || sql.startsWith('UPDATE')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const r = await maybeSeedDefaultPurposeRouting({
      pool: { query } as any,
      tenantId: 't1',
      chatInstanceId: 'inst-1',
    });
    expect(r.seeded).toBe(true);
    expect(r.reason).toBe('seeded');
    expect(r.invoice).toBe(true);
    expect(r.modules).toEqual(['agenda', 'proposals']);
    expect(query.mock.calls.some((c) => String(c[0]).includes('INSERT'))).toBe(true);
  });
});
