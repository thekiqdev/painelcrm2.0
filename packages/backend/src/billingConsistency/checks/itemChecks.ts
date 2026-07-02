/**
 * Billing Engine V2 — Sprint 2.3B: validações dos Billing Items.
 */
import { BillingItemDefinitionHasher } from '../../billingPlanItems/definitionHasher.js';
import type { BillingPlanItemRow } from '../../billingPlanItems/types.js';
import type { ConsistencyCheckResult } from '../types.js';

const VALID_ITEM_STATUS = new Set(['draft', 'active', 'paused', 'cancelled', 'archived']);
const VALID_INTERVALS = new Set([
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'semi_annual',
  'yearly',
]);

function check(
  code: string,
  passed: boolean,
  severity: ConsistencyCheckResult['severity'],
  message: string,
  extra?: Partial<ConsistencyCheckResult>
): ConsistencyCheckResult {
  return { code, phase: 'items', passed, severity, message, ...extra };
}

export function validateBillingItems(items: BillingPlanItemRow[]): ConsistencyCheckResult[] {
  const results: ConsistencyCheckResult[] = [];

  if (items.length === 0) {
    results.push(
      check('items_present', false, 'WARNING', 'Nenhum billing item no plano', { field: 'items' })
    );
    return results;
  }

  results.push(check('items_present', true, 'INFO', `${items.length} item(s) encontrado(s)`));

  const bySequence = new Map<number, BillingPlanItemRow[]>();
  for (const item of items) {
    const list = bySequence.get(item.sequence) ?? [];
    list.push(item);
    bySequence.set(item.sequence, list);
  }

  const sequences = [...bySequence.keys()].sort((a, b) => a - b);
  for (let i = 0; i < sequences.length; i++) {
    const expected = i + 1;
    if (sequences[i] !== expected) {
      results.push(
        check(
          'sequence_continuous',
          false,
          'ERROR',
          `Gap na sequence: esperado ${expected}, encontrado ${sequences[i]}`,
          { field: 'sequence', expected, actual: sequences[i] }
        )
      );
      break;
    }
  }
  if (results.every((r) => r.code !== 'sequence_continuous' || r.passed)) {
    results.push(check('sequence_continuous', true, 'INFO', 'Sequence contínua'));
  }

  for (const [sequence, revisions] of bySequence) {
    const revNums = revisions.map((r) => r.item_revision).sort((a, b) => a - b);
    const uniqueRevs = new Set(revNums);
    results.push(
      check(
        `item_revision_unique_seq_${sequence}`,
        uniqueRevs.size === revNums.length,
        uniqueRevs.size !== revNums.length ? 'CRITICAL' : 'INFO',
        `Sem duplicidade de revision na sequence ${sequence}`,
        { field: 'item_revision', actual: revNums }
      )
    );

    for (let i = 1; i < revNums.length; i++) {
      if (revNums[i] <= revNums[i - 1]) {
        results.push(
          check(
            `item_revision_monotonic_seq_${sequence}`,
            false,
            'ERROR',
            `Revision não crescente na sequence ${sequence}`,
            { field: 'item_revision', actual: revNums }
          )
        );
        break;
      }
    }
  }

  for (const item of items) {
    const prefix = `item_${item.sequence}_r${item.item_revision}`;

    results.push(
      check(
        `${prefix}_status_valid`,
        VALID_ITEM_STATUS.has(item.status),
        'ERROR',
        'Status do item válido',
        { field: 'status', actual: item.status }
      ),
      check(
        `${prefix}_quantity`,
        item.quantity >= 0,
        'ERROR',
        'quantity >= 0',
        { field: 'quantity', actual: item.quantity }
      ),
      check(
        `${prefix}_unit_price`,
        item.unit_price >= 0,
        'ERROR',
        'unit_price >= 0',
        { field: 'unit_price', actual: item.unit_price }
      ),
      check(
        `${prefix}_total_amount`,
        item.total_amount >= 0,
        'ERROR',
        'total_amount >= 0',
        { field: 'total_amount', actual: item.total_amount }
      ),
      check(
        `${prefix}_frequency`,
        item.billing_frequency >= 1,
        'ERROR',
        'billing_frequency >= 1',
        { field: 'billing_frequency', actual: item.billing_frequency }
      ),
      check(
        `${prefix}_currency`,
        Boolean(item.currency?.trim()),
        'ERROR',
        'currency obrigatória',
        { field: 'currency', actual: item.currency }
      ),
      check(
        `${prefix}_effective_from`,
        Boolean(item.effective_from?.trim()),
        'ERROR',
        'effective_from obrigatório',
        { field: 'effective_from', actual: item.effective_from }
      ),
      check(
        `${prefix}_effective_until`,
        !item.effective_until || item.effective_until >= item.effective_from,
        'WARNING',
        'effective_until >= effective_from',
        { field: 'effective_until', actual: item.effective_until }
      ),
      check(
        `${prefix}_definition_hash`,
        Boolean(item.definition_hash?.trim()),
        'WARNING',
        'definition_hash presente',
        { field: 'definition_hash', actual: item.definition_hash || null }
      )
    );

    if (item.definition_hash?.trim()) {
      const expected = BillingItemDefinitionHasher.hashFromRow(item);
      results.push(
        check(
          `${prefix}_hash_match`,
          item.definition_hash === expected,
          item.definition_hash === expected ? 'INFO' : 'ERROR',
          'definition_hash corresponde à definição',
          { field: 'definition_hash', expected, actual: item.definition_hash }
        )
      );
    }

    if (item.billing_interval) {
      results.push(
        check(
          `${prefix}_interval_valid`,
          VALID_INTERVALS.has(item.billing_interval),
          'WARNING',
          'billing_interval reconhecido',
          { field: 'billing_interval', actual: item.billing_interval }
        )
      );
    }

    if (item.status === 'active') {
      results.push(
        check(`${prefix}_active`, true, 'INFO', 'Item ativo presente', { field: 'status' })
      );
    }
  }

  return results;
}
