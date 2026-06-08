import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock('../utils/kanbanRlsTx.js', () => ({
  beginKanbanTxWithRls: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/superadminOpsKanbanLeadService.js', () => ({
  hasKanbanAcquisitionLeadColumn: vi.fn().mockResolvedValue(true),
}));

vi.mock('../services/superadminOpsKanbanFoundation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/superadminOpsKanbanFoundation.js')>();
  return {
    ...actual,
    findCanonicalOpsBoardIdByNameFromPool: vi.fn(),
  };
});

vi.mock('./lifecyclePromotionConfig.js', () => ({
  isOpsLifecyclePromotionEnabled: vi.fn(),
}));

vi.mock('./lifecyclePromotionRepository.js', () => ({
  insertLifecycleTransition: vi.fn().mockResolvedValue('audit-1'),
}));

import { pool } from '../utils/db.js';
import { findCanonicalOpsBoardIdByNameFromPool } from '../services/superadminOpsKanbanFoundation.js';
import { hasKanbanAcquisitionLeadColumn } from '../services/superadminOpsKanbanLeadService.js';
import { isOpsLifecyclePromotionEnabled } from './lifecyclePromotionConfig.js';
import { insertLifecycleTransition } from './lifecyclePromotionRepository.js';
import {
  findLifecycleCardForLead,
  promoteLifecycleCard,
  resolveLifecycleDestinationColumn,
} from './lifecyclePromotionService.js';

const LEAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CARD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SRC_BOARD_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SRC_COL_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const DEST_BOARD_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const DEST_COL_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

function mockCardRow(overrides?: Partial<{
  card_id: string;
  board_id: string;
  column_id: string;
  board_name: string;
  column_name: string;
}>) {
  return {
    card_id: CARD_ID,
    board_id: SRC_BOARD_ID,
    column_id: SRC_COL_ID,
    board_name: 'Aquisição',
    column_name: 'Trial iniciado',
    ...overrides,
  };
}

function mockLeadResolve() {
  vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('FROM acquisition_leads WHERE tenant_id')) {
      return { rows: [{ id: LEAD_ID }], rowCount: 1 } as never;
    }
    if (s.includes('FROM chat_kanban_cards kc')) {
      return { rows: [mockCardRow()], rowCount: 1 } as never;
    }
    if (s.includes('FROM users WHERE is_super_admin')) {
      return { rows: [{ id: ACTOR_ID }], rowCount: 1 } as never;
    }
    if (s.includes('FROM chat_kanban_columns c') && s.includes('lower(btrim(c.name))')) {
      return { rows: [{ id: DEST_COL_ID }], rowCount: 1 } as never;
    }
    if (s.includes('COALESCE(MAX(position)')) {
      return { rows: [{ n: 1 }], rowCount: 1 } as never;
    }
    if (s.includes('UPDATE chat_kanban_cards')) {
      return { rows: [], rowCount: 1 } as never;
    }
    return { rows: [], rowCount: 0 } as never;
  });
}

describe('promoteLifecycleCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasKanbanAcquisitionLeadColumn).mockResolvedValue(true);
    vi.mocked(insertLifecycleTransition).mockResolvedValue('audit-1');
    vi.mocked(findCanonicalOpsBoardIdByNameFromPool).mockResolvedValue(DEST_BOARD_ID);
    process.env.SUPERADMIN_OPS_KANBAN_SYSTEM_USER_ID = ACTOR_ID;
  });

  afterEach(() => {
    delete process.env.SUPERADMIN_OPS_KANBAN_SYSTEM_USER_ID;
    delete process.env.OPS_LIFECYCLE_PROMOTION_ENABLED;
  });

  it('moves card when feature flag is on', async () => {
    vi.mocked(isOpsLifecyclePromotionEnabled).mockReturnValue(true);
    mockLeadResolve();

    const clientQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const client = { query: clientQuery, release: vi.fn() };
    vi.mocked(pool.connect).mockResolvedValue(client as never);

    const result = await promoteLifecycleCard({
      eventType: 'subscription.activated',
      context: { tenantId: TENANT_ID },
      source: 'test',
    });

    expect(result.status).toBe('moved');
    expect(result.cardId).toBe(CARD_ID);
    expect(result.fromBoard).toBe('Aquisição');
    expect(result.toBoard).toBe('Expansão');
    expect(result.toColumn).toBe('Novo Cliente');
    expect(pool.connect).toHaveBeenCalled();
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE chat_kanban_cards'),
      expect.arrayContaining([DEST_BOARD_ID, DEST_COL_ID, CARD_ID]),
    );
    expect(insertLifecycleTransition).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'moved', eventType: 'subscription.activated' }),
    );
  });

  it('returns card_not_found without throwing', async () => {
    vi.mocked(isOpsLifecyclePromotionEnabled).mockReturnValue(true);
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('FROM acquisition_leads WHERE tenant_id')) {
        return { rows: [{ id: LEAD_ID }], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });

    const result = await promoteLifecycleCard({
      eventType: 'subscription.activated',
      context: { tenantId: TENANT_ID },
      source: 'test',
    });

    expect(result.status).toBe('card_not_found');
    expect(pool.connect).not.toHaveBeenCalled();
    expect(insertLifecycleTransition).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'card_not_found' }),
    );
  });

  it('returns board_not_found when canonical board is missing', async () => {
    vi.mocked(isOpsLifecyclePromotionEnabled).mockReturnValue(true);
    vi.mocked(findCanonicalOpsBoardIdByNameFromPool).mockResolvedValue(null);
    mockLeadResolve();

    const result = await promoteLifecycleCard({
      eventType: 'subscription.activated',
      context: { tenantId: TENANT_ID },
      source: 'test',
    });

    expect(result.status).toBe('board_not_found');
    expect(result.toBoard).toBe('Expansão');
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('returns column_not_found when destination column is missing', async () => {
    vi.mocked(isOpsLifecyclePromotionEnabled).mockReturnValue(true);
    vi.mocked(findCanonicalOpsBoardIdByNameFromPool).mockResolvedValue(DEST_BOARD_ID);
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('FROM acquisition_leads WHERE tenant_id')) {
        return { rows: [{ id: LEAD_ID }], rowCount: 1 } as never;
      }
      if (s.includes('FROM chat_kanban_cards kc')) {
        return { rows: [mockCardRow()], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });

    const result = await promoteLifecycleCard({
      eventType: 'subscription.activated',
      context: { tenantId: TENANT_ID },
      source: 'test',
    });

    expect(result.status).toBe('column_not_found');
    expect(result.toColumn).toBe('Novo Cliente');
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('returns already_at_destination without moving', async () => {
    vi.mocked(isOpsLifecyclePromotionEnabled).mockReturnValue(true);
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('FROM acquisition_leads WHERE tenant_id')) {
        return { rows: [{ id: LEAD_ID }], rowCount: 1 } as never;
      }
      if (s.includes('FROM chat_kanban_cards kc')) {
        return {
          rows: [
            mockCardRow({
              board_id: DEST_BOARD_ID,
              column_id: DEST_COL_ID,
              board_name: 'Expansão',
              column_name: 'Novo Cliente',
            }),
          ],
          rowCount: 1,
        } as never;
      }
      if (s.includes('FROM chat_kanban_columns c') && s.includes('lower(btrim(c.name))')) {
        return { rows: [{ id: DEST_COL_ID }], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });

    const result = await promoteLifecycleCard({
      eventType: 'subscription.activated',
      context: { tenantId: TENANT_ID },
      source: 'test',
    });

    expect(result.status).toBe('already_at_destination');
    expect(pool.connect).not.toHaveBeenCalled();
    expect(insertLifecycleTransition).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'already_at_destination' }),
    );
  });

  it('audits but does not move when feature flag is off', async () => {
    vi.mocked(isOpsLifecyclePromotionEnabled).mockReturnValue(false);
    mockLeadResolve();

    const result = await promoteLifecycleCard({
      eventType: 'subscription.activated',
      context: { tenantId: TENANT_ID },
      source: 'test',
    });

    expect(result.status).toBe('promotion_disabled');
    expect(result.reason).toContain('OPS_LIFECYCLE_PROMOTION_ENABLED=false');
    expect(pool.connect).not.toHaveBeenCalled();
    expect(insertLifecycleTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'promotion_disabled',
        destinationBoardId: DEST_BOARD_ID,
        destinationColumnId: DEST_COL_ID,
      }),
    );
  });
});

describe('findLifecycleCardForLead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasKanbanAcquisitionLeadColumn).mockResolvedValue(true);
  });

  it('resolves card by acquisitionLeadId', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [mockCardRow()],
      rowCount: 1,
    } as never);

    const card = await findLifecycleCardForLead({ acquisitionLeadId: LEAD_ID });
    expect(card?.cardId).toBe(CARD_ID);
    expect(card?.acquisitionLeadId).toBe(LEAD_ID);
  });

  it('falls back to tenant when lead id is missing', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: LEAD_ID }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [mockCardRow()], rowCount: 1 } as never);

    const card = await findLifecycleCardForLead({ tenantId: TENANT_ID });
    expect(card?.cardId).toBe(CARD_ID);
  });
});

describe('resolveLifecycleDestinationColumn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findCanonicalOpsBoardIdByNameFromPool).mockResolvedValue(DEST_BOARD_ID);
  });

  it('returns board and column ids when both exist', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: DEST_COL_ID }],
      rowCount: 1,
    } as never);

    const dest = await resolveLifecycleDestinationColumn('Expansão', 'Novo Cliente');
    expect(dest).toEqual({
      boardId: DEST_BOARD_ID,
      columnId: DEST_COL_ID,
      boardName: 'Expansão',
      columnName: 'Novo Cliente',
    });
  });

  it('returns null when board is missing', async () => {
    vi.mocked(findCanonicalOpsBoardIdByNameFromPool).mockResolvedValue(null);
    const dest = await resolveLifecycleDestinationColumn('Expansão', 'Novo Cliente');
    expect(dest).toBeNull();
  });
});
