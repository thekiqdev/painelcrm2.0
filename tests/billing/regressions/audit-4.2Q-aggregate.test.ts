import { describe, it, expect } from 'vitest';
import { financialEventStoreSignature } from '@/lib/subscriptionFinancialEventStore';
import { buildGoldenDetail } from '../golden-dataset';
import { GOLDEN_SCENARIOS } from '../golden-dataset';

/**
 * Regressões permanentes — Sprint 4.2Q (Aggregate Certification).
 * Invariante: payload detail é a fonte única; cada cenário golden tem assinatura estável.
 */
describe('Regression 4.2Q — Aggregate certification', () => {
  it('cada cenário golden produz assinatura determinística do store', () => {
    for (const scenario of GOLDEN_SCENARIOS) {
      const detail = scenario.build();
      const sig1 = financialEventStoreSignature(detail);
      const sig2 = financialEventStoreSignature(scenario.build());
      expect(sig1).toBe(sig2);
    }
  });

  it('CrmSubscriptionDetailPayload mínimo golden contém campos obrigatórios do aggregate implícito', () => {
    const detail = buildGoldenDetail();
    expect(detail.subscription.id).toBeTruthy();
    expect(detail.timeline).toBeDefined();
    expect(detail.cycles_raw).toBeDefined();
    expect(detail.automation_summary).toBeDefined();
    expect(detail.tenant_billing).toBeDefined();
  });

  it('alteração de timeline altera assinatura (detecta regressão de merge)', () => {
    const base = buildGoldenDetail();
    const mutated = buildGoldenDetail({
      timeline: [
        ...base.timeline,
        {
          ...base.timeline[0],
          cycle_id: 'c-mutated',
          due_date: '2026-12-14',
        },
      ],
    });
    expect(financialEventStoreSignature(base)).not.toBe(financialEventStoreSignature(mutated));
  });
});
