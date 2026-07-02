/**
 * Billing Engine V2 — Sprint 3.1A: performance profiler por estágio.
 */
import { logBillingObservability } from './observabilityLogger.js';
import type { BillingPerformanceProfile, BillingPerformanceStageTiming } from './types.js';

const recentProfiles: BillingPerformanceProfile[] = [];
const MAX_PROFILES = 100;

export type ActivePerformanceProfile = {
  correlation_id: string;
  subscription_id: string;
  job_id: string;
  started_at: number;
  stages: BillingPerformanceStageTiming[];
  markStage(stage: string, startedAtMs: number): void;
  complete(outcome: 'success' | 'failed'): BillingPerformanceProfile;
};

export function beginPerformanceProfile(params: {
  correlation_id: string;
  subscription_id: string;
  job_id: string;
}): ActivePerformanceProfile {
  const started_at = Date.now();
  const stages: BillingPerformanceStageTiming[] = [];

  return {
    correlation_id: params.correlation_id,
    subscription_id: params.subscription_id,
    job_id: params.job_id,
    started_at,
    stages,
    markStage(stage: string, startedAtMs: number) {
      stages.push({ stage, duration_ms: Date.now() - startedAtMs });
    },
    complete(outcome: 'success' | 'failed') {
      const profile: BillingPerformanceProfile = {
        correlation_id: params.correlation_id,
        subscription_id: params.subscription_id,
        job_id: params.job_id,
        total_duration_ms: Date.now() - started_at,
        stages,
        outcome,
        recorded_at: new Date().toISOString(),
      };
      recentProfiles.unshift(profile);
      if (recentProfiles.length > MAX_PROFILES) recentProfiles.pop();

      logBillingObservability('BILLING_PERFORMANCE', 'profile_complete', {
        correlation_id: params.correlation_id,
        total_duration_ms: profile.total_duration_ms,
        stage_count: stages.length,
        outcome,
      });

      return profile;
    },
  };
}

export function getRecentPerformanceProfiles(limit = 20): BillingPerformanceProfile[] {
  return recentProfiles.slice(0, limit);
}

export function getAverageStageDurations(): Record<string, number> {
  const sums: Record<string, { total: number; count: number }> = {};
  for (const profile of recentProfiles) {
    for (const stage of profile.stages) {
      if (!sums[stage.stage]) sums[stage.stage] = { total: 0, count: 0 };
      sums[stage.stage]!.total += stage.duration_ms;
      sums[stage.stage]!.count += 1;
    }
  }
  const out: Record<string, number> = {};
  for (const [stage, { total, count }] of Object.entries(sums)) {
    out[stage] = Math.round(total / count);
  }
  return out;
}

export function resetPerformanceProfilerForTests(): void {
  recentProfiles.length = 0;
}
