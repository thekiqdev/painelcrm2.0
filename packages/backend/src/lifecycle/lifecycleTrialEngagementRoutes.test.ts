import { describe, expect, it } from 'vitest';
import { resolveLifecycleRoute } from './lifecycleRouter.js';
import { TRIAL_ENGAGEMENT_LIFECYCLE_EVENT_TYPES } from './lifecycleTypes.js';

const BOARD = 'Engajamento Trial';

describe('trial engagement lifecycle routes', () => {
  it.each([
    ['trial.engagement.started', 'Trial iniciado'],
    ['trial.engagement.day2', 'Dia 2'],
    ['trial.engagement.day4', 'Dia 4'],
    ['trial.engagement.day6', 'Dia 6'],
    ['trial.engagement.finalizing', 'Trial finalizando'],
  ] as const)('%s resolves to Engajamento Trial / %s', (eventType, columnName) => {
    const res = resolveLifecycleRoute(eventType, { tenantId: 'tenant-1' });

    expect(res.matched).toBe(true);
    expect(res.fallback).toBe(false);
    expect(res.eventType).toBe(eventType);
    expect(res.boardName).toBe(BOARD);
    expect(res.columnName).toBe(columnName);
    expect(res.validation.boardKnown).toBe(true);
    expect(res.validation.columnKnown).toBe(true);
    expect(res.reason).not.toContain('board_not_in_catalog');
    expect(res.reason).not.toContain('column_not_in_catalog');
  });

  it('covers all trial engagement event types', () => {
    expect(TRIAL_ENGAGEMENT_LIFECYCLE_EVENT_TYPES).toHaveLength(5);
    for (const eventType of TRIAL_ENGAGEMENT_LIFECYCLE_EVENT_TYPES) {
      const res = resolveLifecycleRoute(eventType);
      expect(res.boardName).toBe(BOARD);
      expect(res.matched).toBe(true);
    }
  });
});
