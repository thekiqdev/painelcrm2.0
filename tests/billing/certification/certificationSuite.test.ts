import { describe, it, expect } from 'vitest';
import { GOLDEN_SCENARIOS } from '../golden-dataset';
import { buildCertificationContext } from './captureVisualFixture';
import { loadSnapshot, saveSnapshot, UPDATE_BILLING_SNAPSHOTS } from './snapshotHelpers';

describe('Billing Certification Suite — Golden Dataset', () => {
  it.each(GOLDEN_SCENARIOS.map((s) => [s.id, s] as const))(
    '%s — visual fixture matches official snapshot',
    (id, scenario) => {
      const detail = scenario.build();
      const ctx = buildCertificationContext(id, detail, scenario.todayYmd);
      const captured = ctx.visual;

      if (UPDATE_BILLING_SNAPSHOTS) {
        saveSnapshot(id, captured);
        return;
      }

      const expected = loadSnapshot(id);
      expect(expected, `Missing snapshot for ${id}. Run: npm run test:billing:update-snapshots`).not.toBeNull();
      expect(captured).toEqual(expected);
    }
  );

  it.each(GOLDEN_SCENARIOS.filter((s) => s.assert).map((s) => [s.id, s] as const))(
    '%s — business assertions',
    (id, scenario) => {
      const detail = scenario.build();
      const ctx = buildCertificationContext(id, detail, scenario.todayYmd);
      scenario.assert!(ctx);
    }
  );
});

describe('Billing Certification Suite — UI invariants (all scenarios)', () => {
  for (const scenario of GOLDEN_SCENARIOS) {
    it(`${scenario.id} — history rows have stable shape`, () => {
      const ctx = buildCertificationContext(scenario.id, scenario.build(), scenario.todayYmd);
      for (const row of ctx.visual.history.rows) {
        expect(row.statusPt).toBeTruthy();
        if (row.canGenerateNow) {
          expect(row.cycleId).toBeTruthy();
          expect(row.invoiceId).toBeNull();
        }
      }
      expect(ctx.visual.history.rowCount).toBe(ctx.visual.history.rows.length);
    });

    it(`${scenario.id} — calendar events have ymd`, () => {
      const ctx = buildCertificationContext(scenario.id, scenario.build(), scenario.todayYmd);
      for (const ev of ctx.visual.calendar.events) {
        expect(ev.ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it(`${scenario.id} — next invoice is consistent with store`, () => {
      const ctx = buildCertificationContext(scenario.id, scenario.build(), scenario.todayYmd);
      const next = ctx.store.getNextChargePresentation();
      expect(ctx.visual.nextInvoice.dueYmd).toBe(next.dueYmd);
      expect(ctx.visual.nextInvoice.statusLabel).toBe(next.statusLabel);
    });
  }
});
