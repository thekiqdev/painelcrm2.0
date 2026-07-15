import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  getFloatingInvalidateCoalesceStats,
  resetFloatingInvalidateCoalesceStatsForTests,
  scheduleInvalidateFloatingChatAggregates,
} from './floatingChatQueries';
import { shouldFloatDumpAllMessages } from './floatingMessageLoadPolicy';
import {
  getChatPrimaryCacheLayer,
  shouldIndexedDbActAsSourceOfTruth,
} from '@/features/chat-core/runtime/cachePrecedence';
import {
  getDedicatedChatSocketOpenCounts,
  recordDedicatedChatSocketOpen,
  resetDedicatedChatSocketOpenCountsForTests,
} from '@/features/chat-core/realtime/dedicatedSocketTelemetry';

describe('Phase 5 floating invalidate coalesce (MB-020)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetFloatingInvalidateCoalesceStatsForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces multiple aggregate invalidates into one flush', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined as never);
    scheduleInvalidateFloatingChatAggregates(qc, 50);
    scheduleInvalidateFloatingChatAggregates(qc, 50);
    scheduleInvalidateFloatingChatAggregates(qc, 50);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    // 3 keys per flush
    expect(spy).toHaveBeenCalledTimes(3);
    expect(getFloatingInvalidateCoalesceStats().scheduled).toBe(3);
    expect(getFloatingInvalidateCoalesceStats().flushes).toBe(1);
  });
});

describe('Phase 5 cache precedence (MB-031)', () => {
  it('never treats IndexedDB as SoT', () => {
    expect(shouldIndexedDbActAsSourceOfTruth()).toBe(false);
    expect(['domain-store', 'react-query']).toContain(getChatPrimaryCacheLayer());
  });
});

describe('Phase 5 dedicated socket telemetry (MB-030)', () => {
  beforeEach(() => resetDedicatedChatSocketOpenCountsForTests());
  it('counts dedicated opens by surface', () => {
    recordDedicatedChatSocketOpen('ClientProfile');
    recordDedicatedChatSocketOpen('ClientProfile');
    expect(getDedicatedChatSocketOpenCounts().ClientProfile).toBe(2);
  });
});

describe('Phase 5 float dump policy (MB-019)', () => {
  it('defaults to latest-page (dump off)', () => {
    expect(shouldFloatDumpAllMessages()).toBe(false);
  });
});
