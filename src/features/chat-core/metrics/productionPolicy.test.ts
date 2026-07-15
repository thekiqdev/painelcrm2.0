import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/chatMigrationFlagManager', () => ({
  isChatMigrationFlagEnabled: vi.fn(() => false),
}));

import { isChatMigrationFlagEnabled } from '@/lib/chatMigrationFlagManager';
import { isChatPerformanceTelemetryEnabled, getChatMetricsProductionConfig } from './productionPolicy';

describe('MB-025 chat metrics production policy', () => {
  const flag = isChatMigrationFlagEnabled as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    flag.mockReset();
    flag.mockReturnValue(false);
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CHAT_METRICS_PROD', '');
    vi.stubEnv('VITE_CHAT_METRICS_SAMPLE_RATE', '1');
    delete (globalThis as Record<string, unknown>).__chat_metrics_sample_v1;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stays off in production without env or flag', () => {
    expect(isChatPerformanceTelemetryEnabled()).toBe(false);
  });

  it('enables in production with VITE_CHAT_METRICS_PROD=1 and sample 1', () => {
    vi.stubEnv('VITE_CHAT_METRICS_PROD', '1');
    expect(isChatPerformanceTelemetryEnabled()).toBe(true);
    expect(getChatMetricsProductionConfig().prodEnv).toBe(true);
  });

  it('enables in production when catalog flag ON (sampled)', () => {
    flag.mockReturnValue(true);
    expect(isChatPerformanceTelemetryEnabled()).toBe(true);
  });
});
