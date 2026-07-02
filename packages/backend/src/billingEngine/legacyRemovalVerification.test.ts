import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REMOVED_FILES = [
  'services/billingRenewalEngine/executeCustomerRenewal.ts',
  'services/crmRenewalCustomerResolver.ts',
  'services/crmSubscriptionContractRenewalOverlay.ts',
  'billingPlanItems/factory.ts',
];

const REMOVED_DIRS = ['billingEngineV2', 'billingPersistence'];

const PROHIBITED_SYMBOLS = [
  'executeCustomerRenewal',
  'crmRenewalCustomerResolver',
  'resolveCrmRenewalPreviousInvoice',
  'overlayCrmContractOnRenewalItems',
  'buildBillingItemsFromInvoice',
  'legacy_invoice_copy',
  'virtual_from_invoice_template',
  'BillingEngineV2',
  'billingEngineV2/',
  'BillingPersistenceOrchestrator',
  'billingPersistence/',
  'BILLING_PLAN_V2',
  'billing_plan_v2',
  'BILLING_ENGINE_V2',
  'WORKER_ENGINE_V2',
  'PersistenceOrchestrator',
];

const PRODUCTION_SCAN_EXCLUDES = [
  'legacyRemovalVerification.test.ts',
  'deprecatedBillingStrategies.ts',
  'internal-tools/billing-migration',
  'orchestratorLogger.ts',
];

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...walkTsFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('Sprint 3.2 — legacy removal verification', () => {
  for (const file of REMOVED_FILES) {
    it(`arquivo removido: ${file}`, () => {
      expect(existsSync(path.join(srcRoot, file))).toBe(false);
    });
  }

  for (const dir of REMOVED_DIRS) {
    it(`diretório removido: ${dir}`, () => {
      expect(existsSync(path.join(srcRoot, dir))).toBe(false);
    });
  }

  it('billingEngine/ existe', () => {
    expect(existsSync(path.join(srcRoot, 'billingEngine', 'billingEngine.ts'))).toBe(true);
  });

  it('billingExecution/ existe', () => {
    expect(existsSync(path.join(srcRoot, 'billingExecution', 'billingExecutionOrchestrator.ts'))).toBe(true);
  });

  const scanFiles = walkTsFiles(srcRoot).filter((f) => {
    const norm = f.replace(/\\/g, '/');
    return (
      !norm.endsWith('.test.ts') &&
      !PRODUCTION_SCAN_EXCLUDES.some((ex) => norm.includes(ex))
    );
  });

  for (const sym of PROHIBITED_SYMBOLS) {
    it(`nenhuma referência a ${sym}`, () => {
      const hits = scanFiles.filter((f) => readFileSync(f, 'utf8').includes(sym));
      expect(hits).toEqual([]);
    });
  }
});

describe('Sprint 3.2B — housekeeping verification', () => {
  it('internal-tools/billing-migration existe', () => {
    expect(existsSync(path.join(srcRoot, 'internal-tools', 'billing-migration', 'README.md'))).toBe(true);
  });

  it('billingPlanProvider removido', () => {
    expect(existsSync(path.join(srcRoot, 'billingPlan', 'billingPlanProvider.ts'))).toBe(false);
  });
});

describe('Sprint 3.2 — namespace consolidation', () => {
  it('BillingEngine exportado', async () => {
    const mod = await import('../billingEngine/billingEngine.js');
    expect(mod.BillingEngine).toBeDefined();
    expect(mod.getBillingEngineVersion).toBeDefined();
  });

  it('BillingExecutionOrchestrator exportado', async () => {
    const mod = await import('../billingExecution/billingExecutionOrchestrator.js');
    expect(mod.BillingExecutionOrchestrator).toBeDefined();
  });
});
