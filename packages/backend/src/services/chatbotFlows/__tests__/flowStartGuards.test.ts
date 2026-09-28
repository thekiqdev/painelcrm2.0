import { describe, expect, it } from 'vitest';
import {
  isCooldownActive,
  isInstanceAllowed,
  isWithinScheduleWindow,
  parseStartGuardConfig,
  sortFlowMatchCandidates,
} from '../flowStartGuards.js';

describe('parseStartGuardConfig', () => {
  it('defaults', () => {
    expect(parseStartGuardConfig(undefined)).toMatchObject({
      cooldownMinutes: 0,
      scheduleEnabled: false,
      priority: 0,
      instanceIds: [],
      scheduleStartHm: null,
      scheduleEndHm: null,
    });
  });

  it('parses fields', () => {
    const c = parseStartGuardConfig({
      cooldown_minutes: 30,
      schedule_enabled: true,
      schedule_start: '09:00',
      schedule_end: '18:00',
      instance_ids: ['aaa', 'bbb'],
      priority: 10,
    });
    expect(c.cooldownMinutes).toBe(30);
    expect(c.scheduleEnabled).toBe(true);
    expect(c.scheduleStartHm).toBe('09:00');
    expect(c.scheduleEndHm).toBe('18:00');
    expect(c.instanceIds).toEqual(['aaa', 'bbb']);
    expect(c.priority).toBe(10);
  });
});

describe('isWithinScheduleWindow', () => {
  it('blocks outside window', () => {
    // 20:00 UTC = 17:00 America/Sao_Paulo (UTC-3) in standard? Actually BRT is UTC-3 year-round.
    // Use fixed: now at 20:00 in America/Sao_Paulo → outside 09–18
    const ok = isWithinScheduleWindow({
      now: new Date('2026-03-16T23:00:00.000Z'), // 20:00 BRT
      timeZone: 'America/Sao_Paulo',
      startHm: '09:00',
      endHm: '18:00',
    });
    expect(ok).toBe(false);
  });

  it('allows inside window', () => {
    const ok = isWithinScheduleWindow({
      now: new Date('2026-03-16T15:00:00.000Z'), // 12:00 BRT
      timeZone: 'America/Sao_Paulo',
      startHm: '09:00',
      endHm: '18:00',
    });
    expect(ok).toBe(true);
  });
});

describe('isInstanceAllowed', () => {
  it('empty list allows all', () => {
    expect(isInstanceAllowed([], 'any')).toBe(true);
  });

  it('blocks when instance not in list', () => {
    expect(isInstanceAllowed(['allowed-1'], 'other')).toBe(false);
  });

  it('allows when instance in list', () => {
    expect(isInstanceAllowed(['allowed-1'], 'allowed-1')).toBe(true);
  });
});

describe('isCooldownActive', () => {
  it('blocks within cooldown', () => {
    expect(
      isCooldownActive({
        cooldownMinutes: 30,
        lastEndedAt: new Date('2026-03-16T14:50:00Z'),
        now: new Date('2026-03-16T15:00:00Z'),
      })
    ).toBe(true);
  });

  it('inactive after cooldown elapsed', () => {
    expect(
      isCooldownActive({
        cooldownMinutes: 30,
        lastEndedAt: new Date('2026-03-16T14:00:00Z'),
        now: new Date('2026-03-16T15:00:00Z'),
      })
    ).toBe(false);
  });

  it('inactive when cooldown 0', () => {
    expect(
      isCooldownActive({
        cooldownMinutes: 0,
        lastEndedAt: new Date(),
        now: new Date(),
      })
    ).toBe(false);
  });
});

describe('sortFlowMatchCandidates', () => {
  it('higher priority first, then newer published_at', () => {
    const sorted = sortFlowMatchCandidates([
      {
        flowId: 'a',
        versionId: 'v1',
        priority: 1,
        publishedAt: '2026-01-01T00:00:00Z',
        reason: 'keyword',
      },
      {
        flowId: 'b',
        versionId: 'v2',
        priority: 5,
        publishedAt: '2026-01-01T00:00:00Z',
        reason: 'keyword',
      },
      {
        flowId: 'c',
        versionId: 'v3',
        priority: 5,
        publishedAt: '2026-06-01T00:00:00Z',
        reason: 'first_message',
      },
    ]);
    expect(sorted.map((s) => s.flowId)).toEqual(['c', 'b', 'a']);
  });
});
