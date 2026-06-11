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

vi.mock('../services/moveOpsCardWithAutomations.js', () => ({
  moveOpsCardWithAutomations: vi.fn(),
}));

import { pool } from '../utils/db.js';
import { moveOpsCardWithAutomations } from '../services/moveOpsCardWithAutomations.js';
import { hasKanbanAcquisitionLeadColumn } from '../services/superadminOpsKanbanLeadService.js';
import { findCanonicalOpsBoardIdByNameFromPool } from '../services/superadminOpsKanbanFoundation.js';
import { isOpsLifecyclePromotionEnabled } from './lifecyclePromotionConfig.js';
import { insertLifecycleTransition } from './lifecyclePromotionRepository.js';
import { promoteLifecycleCard } from './lifecyclePromotionService.js';

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
    board_name: 'Onboarding',
    column_name: 'Onboarding incompleto',
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

const promoteInput = {
  eventType: 'trial.engagement.started' as const,
  context: { tenantId: TENANT_ID, acquisitionLeadId: LEAD_ID },
  source: 'trial_engagement_started',
};

describe('trialEngagementEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasKanbanAcquisitionLeadColumn).mockResolvedValue(true);
    vi.mocked(insertLifecycleTransition).mockResolvedValue('audit-1');
    vi.mocked(findCanonicalOpsBoardIdByNameFromPool).mockResolvedValue(DEST_BOARD_ID);
    vi.mocked(isOpsLifecyclePromotionEnabled).mockReturnValue(true);
    process.env.SUPERADMIN_OPS_KANBAN_SYSTEM_USER_ID = ACTOR_ID;
  });

  afterEach(() => {
    delete process.env.SUPERADMIN_OPS_KANBAN_SYSTEM_USER_ID;
    delete process.env.OPS_LIFECYCLE_PROMOTION_ENABLED;
  });

  it('cenário A — novo trial move para Engajamento Trial / Trial iniciado', async () => {
    mockLeadResolve();
    vi.mocked(moveOpsCardWithAutomations).mockResolvedValue({
      status: 'moved',
      phase2Executed: true,
      cardId: CARD_ID,
      acquisitionLeadId: LEAD_ID,
    });

    const result = await promoteLifecycleCard(promoteInput);

    expect(result.status).toBe('moved');
    expect(result.toBoard).toBe('Engajamento Trial');
    expect(result.toColumn).toBe('Trial iniciado');
    expect(moveOpsCardWithAutomations).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: CARD_ID,
        destinationBoardId: DEST_BOARD_ID,
        destinationColumnId: DEST_COL_ID,
        source: 'trial_engagement_started',
      }),
    );
    expect(insertLifecycleTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'trial.engagement.started',
        result: 'moved',
        destinationBoardId: DEST_BOARD_ID,
        destinationColumnId: DEST_COL_ID,
      }),
    );
  });

  it('cenário B — card já em Trial iniciado retorna already_at_destination', async () => {
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
              board_name: 'Engajamento Trial',
              column_name: 'Trial iniciado',
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

    const result = await promoteLifecycleCard(promoteInput);

    expect(result.status).toBe('already_at_destination');
    expect(result.toBoard).toBe('Engajamento Trial');
    expect(result.toColumn).toBe('Trial iniciado');
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('cenário C — board ausente retorna board_not_found', async () => {
    vi.mocked(findCanonicalOpsBoardIdByNameFromPool).mockResolvedValue(null);
    mockLeadResolve();

    const result = await promoteLifecycleCard(promoteInput);

    expect(result.status).toBe('board_not_found');
    expect(result.toBoard).toBe('Engajamento Trial');
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('cenário D — coluna ausente retorna column_not_found', async () => {
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

    const result = await promoteLifecycleCard(promoteInput);

    expect(result.status).toBe('column_not_found');
    expect(result.toBoard).toBe('Engajamento Trial');
    expect(result.toColumn).toBe('Trial iniciado');
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('cenário E — card inexistente retorna card_not_found', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('FROM acquisition_leads WHERE tenant_id')) {
        return { rows: [{ id: LEAD_ID }], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });

    const result = await promoteLifecycleCard(promoteInput);

    expect(result.status).toBe('card_not_found');
    expect(result.toBoard).toBe('Engajamento Trial');
    expect(result.toColumn).toBe('Trial iniciado');
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
