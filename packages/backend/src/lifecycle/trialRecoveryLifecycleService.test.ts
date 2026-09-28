import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../utils/db.js';
import { findCanonicalOpsBoardIdByNameFromPool } from '../services/superadminOpsKanbanFoundation.js';
import { hasKanbanAcquisitionLeadColumn } from '../services/superadminOpsKanbanLeadService.js';
import { promoteLifecycleCard } from './lifecyclePromotionService.js';
import {
  daysSinceTimestamp,
  processTrialRecoveryLifecycleBatch,
  resolveTrialRecoveryEventType,
  TRIAL_RECOVERY_BOARD_NAME,
} from './trialRecoveryLifecycleService.js';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../services/superadminOpsKanbanFoundation.js', () => ({
  findCanonicalOpsBoardIdByNameFromPool: vi.fn(),
}));

vi.mock('../services/superadminOpsKanbanLeadService.js', () => ({
  hasKanbanAcquisitionLeadColumn: vi.fn(),
}));

vi.mock('./lifecyclePromotionService.js', () => ({
  promoteLifecycleCard: vi.fn(),
}));

const BOARD_ID = 'b0000000-0000-4000-8000-000000000001';
const CARD_ID = 'c0000000-0000-4000-8000-000000000001';
const COL_TRIAL_EXPIRED = 'col-trial-expired';
const COL_DAY1 = 'col-day1';
const COL_DAY3 = 'col-day3';
const COL_DAY7 = 'col-day7';
const LEAD_ID = 'l0000000-0000-4000-8000-000000000001';
const TENANT_ID = 't0000000-0000-4000-8000-000000000001';

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

function mockRecoveryCard(columnId: string, columnName: string) {
  return {
    card_id: CARD_ID,
    column_id: columnId,
    column_name: columnName,
    acquisition_lead_id: LEAD_ID,
    tenant_id: TENANT_ID,
  };
}

function setupBoardAndCards(
  cards: ReturnType<typeof mockRecoveryCard>[],
  entryAt: Date | null,
) {
  vi.mocked(findCanonicalOpsBoardIdByNameFromPool).mockResolvedValue(BOARD_ID);
  vi.mocked(pool.query).mockImplementation(async (sql: unknown, params?: unknown[]) => {
    const s = String(sql);
    if (s.includes('FROM chat_kanban_cards kc') && s.includes('lower(btrim(col.name))')) {
      return { rows: cards, rowCount: cards.length } as never;
    }
    if (s.includes('FROM ops_lifecycle_transitions') && s.includes('destination_column_id')) {
      if (entryAt) {
        return { rows: [{ created_at: entryAt }], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    }
    if (s.includes("event_type = 'trial.expired'")) {
      if (entryAt) {
        return { rows: [{ created_at: entryAt }], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    }
    return { rows: [], rowCount: 0 } as never;
  });
}

describe('trialRecoveryLifecycleService helpers', () => {
  it('resolveTrialRecoveryEventType respects wait windows', () => {
    expect(resolveTrialRecoveryEventType('Trial expirado', 0)).toBeNull();
    expect(resolveTrialRecoveryEventType('Trial expirado', 1)).toBe('trial.recovery.day1');
    expect(resolveTrialRecoveryEventType('Dia 1', 1)).toBeNull();
    expect(resolveTrialRecoveryEventType('Dia 1', 2)).toBe('trial.recovery.day3');
    expect(resolveTrialRecoveryEventType('Dia 3', 3)).toBeNull();
    expect(resolveTrialRecoveryEventType('Dia 3', 4)).toBe('trial.recovery.day7');
    expect(resolveTrialRecoveryEventType('Dia 7', 6)).toBeNull();
    expect(resolveTrialRecoveryEventType('Dia 7', 7)).toBe('trial.recovery.last_attempt');
  });

  it('daysSinceTimestamp floors full days', () => {
    const entered = new Date('2026-01-01T12:00:00.000Z');
    const now = new Date('2026-01-03T11:59:59.000Z');
    expect(daysSinceTimestamp(entered, now)).toBe(1);
    expect(daysSinceTimestamp(entered, new Date('2026-01-03T12:00:00.000Z'))).toBe(2);
  });
});

describe('processTrialRecoveryLifecycleBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasKanbanAcquisitionLeadColumn).mockResolvedValue(true);
    vi.mocked(promoteLifecycleCard).mockResolvedValue({
      status: 'moved',
      cardId: CARD_ID,
      fromBoard: TRIAL_RECOVERY_BOARD_NAME,
      toBoard: TRIAL_RECOVERY_BOARD_NAME,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('promotes Trial expirado to Dia 1 after 1 day', async () => {
    setupBoardAndCards([mockRecoveryCard(COL_TRIAL_EXPIRED, 'Trial expirado')], daysAgo(1));

    const result = await processTrialRecoveryLifecycleBatch();

    expect(result.promoted).toBe(1);
    expect(promoteLifecycleCard).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'trial.recovery.day1',
        source: 'trial_recovery_lifecycle',
        context: { acquisitionLeadId: LEAD_ID, tenantId: TENANT_ID },
      }),
    );
  });

  it('promotes Dia 1 to Dia 3 after 2 days', async () => {
    setupBoardAndCards([mockRecoveryCard(COL_DAY1, 'Dia 1')], daysAgo(2));

    await processTrialRecoveryLifecycleBatch();

    expect(promoteLifecycleCard).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'trial.recovery.day3' }),
    );
  });

  it('promotes Dia 3 to Dia 7 after 4 days', async () => {
    setupBoardAndCards([mockRecoveryCard(COL_DAY3, 'Dia 3')], daysAgo(4));

    await processTrialRecoveryLifecycleBatch();

    expect(promoteLifecycleCard).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'trial.recovery.day7' }),
    );
  });

  it('promotes Dia 7 to Última tentativa after 7 days', async () => {
    setupBoardAndCards([mockRecoveryCard(COL_DAY7, 'Dia 7')], daysAgo(7));

    await processTrialRecoveryLifecycleBatch();

    expect(promoteLifecycleCard).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'trial.recovery.last_attempt' }),
    );
  });

  it('is idempotent when wait window not met', async () => {
    setupBoardAndCards([mockRecoveryCard(COL_TRIAL_EXPIRED, 'Trial expirado')], daysAgo(0));

    const result = await processTrialRecoveryLifecycleBatch();

    expect(result.eligible).toBe(0);
    expect(result.promoted).toBe(0);
    expect(promoteLifecycleCard).not.toHaveBeenCalled();
  });

  it('skips when no cards exist', async () => {
    vi.mocked(findCanonicalOpsBoardIdByNameFromPool).mockResolvedValue(BOARD_ID);
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

    const result = await processTrialRecoveryLifecycleBatch();

    expect(result.scanned).toBe(0);
    expect(promoteLifecycleCard).not.toHaveBeenCalled();
  });

  it('returns board_not_found when Reativação board is missing', async () => {
    vi.mocked(findCanonicalOpsBoardIdByNameFromPool).mockResolvedValue(null);

    const result = await processTrialRecoveryLifecycleBatch();

    expect(result.status).toBe('board_not_found');
    expect(promoteLifecycleCard).not.toHaveBeenCalled();
  });

  it('records column_not_found from promotion engine without throwing', async () => {
    setupBoardAndCards([mockRecoveryCard(COL_TRIAL_EXPIRED, 'Trial expirado')], daysAgo(2));
    vi.mocked(promoteLifecycleCard).mockResolvedValue({
      status: 'column_not_found',
      cardId: CARD_ID,
      toBoard: TRIAL_RECOVERY_BOARD_NAME,
      toColumn: 'Dia 1',
    });

    const result = await processTrialRecoveryLifecycleBatch();

    expect(result.eligible).toBe(1);
    expect(result.promoted).toBe(0);
    expect(result.attempts[0]?.result.status).toBe('column_not_found');
  });

  it('records promotion_disabled without moving card', async () => {
    setupBoardAndCards([mockRecoveryCard(COL_TRIAL_EXPIRED, 'Trial expirado')], daysAgo(3));
    vi.mocked(promoteLifecycleCard).mockResolvedValue({
      status: 'promotion_disabled',
      cardId: CARD_ID,
      toBoard: TRIAL_RECOVERY_BOARD_NAME,
      toColumn: 'Dia 1',
    });

    const result = await processTrialRecoveryLifecycleBatch();

    expect(result.promoted).toBe(0);
    expect(result.attempts[0]?.result.status).toBe('promotion_disabled');
  });
});
