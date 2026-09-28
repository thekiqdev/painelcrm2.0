import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  runShadowCertification,
  classifyDivergenceSummary,
  type ShadowCertificationReport,
} from '@/lib/billingShadow';
import { GOLDEN_SCENARIOS } from '../golden-dataset';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPORT_JSON = path.resolve(MODULE_DIR, 'reports/shadow-certification-report.json');

describe('Billing Shadow Certification (5.0-21A)', () => {
  it('certifica todos os cenários Golden e gera relatório', () => {
    const report = runShadowCertification(
      GOLDEN_SCENARIOS.map((s) => ({
        id: s.id,
        build: () => s.build(),
        todayYmd: s.todayYmd,
      }))
    );

    expect(report.sprint).toBe('5.0-21A');
    expect(report.scenarioCount).toBe(GOLDEN_SCENARIOS.length);
    expect(report.metrics.overallParityPercent).toBeGreaterThanOrEqual(0);
    expect(report.metrics.overallParityPercent).toBeLessThanOrEqual(100);
    expect(report.divergenceMatrix.length).toBeGreaterThanOrEqual(0);

    // Persistência do laudo objetivo (não mascara divergências).
    fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
    fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    const summary = classifyDivergenceSummary(report.divergenceMatrix);
    expect(Object.values(summary).reduce((a, b) => a + b, 0)).toBe(
      report.divergenceMatrix.length
    );

    // Certificação não exige 100% — apenas que o laudo seja completo.
    expect(report.cutoverRecommendation).toMatch(
      /^(NOT_READY|READY_WITH_CORRECTIONS|READY)$/
    );
  });

  it('cada superfície obrigatória é avaliada em cada cenário', () => {
    const report = runShadowCertification(
      GOLDEN_SCENARIOS.slice(0, 3).map((s) => ({
        id: s.id,
        build: () => s.build(),
        todayYmd: s.todayYmd,
      }))
    );
    const required: Array<keyof ShadowCertificationReport['metrics']> = [
      'historyParityPercent',
      'calendarParityPercent',
      'sidebarParityPercent',
      'nextInvoiceParityPercent',
      'alertsParityPercent',
      'capabilitiesParityPercent',
      'eventsParityPercent',
      'overallParityPercent',
      'legacyExecutionMs',
      'aggregateExecutionMs',
    ];
    for (const key of required) {
      expect(report.metrics[key]).toBeTypeOf('number');
    }
    for (const scenario of report.scenarios) {
      const surfaces = scenario.surfaces.map((s) => s.surface).sort();
      expect(surfaces).toEqual(
        [
          'alerts',
          'calendar',
          'capabilities',
          'cycles',
          'events',
          'history',
          'nextInvoice',
          'sidebar',
          'subscription',
        ].sort()
      );
    }
  });
});
