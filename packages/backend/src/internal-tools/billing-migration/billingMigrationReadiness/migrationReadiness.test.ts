import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeWeightedOverallScore,
  isAreaPerfect,
} from './migrationReadinessScore.js';
import {
  resolveApprovalLevel,
  resolveMigrationRecommendation,
  isReadyForMigration,
} from './migrationReadinessRecommendation.js';
import type { MigrationAreaScore, MigrationBlockingIssue } from './types.js';
import { MIGRATION_AREA_WEIGHTS } from './types.js';
import { resetMigrationMetricsForTests } from './migrationReadinessMetrics.js';

function perfectAreas(): MigrationAreaScore[] {
  return Object.entries(MIGRATION_AREA_WEIGHTS).map(([area, weight]) => ({
    area,
    weight,
    score: 100,
    passed: true,
  }));
}

describe('migrationReadinessScore', () => {
  it('computa score ponderado determinístico', () => {
    const areas: MigrationAreaScore[] = [
      { area: 'shadow', weight: 25, score: 100, passed: true },
      { area: 'projection', weight: 20, score: 80, passed: false },
      { area: 'consistency', weight: 20, score: 100, passed: true },
      { area: 'billing_plans', weight: 10, score: 100, passed: true },
      { area: 'billing_items', weight: 10, score: 100, passed: true },
      { area: 'jobs', weight: 5, score: 100, passed: true },
      { area: 'gateway', weight: 5, score: 100, passed: true },
      { area: 'notifications', weight: 5, score: 100, passed: true },
    ];
    expect(computeWeightedOverallScore(areas)).toBe(96);
  });

  it('isAreaPerfect exige 100', () => {
    expect(isAreaPerfect(100)).toBe(true);
    expect(isAreaPerfect(99)).toBe(false);
  });
});

describe('migrationReadinessRecommendation', () => {
  it('READY_TO_MIGRATE quando pronto', () => {
    const areas = perfectAreas();
    expect(
      resolveMigrationRecommendation({
        readyForMigration: true,
        areas,
        blockingIssues: [],
      })
    ).toBe('READY_TO_MIGRATE');
  });

  it('FIX_PROJECTION quando projection baixa', () => {
    const areas = perfectAreas().map((a) =>
      a.area === 'projection' ? { ...a, score: 50, passed: false } : a
    );
    expect(
      resolveMigrationRecommendation({
        readyForMigration: false,
        areas,
        blockingIssues: [],
      })
    ).toBe('FIX_PROJECTION');
  });

  it('FIX_CONSISTENCY quando consistency baixa', () => {
    const areas = perfectAreas().map((a) =>
      a.area === 'consistency' ? { ...a, score: 60, passed: false } : a
    );
    expect(
      resolveMigrationRecommendation({
        readyForMigration: false,
        areas,
        blockingIssues: [],
      })
    ).toBe('FIX_CONSISTENCY');
  });

  it('approval level READY sem warnings', () => {
    expect(
      resolveApprovalLevel({
        overallScore: 100,
        readyForMigration: true,
        warnings: [],
        criticalIssues: [],
        errors: [],
      })
    ).toBe('READY');
  });

  it('approval level READY_WITH_WARNINGS', () => {
    const warnings: MigrationBlockingIssue[] = [
      { code: 'W1', severity: 'WARNING', area: 'shadow', message: 'x' },
    ];
    expect(
      resolveApprovalLevel({
        overallScore: 100,
        readyForMigration: true,
        warnings,
        criticalIssues: [],
        errors: [],
      })
    ).toBe('READY_WITH_WARNINGS');
  });

  it('NOT_READY com CRITICAL', () => {
    const critical: MigrationBlockingIssue[] = [
      { code: 'C1', severity: 'CRITICAL', area: 'jobs', message: 'orphan' },
    ];
    expect(
      resolveApprovalLevel({
        overallScore: 40,
        readyForMigration: false,
        warnings: [],
        criticalIssues: critical,
        errors: [],
      })
    ).toBe('NOT_READY');
  });

  it('isReadyForMigration exige todas áreas 100 e sem ERROR/CRITICAL', () => {
    const areas = perfectAreas();
    expect(isReadyForMigration({ areas, blockingIssues: [] })).toBe(true);

    const withError: MigrationBlockingIssue[] = [
      { code: 'E1', severity: 'ERROR', area: 'shadow', message: 'fail' },
    ];
    expect(isReadyForMigration({ areas, blockingIssues: withError })).toBe(false);

    const lowShadow = areas.map((a) =>
      a.area === 'shadow' ? { ...a, score: 90, passed: false } : a
    );
    expect(isReadyForMigration({ areas: lowShadow, blockingIssues: [] })).toBe(false);
  });
});

vi.mock('../utils/db.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../../utils/db.js';
import { BillingMigrationReadinessEngine } from './billingMigrationReadinessEngine.js';

describe('BillingMigrationReadinessEngine', () => {
  beforeEach(() => {
    resetMigrationMetricsForTests();
    vi.mocked(pool.query).mockReset();
  });

  it('evaluateTenant agrega áreas e gera relatório', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('FROM tenants')) {
        return { rows: [{ company_name: 'Acme' }] };
      }
      if (sql.includes('billing_shadow_reports') && sql.includes('projection_engine')) {
        return {
          rows: [{ total: '2', success: '2', avg_score: '100', avg_duration: '5', hash_present: '2' }],
        };
      }
      if (sql.includes('billing_shadow_reports')) {
        return {
          rows: [
            {
              total: '2',
              approved: '2',
              avg_score: '100',
              min_score: '100',
              failed: '0',
              hash_mismatch: '0',
              consistency_failed: '0',
            },
          ],
        };
      }
      if (sql.includes('billing_consistency_reports')) {
        return {
          rows: [
            {
              total: '1',
              approved: '1',
              avg_confidence: '100',
              avg_score: '100',
              critical: '0',
              with_errors: '0',
            },
          ],
        };
      }
      if (sql.includes('billing_plans')) {
        return { rows: [{ total: '1', active: '1', invalid: '0', draft: '0' }] };
      }
      if (sql.includes('billing_plan_items')) {
        return { rows: [{ total: '2', active: '2', without_hash: '0', duplicates: '0' }] };
      }
      if (sql.includes('billing_recurring_jobs')) {
        return { rows: [{ pending: '0', failed: '0', processing: '0', stuck: '0', orphan: '0' }] };
      }
      if (sql.includes('customer_invoices')) {
        return { rows: [{ inconsistent: '0', total_active: '1' }] };
      }
      if (sql.includes('notification_outbound_deliveries')) {
        return { rows: [{ pending: '0', failed: '0' }] };
      }
      if (sql.includes('subscriptions') && sql.includes('count')) {
        return { rows: [{ total: '1' }] };
      }
      return { rows: [] };
    });

    const report = await BillingMigrationReadinessEngine.evaluateTenant('tenant-1');
    expect(report.tenantId).toBe('tenant-1');
    expect(report.tenantName).toBe('Acme');
    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.areaScores).toHaveLength(8);
    expect(report.migrationRecommendation).toBeDefined();
    expect(report.diagnostics.engine_version).toContain('migration_readiness');
  });
});
