/**
 * Billing Engine V2 — Sprint 2.3B: snapshot vs invoice item (somente leitura).
 */
import { buildBillingItemSnapshot } from '../../billingPlanItemSnapshot/factory.js';
import type { BillingPlanItemRow } from '../../billingPlanItems/types.js';
import type { ConsistencyCheckResult } from '../types.js';

function check(
  code: string,
  passed: boolean,
  severity: ConsistencyCheckResult['severity'],
  message: string,
  extra?: Partial<ConsistencyCheckResult>
): ConsistencyCheckResult {
  return { code, phase: 'snapshot', passed, severity, message, ...extra };
}

export function validateSnapshotConsistency(
  items: BillingPlanItemRow[],
  invoiceItems: Array<{
    sort_order: number;
    description: string;
    quantity: number;
    unit_price_cents: number;
    total_cents: number;
  }> | undefined
): ConsistencyCheckResult[] {
  const results: ConsistencyCheckResult[] = [];

  if (!invoiceItems || invoiceItems.length === 0) {
    results.push(
      check('snapshot_invoice_items_optional', true, 'INFO', 'Sem invoice items para comparar snapshot')
    );
    return results;
  }

  const latestBySequence = new Map<number, BillingPlanItemRow>();
  for (const item of items) {
    const prev = latestBySequence.get(item.sequence);
    if (!prev || item.item_revision > prev.item_revision) {
      latestBySequence.set(item.sequence, item);
    }
  }

  for (const inv of invoiceItems) {
    const billingItem = latestBySequence.get(inv.sort_order);
    if (!billingItem) {
      results.push(
        check(
          `snapshot_missing_item_seq_${inv.sort_order}`,
          false,
          'WARNING',
          'Billing item ausente para linha de invoice',
          { field: 'sequence', actual: inv.sort_order }
        )
      );
      continue;
    }

    const snapshot = buildBillingItemSnapshot(billingItem);
    results.push(
      check(
        `snapshot_total_seq_${inv.sort_order}`,
        snapshot.definition.total_amount === inv.total_cents,
        snapshot.definition.total_amount === inv.total_cents ? 'INFO' : 'WARNING',
        'Snapshot total vs invoice item total',
        {
          field: 'total_amount',
          expected: inv.total_cents,
          actual: snapshot.definition.total_amount,
        }
      ),
      check(
        `snapshot_unit_price_seq_${inv.sort_order}`,
        snapshot.definition.unit_price === inv.unit_price_cents,
        snapshot.definition.unit_price === inv.unit_price_cents ? 'INFO' : 'WARNING',
        'Snapshot unit_price vs invoice item',
        {
          field: 'unit_price',
          expected: inv.unit_price_cents,
          actual: snapshot.definition.unit_price,
        }
      ),
      check(
        `snapshot_quantity_seq_${inv.sort_order}`,
        Number(snapshot.definition.quantity) === Number(inv.quantity),
        Number(snapshot.definition.quantity) === Number(inv.quantity) ? 'INFO' : 'WARNING',
        'Snapshot quantity vs invoice item',
        { field: 'quantity', expected: inv.quantity, actual: snapshot.definition.quantity }
      )
    );
  }

  return results;
}
