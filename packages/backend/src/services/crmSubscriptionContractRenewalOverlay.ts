/**
 * Overlay de contrato CRM na cópia de itens recorrentes do worker (sem alterar faturas pagas).
 * Lê `subscriptions.metadata.crm_contract` gravado por `patchCrmSubscriptionContract`.
 */
import type { BillingInterval } from './billingSubscriptionService.js';

export interface CrmContractMetadata {
  amount_cents: number;
  billing_interval: BillingInterval;
  description: string;
  updated_at?: string;
}

export interface CrmPendingContractMetadata extends CrmContractMetadata {
  effective_at: 'next_cycle';
  reason?: string | null;
  requested_at: string;
}

export type RenewalItemOverlay = {
  description: string;
  unit_price_cents: number;
  discount_cents: number;
  total_cents: number;
  quantity: number;
  recurring_interval?: string | null;
  is_recurring?: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

export function parseCrmContractMetadata(metadata: unknown): CrmContractMetadata | null {
  if (!isRecord(metadata)) return null;
  const raw = metadata.crm_contract;
  if (!isRecord(raw)) return null;
  const amount_cents = Number(raw.amount_cents);
  const billing_interval = String(raw.billing_interval ?? '').trim();
  const description = String(raw.description ?? '').trim();
  if (!Number.isFinite(amount_cents) || amount_cents <= 0) return null;
  if (!description) return null;
  const allowed = new Set(['weekly', 'monthly', 'quarterly', 'semi_annual', 'yearly']);
  if (!allowed.has(billing_interval)) return null;
  return {
    amount_cents: Math.round(amount_cents),
    billing_interval: billing_interval as BillingInterval,
    description,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
  };
}

export function parseCrmPendingContractMetadata(metadata: unknown): CrmPendingContractMetadata | null {
  if (!isRecord(metadata)) return null;
  const raw = metadata.pending_crm_contract;
  if (!isRecord(raw)) return null;
  const amount_cents = Number(raw.amount_cents);
  const billing_interval = String(raw.billing_interval ?? '').trim();
  const description = String(raw.description ?? '').trim();
  const requested_at = String(raw.requested_at ?? '').trim();
  if (!Number.isFinite(amount_cents) || amount_cents <= 0) return null;
  if (!description || !requested_at) return null;
  const allowed = new Set(['weekly', 'monthly', 'quarterly', 'semi_annual', 'yearly']);
  if (!allowed.has(billing_interval)) return null;
  return {
    amount_cents: Math.round(amount_cents),
    billing_interval: billing_interval as BillingInterval,
    description,
    effective_at: 'next_cycle',
    reason: typeof raw.reason === 'string' ? raw.reason : null,
    requested_at,
  };
}

/** Distribui `targetAmountCents` entre linhas recorrentes proporcionalmente ao total atual. */
export function distributeAmountAcrossRecurringItems<T extends RenewalItemOverlay>(
  items: T[],
  targetAmountCents: number
): T[] {
  if (items.length === 0) return items;
  const target = Math.max(1, Math.round(targetAmountCents));
  if (items.length === 1) {
    const it = items[0]!;
    const qty = Math.max(1, Number(it.quantity) || 1);
    const discount = Math.max(0, Math.round(Number(it.discount_cents) || 0));
    const total = target;
    const unit = Math.max(1, Math.round((total + discount) / qty));
    return [{ ...it, total_cents: total, unit_price_cents: unit }];
  }

  const oldTotal = items.reduce((s, it) => s + Math.max(0, Math.round(it.total_cents)), 0);
  let remaining = target;
  const out: T[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const qty = Math.max(1, Number(it.quantity) || 1);
    const discount = Math.max(0, Math.round(Number(it.discount_cents) || 0));
    let total: number;
    if (i === items.length - 1) {
      total = remaining;
    } else if (oldTotal > 0) {
      total = Math.max(1, Math.round((Math.max(0, it.total_cents) / oldTotal) * target));
      remaining -= total;
    } else {
      total = Math.max(1, Math.round(target / items.length));
      remaining -= total;
    }
    const unit = Math.max(1, Math.round((total + discount) / qty));
    out.push({ ...it, total_cents: total, unit_price_cents: unit });
  }
  return out;
}

/**
 * Aplica contrato ativo aos itens que serão inseridos na próxima fatura de renovação.
 */
export function overlayCrmContractOnRenewalItems(
  metadata: unknown,
  items: RenewalItemOverlay[]
): RenewalItemOverlay[] {
  if (items.length === 0) return items;
  const contract = parseCrmContractMetadata(metadata);
  if (!contract) return items;

  const withAmount = distributeAmountAcrossRecurringItems(items, contract.amount_cents);
  return withAmount.map((it) => ({
    ...it,
    description: contract.description,
    recurring_interval: contract.billing_interval,
  }));
}

export function mapSubscriptionIntervalToItemInterval(interval: BillingInterval): string {
  return interval;
}
