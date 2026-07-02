import { describe, it, expect } from 'vitest';
import { BillingEngine } from '../../../billingEngine/billingEngine.js';
import { buildScenarioContextForDef } from '../billingCertificationLab/billingScenarioFactory.js';
import { getGoldenScenarioById } from '../billingCertificationLab/billingGoldenDataset.js';
import { BillingProductionCertificationEngine, certifyPipelinePair } from './billingProductionCertificationEngine.js';
import { compareOperationalSnapshots, aggregateGateScores } from './pipelineComparer.js';
import {
  PIPELINE_CERTIFICATION_SCENARIOS,
  getAllPipelineScenarioPairs,
  getPipelineScenarioPair,
} from './pipelineCertificationScenarios.js';
import {
  snapshotFromLegacyCapture,
  snapshotFromV2Capture,
  invoiceSnapshotFromDraft,
  itemsSnapshotFromEngineItems,
  gatewaySnapshotFromOutcome,
  renewalResultFieldsForParity,
} from './pipelineSnapshotNormalizer.js';
import type { PipelineOperationalSnapshot } from './types.js';

describe('BillingProductionCertificationEngine', () => {
  it('executa certificação completa com APPROVED', () => {
    const report = BillingProductionCertificationEngine.runFullCertification();
    expect(report.recommendation).toBe('APPROVED');
    expect(report.approved).toBe(true);
    expect(report.overall_score).toBe(100);
    expect(report.invoice_score).toBe(100);
    expect(report.invoice_items_score).toBe(100);
    expect(report.gateway_score).toBe(100);
    expect(report.notification_score).toBe(100);
    expect(report.timeline_score).toBe(100);
    expect(report.history_score).toBe(100);
    expect(report.subscription_score).toBe(100);
    expect(report.billing_result_score).toBe(100);
    expect(report.idempotency_score).toBe(100);
    expect(report.rollback_score).toBe(100);
    expect(report.blocking_issues).toHaveLength(0);
    expect(report.scenarios).toHaveLength(PIPELINE_CERTIFICATION_SCENARIOS.length);
  });

  for (const scenario of PIPELINE_CERTIFICATION_SCENARIOS) {
    it(`cenário ${scenario.id} — paridade 100%`, () => {
      const pair = getPipelineScenarioPair(scenario.id);
      const result = certifyPipelinePair(pair);
      expect(result.approved).toBe(true);
      expect(result.overall_score).toBe(100);
      expect(result.differences.filter((d) => d.blocking)).toHaveLength(0);
    });
  }
});

describe('pipelineComparer — detecção de divergência', () => {
  function baseSnapshot(overrides: Partial<PipelineOperationalSnapshot> = {}): PipelineOperationalSnapshot {
    const pair = getPipelineScenarioPair('simple_renewal');
    const legacy = snapshotFromLegacyCapture(pair.legacy);
    const v2 = snapshotFromV2Capture(pair.v2);
    return { ...legacy, ...overrides };
  }

  it('detecta divergência em invoice amount_cents', () => {
    const legacy = baseSnapshot();
    const v2 = { ...baseSnapshot(), invoice: legacy.invoice ? { ...legacy.invoice, amount_cents: 1 } : null };
    const result = compareOperationalSnapshots(legacy, v2);
    expect(result.approved).toBe(false);
    expect(result.invoice_score ?? result.gates.find((g) => g.dimension === 'invoice')?.score).toBe(0);
  });

  it('detecta divergência em gateway failed', () => {
    const legacy = baseSnapshot();
    const v2 = {
      ...baseSnapshot(),
      gateway: legacy.gateway ? { ...legacy.gateway, failed: true } : null,
    };
    const result = compareOperationalSnapshots(legacy, v2);
    expect(result.approved).toBe(false);
  });

  it('detecta divergência em idempotency', () => {
    const pair = getPipelineScenarioPair('idempotency');
    const legacy = snapshotFromLegacyCapture(pair.legacy);
    const v2 = {
      ...snapshotFromV2Capture(pair.v2),
      idempotency: { reused_existing: false, engine_skipped: false },
    };
    const result = compareOperationalSnapshots(legacy, v2);
    expect(result.gates.find((g) => g.dimension === 'idempotency')?.passed).toBe(false);
  });

  it('detecta divergência em rollback', () => {
    const pair = getPipelineScenarioPair('rollback');
    const legacy = snapshotFromLegacyCapture(pair.legacy);
    const v2 = {
      ...snapshotFromV2Capture(pair.v2),
      rollback: { triggered: false, invoice_deleted: false },
    };
    const result = compareOperationalSnapshots(legacy, v2);
    expect(result.gates.find((g) => g.dimension === 'rollback')?.passed).toBe(false);
  });

  it('aggregateGateScores calcula média correta', () => {
    const pairs = getAllPipelineScenarioPairs().map((p) => certifyPipelinePair(p));
    const scores = aggregateGateScores(pairs);
    expect(scores.overall_score).toBe(100);
  });
});

describe('pipelineSnapshotNormalizer', () => {
  it('invoiceSnapshotFromDraft preserva campos financeiros', () => {
    const pair = getPipelineScenarioPair('discount');
    const draft = pair.v2.stage.engine!.invoice;
    const snap = invoiceSnapshotFromDraft(draft);
    expect(snap.amount_cents).toBe(9900);
    expect(snap.period_start).toBe('2026-06-01');
  });

  it('itemsSnapshotFromEngineItems mapeia sequência', () => {
    const items = pairItems();
    const snap = itemsSnapshotFromEngineItems(items);
    expect(snap[0]?.sequence).toBe(1);
    expect(snap[0]?.total_cents).toBe(9900);
  });

  it('gatewaySnapshotFromOutcome usa prefixo idempotency V1-compatível', () => {
    const gw = gatewaySnapshotFromOutcome({
      amount_cents: 9900,
      due_date: '2026-06-01',
      payment_method: 'boleto',
      subscription_id: 'sub-1',
      period_start: '2026-06-01',
      status: 'PENDING',
      failed: false,
    });
    expect(gw.idempotency_key_prefix).toBe('customer_renew_sub-1_2026-06-01');
  });

  it('renewalResultFieldsForParity inclui campos Worker', () => {
    const pair = getPipelineScenarioPair('billing_result_parity');
    const fields = renewalResultFieldsForParity(pair.legacy.renewal);
    expect(fields).toHaveLength(8);
    expect(fields[0]).toBe('true');
  });
});

describe('BillingEngine — alinhamento engine com snapshot operacional', () => {
  it('engine aprovado produz invoice draft compatível com cenário mensal', () => {
    const scenario = getGoldenScenarioById('recurrence_monthly')!;
    const context = buildScenarioContextForDef(scenario);
    const result = BillingEngine.execute({ context });
    expect(result.approved).toBe(true);
    const snap = invoiceSnapshotFromDraft(result.invoice);
    expect(snap.amount_cents).toBeGreaterThan(0);
    expect(snap.currency).toBe('BRL');
    expect(itemsSnapshotFromEngineItems(result.items).length).toBeGreaterThan(0);
  });

  it('engine com desconto preserva discounts_cents no draft', () => {
    const scenario = getGoldenScenarioById('discount_percent')!;
    const context = buildScenarioContextForDef(scenario);
    const result = BillingEngine.execute({ context });
    expect(result.approved).toBe(true);
    expect(result.invoice.discounts_cents).toBeGreaterThanOrEqual(0);
  });

  it('engine trial pode zerar amount quando aplicável', () => {
    const scenario = getGoldenScenarioById('trial')!;
    const context = buildScenarioContextForDef(scenario);
    const result = BillingEngine.execute({ context });
    expect(result.approved).toBe(true);
  });
});

describe('cenários operacionais específicos', () => {
  it('gateway recusado mantém renewal success em ambos', () => {
    const pair = getPipelineScenarioPair('gateway_refused');
    const result = certifyPipelinePair(pair);
    expect(result.approved).toBe(true);
    expect(pair.legacy.renewal.success).toBe(true);
    expect(pair.v2.stage.renewal.success).toBe(true);
  });

  it('notification failure parity', () => {
    const result = certifyPipelinePair(getPipelineScenarioPair('notification_failure'));
    expect(result.approved).toBe(true);
  });

  it('timeline failure parity', () => {
    const result = certifyPipelinePair(getPipelineScenarioPair('timeline_failure'));
    expect(result.approved).toBe(true);
  });

  it('history failure parity', () => {
    const result = certifyPipelinePair(getPipelineScenarioPair('history_failure'));
    expect(result.approved).toBe(true);
  });

  it('idempotency engine_skipped no V2', () => {
    const pair = getPipelineScenarioPair('idempotency');
    const v2 = snapshotFromV2Capture(pair.v2);
    expect(v2.idempotency.engine_skipped).toBe(true);
    expect(pair.v2.stage.engine).toBeNull();
  });

  it('subscription advance alinha datas pós-ciclo', () => {
    const pair = getPipelineScenarioPair('subscription_advance');
    const result = certifyPipelinePair(pair);
    expect(result.approved).toBe(true);
    expect(pair.legacy.subscription?.next_billing_date).toBe('2026-08-01');
  });
});

function pairItems() {
  return getPipelineScenarioPair('simple_renewal').v2.stage.engine!.items;
}
