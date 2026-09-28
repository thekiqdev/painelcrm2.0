import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  BILLING_PLATFORM_VERSION,
  getBillingPlatformManifest,
  BILLING_PLATFORM_EVENT_TYPES,
  publishBillingPlatformEvent,
  resetBillingEventBusForTests,
  subscribeBillingPlatformEvent,
  BILLING_ANALYTICS_METRICS,
  buildAnalyticsSnapshotFoundation,
  BILLING_FORECAST_HORIZONS,
  buildForecastModelFoundation,
  BILLING_RECOVERY_CAPABILITIES,
  describeRecoveryArchitectureFoundation,
  BILLING_REPORT_TYPES,
  listReportContracts,
  BILLING_AUTOMATION_REFERENCE_WORKFLOW,
} from './index.js';

const platformRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

const REQUIRED_DIRS = [
  'analytics',
  'intelligence',
  'forecasting',
  'recovery',
  'automation',
  'reports',
  'api',
  'events',
  'shared',
  'types',
  'provisioning',
  'audit',
];

describe('Billing Platform 4.0 — foundation', () => {
  it('BILLING_PLATFORM_VERSION', () => {
    expect(BILLING_PLATFORM_VERSION).toBe('v4_platform_foundation');
  });

  for (const dir of REQUIRED_DIRS) {
    it(`diretório ${dir}/ existe`, () => {
      expect(existsSync(path.join(platformRoot, dir))).toBe(true);
    });
  }

  it('manifest lista engine GA e módulos foundation', () => {
    const manifest = getBillingPlatformManifest();
    expect(manifest.version).toBe('v4_platform_foundation');
    expect(manifest.engine_version).toContain('v3');
    expect(manifest.modules.find((m) => m.id === 'engine')?.status).toBe('ga');
    expect(manifest.modules.find((m) => m.id === 'analytics')?.status).toBe('foundation');
  });

  it('event bus publica eventos definidos', () => {
    resetBillingEventBusForTests();
    const received: string[] = [];
    const unsub = subscribeBillingPlatformEvent('InvoiceGenerated', (e) => {
      received.push(e.type);
    });
    publishBillingPlatformEvent({
      type: 'InvoiceGenerated',
      payload: {
        tenant_id: 't1',
        occurred_at: new Date().toISOString(),
      },
    });
    unsub();
    expect(received).toEqual(['InvoiceGenerated']);
    expect(BILLING_PLATFORM_EVENT_TYPES).toHaveLength(8);
  });

  it('analytics contracts — métricas foundation', () => {
    const snap = buildAnalyticsSnapshotFoundation('tenant-1');
    expect(snap.metrics).toHaveLength(BILLING_ANALYTICS_METRICS.length);
    expect(snap.status).toBe('foundation');
  });

  it('forecast horizons', () => {
    const model = buildForecastModelFoundation('tenant-1');
    expect(model.points.map((p) => p.horizon)).toEqual([...BILLING_FORECAST_HORIZONS]);
  });

  it('recovery architecture', () => {
    const arch = describeRecoveryArchitectureFoundation('tenant-1');
    expect(arch.capabilities).toHaveLength(BILLING_RECOVERY_CAPABILITIES.length);
    expect(arch.capabilities.every((c) => c.enabled === false)).toBe(true);
  });

  it('report contracts', () => {
    const reports = listReportContracts();
    expect(reports).toHaveLength(BILLING_REPORT_TYPES.length);
    expect(reports.every((r) => r.status === 'contract_only')).toBe(true);
  });

  it('automation reference workflow', () => {
    expect(BILLING_AUTOMATION_REFERENCE_WORKFLOW.steps.length).toBeGreaterThan(0);
    expect(BILLING_AUTOMATION_REFERENCE_WORKFLOW.status).toBe('draft');
  });

  it('não importa billing engine execution paths', async () => {
    const mod = await import('./platformManifest.js');
    const src = JSON.stringify(mod);
    expect(src.includes('BillingExecutionOrchestrator')).toBe(false);
  });
});
