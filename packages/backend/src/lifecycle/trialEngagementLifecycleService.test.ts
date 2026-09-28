import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../utils/db.js';
import { findCanonicalOpsBoardIdByNameFromPool } from '../services/superadminOpsKanbanFoundation.js';
import { hasKanbanAcquisitionLeadColumn } from '../services/superadminOpsKanbanLeadService.js';
import { promoteLifecycleCard } from './lifecyclePromotionService.js';
import {
  daysSinceTimestamp,
  processTrialEngagementLifecycleBatch,
  resolveTrialEngagementEventType,
  TRIAL_ENGAGEMENT_BOARD_NAME,
} from './trialEngagementLifecycleService.js';

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
const COL_STARTED = 'col-started';
const COL_DAY2 = 'col-day2';
const COL_DAY4 = 'col-day4';
const COL_DAY6 = 'col-day6';
const LEAD_ID = 'l0000000-0000-4000-8000-000000000001';
const TENANT_ID = 't0000000-0000-4000-8000-000000000001';

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

function mockEngagementCard(columnId: string, columnName: string) {
  return {
    card_id: CARD_ID,
    column_id: columnId,
    column_name: columnName,
    acquisition_lead_id: LEAD_ID,
    tenant_id: TENANT_ID,
  };
}

function setupBoardAndCards(
  cards: ReturnType<typeof mockEngagementCard>[],
  entryAt: Date | null,
) {
  vi.mocked(findCanonicalOpsBoardIdByNameFromPool).mockResolvedValue(BOARD_ID);
  vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
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
    if (s.includes("event_type = 'trial.engagement.started'")) {
      if (entryAt) {
        return { rows: [{ created_at: entryAt }], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    }
    return { rows: [], rowCount: 0 } as never;
  });
}

describe('trialEngagementLifecycleService helpers', () => {
  it('resolveTrialEngagementEventType respects wait windows', () => {
    expect(resolveTrialEngagementEventType('Trial iniciado', 1)).toBeNull();
    expect(resolveTrialEngagementEventType('Trial iniciado', 2)).toBe('trial.engagement.day2');
    expect(resolveTrialEngagementEventType('Dia 2', 1)).toBeNull();
    expect(resolveTrialEngagementEventType('Dia 2', 2)).toBe('trial.engagement.day4');
    expect(resolveTrialEngagementEventType('Dia 4', 1)).toBeNull();
    expect(resolveTrialEngagementEventType('Dia 4', 2)).toBe('trial.engagement.day6');
    expect(resolveTrialEngagementEventType('Dia 6', 0)).toBeNull();
    expect(resolveTrialEngagementEventType('Dia 6', 1)).toBe('trial.engagement.finalizing');
  });

  it('daysSinceTimestamp floors full days', () => {
    const entered = new Date('2026-01-01T12:00:00.000Z');
    const now = new Date('2026-01-03T11:59:59.000Z');
    expect(daysSinceTimestamp(entered, now)).toBe(1);
    expect(daysSinceTimestamp(entered, new Date('2026-01-03T12:00:00.000Z'))).toBe(2);
  });
});

describe('processTrialEngagementLifecycleBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasKanbanAcquisitionLeadColumn).mockResolvedValue(true);
    vi.mocked(promoteLifecycleCard).mockResolvedValue({
      status: 'moved',
      cardId: CARD_ID,
      fromBoard: TRIAL_ENGAGEMENT_BOARD_NAME,
      toBoard: TRIAL_ENGAGEMENT_BOARD_NAME,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('promotes Trial iniciado to Dia 2 after 2 days', async () => {
    setupBoardAndCards([mockEngagementCard(COL_STARTED, 'Trial iniciado')], daysAgo(2));

    const result = await processTrialEngagementLifecycleBatch();

    expect(result.promoted).toBe(1);
    expect(promoteLifecycleCard).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'trial.engagement.day2',
        source: 'trial_engagement_lifecycle',
        correlationId: `trial-engagement:${CARD_ID}:trial.engagement.day2`,
        context: { acquisitionLeadId: LEAD_ID, tenantId: TENANT_ID },
      }),
    );
  });

  it('promotes Dia 2 to Dia 4 after 2 days', async () => {
    setupBoardAndCards([mockEngagementCard(COL_DAY2, 'Dia 2')], daysAgo(2));

    await processTrialEngagementLifecycleBatch();

    expect(promoteLifecycleCard).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'trial.engagement.day4' }),
    );
  });

  it('promotes Dia 4 to Dia 6 after 2 days', async () => {
    setupBoardAndCards([mockEngagementCard(COL_DAY4, 'Dia 4')], daysAgo(2));

    await processTrialEngagementLifecycleBatch();

    expect(promoteLifecycleCard).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'trial.engagement.day6' }),
    );
  });

  it('promotes Dia 6 to Trial finalizando after 1 day', async () => {
    setupBoardAndCards([mockEngagementCard(COL_DAY6, 'Dia 6')], daysAgo(1));

    await processTrialEngagementLifecycleBatch();

    expect(promoteLifecycleCard).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'trial.engagement.finalizing' }),
    );
  });

  it('is idempotent when wait window not met', async () => {
    setupBoardAndCards([mockEngagementCard(COL_STARTED, 'Trial iniciado')], daysAgo(1));

    const result = await processTrialEngagementLifecycleBatch();

    expect(result.eligible).toBe(0);
    expect(result.promoted).toBe(0);
    expect(promoteLifecycleCard).not.toHaveBeenCalled();
  });

  it('skips when no cards exist', async () => {
    vi.mocked(findCanonicalOpsBoardIdByNameFromPool).mockResolvedValue(BOARD_ID);
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

    const result = await processTrialEngagementLifecycleBatch();

    expect(result.scanned).toBe(0);
    expect(promoteLifecycleCard).not.toHaveBeenCalled();
  });

  it('returns board_not_found when Engajamento Trial board is missing', async () => {
    vi.mocked(findCanonicalOpsBoardIdByNameFromPool).mockResolvedValue(null);

    const result = await processTrialEngagementLifecycleBatch();

    expect(result.status).toBe('board_not_found');
    expect(promoteLifecycleCard).not.toHaveBeenCalled();
  });

  it('records column_not_found from promotion engine without throwing', async () => {
    setupBoardAndCards([mockEngagementCard(COL_STARTED, 'Trial iniciado')], daysAgo(3));
    vi.mocked(promoteLifecycleCard).mockResolvedValue({
      status: 'column_not_found',
      cardId: CARD_ID,
      toBoard: TRIAL_ENGAGEMENT_BOARD_NAME,
      toColumn: 'Dia 2',
    });

    const result = await processTrialEngagementLifecycleBatch();

    expect(result.eligible).toBe(1);
    expect(result.promoted).toBe(0);
    expect(result.attempts[0]?.result.status).toBe('column_not_found');
  });

  it('records promotion_disabled without moving card', async () => {
    setupBoardAndCards([mockEngagementCard(COL_STARTED, 'Trial iniciado')], daysAgo(3));
    vi.mocked(promoteLifecycleCard).mockResolvedValue({
      status: 'promotion_disabled',
      cardId: CARD_ID,
      toBoard: TRIAL_ENGAGEMENT_BOARD_NAME,
      toColumn: 'Dia 2',
    });

    const result = await processTrialEngagementLifecycleBatch();

    expect(result.promoted).toBe(0);
    expect(result.attempts[0]?.result.status).toBe('promotion_disabled');
  });
});
