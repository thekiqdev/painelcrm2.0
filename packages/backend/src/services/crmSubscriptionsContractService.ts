/**
 * Sprint S2.1 — contrato da assinatura CRM (valor, periodicidade, descrição, vigência).
 * Não altera faturas pagas; sincroniza itens recorrentes em faturas abertas e metadata para renovações futuras.
 */
import { pool } from '../utils/db.js';
import {
  getSubscriptionById,
  type BillingInterval,
  type SubscriptionRow,
} from './billingSubscriptionService.js';
import { calculateNextBillingDate } from './subscriptionService.js';
import {
  getCustomerInvoiceItems,
  type CustomerInvoiceItemRow,
} from './customerInvoiceService.js';
import {
  cancelPendingRenewalJobsForSubscription,
} from './customerInvoiceRecurrenceNextBillingService.js';
import {
  tryEnqueueRenewalJobForSubscriptionId,
  type TryEnqueueRenewalJobForSubscriptionResult,
} from './recurringBillingJobService.js';
import {
  distributeAmountAcrossRecurringItems,
  mapSubscriptionIntervalToItemInterval,
  parseCrmContractMetadata,
  parseCrmPendingContractMetadata,
  type CrmContractMetadata,
  type CrmPendingContractMetadata,
} from './crmSubscriptionContractRenewalOverlay.js';
import { subscriptionChangeEventsHasChangeTypeColumn } from './subscriptionChangeEventsRepository.js';

export type CrmContractEffectiveAt = 'immediate' | 'next_cycle';

export interface PatchCrmSubscriptionContractInput {
  tenantId: string;
  subscriptionId: string;
  amount_cents: number;
  billing_interval: BillingInterval;
  description: string;
  effective_at: CrmContractEffectiveAt;
  reason?: string | null;
  actorUserId?: string | null;
}

export interface PatchCrmSubscriptionContractResult {
  subscription: SubscriptionRow;
  change_event_id: string;
  effective_at: CrmContractEffectiveAt;
  pending: boolean;
  cancelled_pending_jobs: number;
  enqueue_after_patch:
    | TryEnqueueRenewalJobForSubscriptionResult
    | { ok: false; reason: 'internal_enqueue_error'; error: string }
    | { ok: false; reason: 'deferred_next_cycle' }
    | null;
  dates_recalculated: boolean;
  open_invoices_synced: number;
}

export interface CrmSubscriptionContractDates {
  next_billing_date: string;
  current_period_end: string;
  billing_anchor_day: number;
}

const BILLING_INTERVALS = new Set<BillingInterval>([
  'weekly',
  'monthly',
  'quarterly',
  'semi_annual',
  'yearly',
]);

const NON_PAID_INVOICE_STATUSES = ['pending', 'waiting_payment', 'processing', 'overdue', 'draft'];

function extractAnchorDayFromYmd(ymd: string): number {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
  return d.getUTCDate();
}

/**
 * Recalcula datas do ciclo quando a periodicidade muda (vigência imediata).
 * Mantém `current_period_start`; recalcula fim e próxima cobrança.
 */
export function computeCrmContractDatesAfterIntervalChange(params: {
  current_period_start: string | null;
  next_billing_date: string;
  billing_anchor_day: number | null;
  new_billing_interval: BillingInterval;
}): CrmSubscriptionContractDates {
  const periodStart =
    (params.current_period_start?.slice(0, 10) || params.next_billing_date.slice(0, 10)).trim();
  const anchor = params.billing_anchor_day ?? extractAnchorDayFromYmd(periodStart);
  const periodEnd = calculateNextBillingDate(periodStart, params.new_billing_interval, anchor);
  const nextBilling = periodEnd;
  return {
    next_billing_date: nextBilling,
    current_period_end: periodEnd,
    billing_anchor_day: extractAnchorDayFromYmd(nextBilling),
  };
}

function mergeMetadata(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base = existing != null && typeof existing === 'object' && !Array.isArray(existing)
    ? { ...(existing as Record<string, unknown>) }
    : {};
  return { ...base, ...patch };
}

async function findLastPaidSubscriptionInvoice(
  tenantId: string,
  subscriptionId: string
): Promise<{ id: string } | null> {
  const r = await pool.query<{ id: string }>(
    `SELECT id::text
     FROM customer_invoices
     WHERE tenant_id = $1 AND subscription_id = $2
       AND status = 'paid'
       AND invoice_type IS DISTINCT FROM 'child'
     ORDER BY COALESCE(period_start, due_date::date) DESC NULLS LAST, paid_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [tenantId, subscriptionId]
  );
  return r.rows[0] ?? null;
}

async function listOpenSubscriptionInvoices(
  tenantId: string,
  subscriptionId: string
): Promise<Array<{ id: string }>> {
  const r = await pool.query<{ id: string }>(
    `SELECT id::text
     FROM customer_invoices
     WHERE tenant_id = $1 AND subscription_id = $2
       AND status = ANY($3::text[])
       AND invoice_type IS DISTINCT FROM 'child'`,
    [tenantId, subscriptionId, NON_PAID_INVOICE_STATUSES]
  );
  return r.rows;
}

function buildRecurringItemUpdates(
  items: CustomerInvoiceItemRow[],
  contract: Pick<CrmContractMetadata, 'amount_cents' | 'billing_interval' | 'description'>
): Array<{ id: string; description: string; unit_price_cents: number; total_cents: number; recurring_interval: string | null }> {
  const recurring = items.filter((it) => it.is_recurring);
  if (recurring.length === 0) return [];

  const distributed = distributeAmountAcrossRecurringItems(recurring, contract.amount_cents);
  const itemInterval = mapSubscriptionIntervalToItemInterval(contract.billing_interval);
  return distributed.map((it) => ({
    id: it.id,
    description: contract.description,
    unit_price_cents: it.unit_price_cents,
    total_cents: it.total_cents,
    recurring_interval: itemInterval,
  }));
}

async function applyRecurringItemUpdatesOnInvoice(
  tenantId: string,
  invoiceId: string,
  contract: Pick<CrmContractMetadata, 'amount_cents' | 'billing_interval' | 'description'>
): Promise<boolean> {
  const items = await getCustomerInvoiceItems(invoiceId, tenantId);
  const updates = buildRecurringItemUpdates(items, contract);
  if (updates.length === 0) return false;

  let invoiceTotal = 0;
  for (const it of items) {
    const upd = updates.find((u) => u.id === it.id);
    invoiceTotal += upd ? upd.total_cents : Math.max(0, it.total_cents);
  }

  for (const u of updates) {
    await pool.query(
      `UPDATE customer_invoice_items
       SET description = $2,
           unit_price_cents = $3,
           total_cents = $4,
           recurring_interval = $5
       WHERE id = $1`,
      [u.id, u.description, u.unit_price_cents, u.total_cents, u.recurring_interval]
    );
  }

  await pool.query(
    `UPDATE customer_invoices
     SET amount_cents = $2,
         description = COALESCE(NULLIF(TRIM($3), ''), description),
         updated_at = now()
     WHERE id = $1 AND tenant_id = $4`,
    [invoiceId, invoiceTotal, contract.description, tenantId]
  );
  return true;
}

async function syncOpenInvoicesWithContract(
  tenantId: string,
  subscriptionId: string,
  contract: Pick<CrmContractMetadata, 'amount_cents' | 'billing_interval' | 'description'>
): Promise<number> {
  const open = await listOpenSubscriptionInvoices(tenantId, subscriptionId);
  let synced = 0;
  for (const inv of open) {
    const ok = await applyRecurringItemUpdatesOnInvoice(tenantId, inv.id, contract);
    if (ok) synced += 1;
  }
  return synced;
}

async function readSubscriptionMetadata(subscriptionId: string): Promise<unknown> {
  const r = await pool.query<{ metadata: unknown }>(
    `SELECT metadata FROM subscriptions WHERE id = $1 LIMIT 1`,
    [subscriptionId]
  );
  return r.rows[0]?.metadata ?? null;
}

async function cancelOtherPendingChangeEvents(
  tenantId: string,
  subscriptionId: string,
  exceptId?: string
): Promise<void> {
  await pool.query(
    `UPDATE subscription_change_events
     SET status = 'cancelled'
     WHERE tenant_id = $1 AND subscription_id = $2 AND status = 'pending'
       AND ($3::uuid IS NULL OR id <> $3)`,
    [tenantId, subscriptionId, exceptId ?? null]
  );
}

async function insertChangeEvent(params: {
  tenantId: string;
  subscriptionId: string;
  effective_at: CrmContractEffectiveAt;
  status: 'pending' | 'applied';
  amount_cents: number;
  billing_interval: BillingInterval;
  description: string;
  reason?: string | null;
  previous_amount_cents: number;
  previous_billing_interval: string;
  previous_description: string | null;
  actorUserId?: string | null;
}): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO subscription_change_events (
       tenant_id, subscription_id, effective_at, status,
       amount_cents, billing_interval, description, reason,
       previous_amount_cents, previous_billing_interval, previous_description,
       created_by, applied_at
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6, $7, $8,
       $9, $10, $11,
       $12, CASE WHEN $4 = 'applied' THEN now() ELSE NULL END
     )
     RETURNING id::text`,
    [
      params.tenantId,
      params.subscriptionId,
      params.effective_at,
      params.status,
      params.amount_cents,
      params.billing_interval,
      params.description,
      params.reason ?? null,
      params.previous_amount_cents,
      params.previous_billing_interval,
      params.previous_description,
      params.actorUserId ?? null,
    ]
  );
  return r.rows[0]!.id;
}

function resolvePreviousDescription(sub: SubscriptionRow, metadata: unknown): string | null {
  const contract = parseCrmContractMetadata(metadata);
  if (contract?.description) return contract.description;
  return null;
}

async function applyContractToSubscriptionImmediate(params: {
  tenantId: string;
  subscription: SubscriptionRow;
  contract: CrmContractMetadata;
  intervalChanged: boolean;
}): Promise<{ dates_recalculated: boolean }> {
  const { subscription, contract, intervalChanged } = params;
  const metadata = await readSubscriptionMetadata(subscription.id);
  const nextMetadata = mergeMetadata(metadata, {
    crm_contract: {
      ...contract,
      updated_at: new Date().toISOString(),
    },
    pending_crm_contract: null,
  });

  let dates_recalculated = false;
  if (intervalChanged) {
    const dates = computeCrmContractDatesAfterIntervalChange({
      current_period_start: subscription.current_period_start,
      next_billing_date: subscription.next_billing_date,
      billing_anchor_day: subscription.billing_anchor_day,
      new_billing_interval: contract.billing_interval,
    });
    dates_recalculated = true;
    await pool.query(
      `UPDATE subscriptions
       SET amount_cents = $2,
           billing_interval = $3,
           next_billing_date = $4::date,
           current_period_end = $5::date,
           billing_anchor_day = $6,
           metadata = $7::jsonb,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $8`,
      [
        subscription.id,
        contract.amount_cents,
        contract.billing_interval,
        dates.next_billing_date,
        dates.current_period_end,
        dates.billing_anchor_day,
        JSON.stringify(nextMetadata),
        params.tenantId,
      ]
    );
  } else {
    await pool.query(
      `UPDATE subscriptions
       SET amount_cents = $2,
           billing_interval = $3,
           metadata = $4::jsonb,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $5`,
      [
        subscription.id,
        contract.amount_cents,
        contract.billing_interval,
        JSON.stringify(nextMetadata),
        params.tenantId,
      ]
    );
  }

  return { dates_recalculated };
}

export async function applyPendingCrmSubscriptionContractIfDue(
  subscriptionId: string
): Promise<boolean> {
  const sub = await getSubscriptionById(subscriptionId);
  if (!sub || sub.type !== 'customer' || sub.status !== 'active') return false;

  const metadata = await readSubscriptionMetadata(subscriptionId);
  const pending = parseCrmPendingContractMetadata(metadata);
  if (!pending) return false;

  const cycleYmd = sub.next_billing_date?.slice(0, 10);
  if (!cycleYmd) return false;

  const todayR = await pool.query<{ today: string }>(`SELECT CURRENT_DATE::text AS today`);
  const today = todayR.rows[0]?.today ?? '';
  if (today < cycleYmd) return false;

  const contract: CrmContractMetadata = {
    amount_cents: pending.amount_cents,
    billing_interval: pending.billing_interval,
    description: pending.description,
  };
  const intervalChanged = pending.billing_interval !== sub.billing_interval;

  await applyContractToSubscriptionImmediate({
    tenantId: sub.tenant_id,
    subscription: sub,
    contract,
    intervalChanged,
  });
  await syncOpenInvoicesWithContract(sub.tenant_id, sub.id, contract);

  await pool.query(
    `UPDATE subscription_change_events
     SET status = 'applied', applied_at = now()
     WHERE tenant_id = $1 AND subscription_id = $2 AND status = 'pending'`,
    [sub.tenant_id, sub.id]
  );

  return true;
}

export async function patchCrmSubscriptionContract(
  input: PatchCrmSubscriptionContractInput
): Promise<PatchCrmSubscriptionContractResult> {
  const amountCents = Math.round(Number(input.amount_cents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error('amount_cents deve ser um inteiro positivo');
  }
  const description = String(input.description ?? '').trim();
  if (!description) {
    throw new Error('description é obrigatória');
  }
  if (!BILLING_INTERVALS.has(input.billing_interval)) {
    throw new Error('billing_interval inválido');
  }

  const sub = await getSubscriptionById(input.subscriptionId);
  if (!sub || sub.tenant_id !== input.tenantId || sub.type !== 'customer') {
    throw new Error('Assinatura não encontrada');
  }
  if (sub.status === 'cancelled') {
    throw new Error('Assinatura cancelada não pode ser editada');
  }
  if (sub.status !== 'active' && sub.status !== 'paused') {
    throw new Error('Assinatura não está ativa');
  }

  const metadata = await readSubscriptionMetadata(sub.id);
  const previousDescription = resolvePreviousDescription(sub, metadata);
  const lastPaid = await findLastPaidSubscriptionInvoice(input.tenantId, sub.id);
  if (!lastPaid) {
    throw new Error('Nenhuma fatura paga encontrada para sincronizar o contrato desta assinatura');
  }

  const contract: CrmContractMetadata = {
    amount_cents: amountCents,
    billing_interval: input.billing_interval,
    description,
  };

  const intervalChanged = input.billing_interval !== sub.billing_interval;
  let dates_recalculated = false;
  let open_invoices_synced = 0;
  let pending = false;

  if (input.effective_at === 'next_cycle') {
    pending = true;
    const pendingMeta: CrmPendingContractMetadata = {
      ...contract,
      effective_at: 'next_cycle',
      reason: input.reason ?? null,
      requested_at: new Date().toISOString(),
    };
    const nextMetadata = mergeMetadata(metadata, { pending_crm_contract: pendingMeta });
    await pool.query(
      `UPDATE subscriptions SET metadata = $2::jsonb, updated_at = now() WHERE id = $1`,
      [sub.id, JSON.stringify(nextMetadata)]
    );
    await cancelOtherPendingChangeEvents(input.tenantId, sub.id);
    const changeEventId = await insertChangeEvent({
      tenantId: input.tenantId,
      subscriptionId: sub.id,
      effective_at: 'next_cycle',
      status: 'pending',
      amount_cents: amountCents,
      billing_interval: input.billing_interval,
      description,
      reason: input.reason,
      previous_amount_cents: sub.amount_cents,
      previous_billing_interval: sub.billing_interval,
      previous_description: previousDescription,
      actorUserId: input.actorUserId,
    });

    const updated = await getSubscriptionById(sub.id);
    if (!updated) throw new Error('Assinatura não encontrada após gravação');

    return {
      subscription: updated,
      change_event_id: changeEventId,
      effective_at: 'next_cycle',
      pending: true,
      cancelled_pending_jobs: 0,
      enqueue_after_patch: { ok: false, reason: 'deferred_next_cycle' },
      dates_recalculated: false,
      open_invoices_synced: 0,
    };
  }

  const changeEventId = await insertChangeEvent({
    tenantId: input.tenantId,
    subscriptionId: sub.id,
    effective_at: 'immediate',
    status: 'applied',
    amount_cents: amountCents,
    billing_interval: input.billing_interval,
    description,
    reason: input.reason,
    previous_amount_cents: sub.amount_cents,
    previous_billing_interval: sub.billing_interval,
    previous_description: previousDescription,
    actorUserId: input.actorUserId,
  });
  await cancelOtherPendingChangeEvents(input.tenantId, sub.id, changeEventId);

  const applyResult = await applyContractToSubscriptionImmediate({
    tenantId: input.tenantId,
    subscription: sub,
    contract,
    intervalChanged,
  });
  dates_recalculated = applyResult.dates_recalculated;
  open_invoices_synced = await syncOpenInvoicesWithContract(input.tenantId, sub.id, contract);

  let cancelled_pending_jobs = 0;
  let enqueue_after_patch: PatchCrmSubscriptionContractResult['enqueue_after_patch'] = null;

  if (intervalChanged || dates_recalculated) {
    cancelled_pending_jobs = await cancelPendingRenewalJobsForSubscription(sub.id, {
      detail: {
        reason: 'crm_subscription_contract_interval_or_dates_changed',
        subscription_id: sub.id,
        change_event_id: changeEventId,
      },
    });
    try {
      enqueue_after_patch = await tryEnqueueRenewalJobForSubscriptionId(sub.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      enqueue_after_patch = { ok: false, reason: 'internal_enqueue_error', error: msg };
    }
  }

  const updated = await getSubscriptionById(sub.id);
  if (!updated) throw new Error('Assinatura não encontrada após atualização');

  return {
    subscription: updated,
    change_event_id: changeEventId,
    effective_at: 'immediate',
    pending: false,
    cancelled_pending_jobs,
    enqueue_after_patch,
    dates_recalculated,
    open_invoices_synced,
  };
}

export type { CrmPendingContractMetadata } from './crmSubscriptionContractRenewalOverlay.js';

export async function getPendingCrmSubscriptionContract(
  subscriptionId: string
): Promise<CrmPendingContractMetadata | null> {
  const metadata = await readSubscriptionMetadata(subscriptionId);
  return parseCrmPendingContractMetadata(metadata);
}

export type CrmContractChangeType =
  | 'upgrade'
  | 'downgrade'
  | 'interval_change'
  | 'description_change'
  | 'contract_update';

export type CrmLifecycleChangeType = 'pause' | 'resume' | 'reactivate';

export type CrmSubscriptionHistoryChangeType = CrmContractChangeType | CrmLifecycleChangeType;

export function isLifecycleHistoryChangeType(
  type: string
): type is CrmLifecycleChangeType {
  return type === 'pause' || type === 'resume' || type === 'reactivate';
}

export interface CrmContractHistoryPayload {
  amount_cents: number;
  billing_interval: string;
  description: string;
}

export interface CrmSubscriptionContractHistoryRow {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  change_type: CrmSubscriptionHistoryChangeType;
  effective_at: CrmContractEffectiveAt | null;
  reason: string | null;
  status: 'pending' | 'applied' | 'cancelled';
  previous_payload: CrmContractHistoryPayload | null;
  new_payload: CrmContractHistoryPayload | null;
  next_billing_date?: string | null;
}

/** Classifica alteração para exibição (upgrade/downgrade/etc.). */
export function classifyCrmContractChangeType(params: {
  previous_amount_cents: number | null;
  previous_billing_interval: string | null;
  previous_description: string | null;
  amount_cents: number;
  billing_interval: string;
  description: string;
}): CrmContractChangeType {
  const prevAmount = params.previous_amount_cents;
  if (prevAmount != null && params.amount_cents > prevAmount) return 'upgrade';
  if (prevAmount != null && params.amount_cents < prevAmount) return 'downgrade';
  if (
    params.previous_billing_interval &&
    params.previous_billing_interval !== params.billing_interval
  ) {
    return 'interval_change';
  }
  if (
    params.previous_description &&
    params.previous_description.trim() !== params.description.trim()
  ) {
    return 'description_change';
  }
  return 'contract_update';
}

function buildHistoryPayload(
  amount_cents: number | null | undefined,
  billing_interval: string | null | undefined,
  description: string | null | undefined
): CrmContractHistoryPayload | null {
  if (amount_cents == null || !billing_interval || !description?.trim()) return null;
  return {
    amount_cents: Math.round(amount_cents),
    billing_interval: String(billing_interval),
    description: description.trim(),
  };
}

export async function getCrmSubscriptionContractHistory(
  tenantId: string,
  subscriptionId: string
): Promise<CrmSubscriptionContractHistoryRow[] | null> {
  const sub = await getSubscriptionById(subscriptionId);
  if (!sub || sub.tenant_id !== tenantId || sub.type !== 'customer') {
    return null;
  }

  try {
    const hasChangeType = await subscriptionChangeEventsHasChangeTypeColumn();
    const r = await pool.query<{
      id: string;
      created_at: string;
      created_by: string | null;
      actor_name: string | null;
      change_type: string | null;
      effective_at: CrmContractEffectiveAt | null;
      status: 'pending' | 'applied' | 'cancelled';
      amount_cents: number | null;
      billing_interval: string | null;
      description: string | null;
      reason: string | null;
      previous_amount_cents: number | null;
      previous_billing_interval: string | null;
      previous_description: string | null;
      next_billing_date: string | null;
    }>(
      `SELECT e.id::text,
              e.created_at::text,
              e.created_by::text,
              NULLIF(TRIM(
                COALESCE(
                  NULLIF(TRIM(COALESCE(pr.first_name, '') || ' ' || COALESCE(pr.last_name, '')), ''),
                  NULLIF(TRIM(u.email), '')
                )
              ), '') AS actor_name,
              ${hasChangeType ? 'e.change_type::text' : 'NULL::text'} AS change_type,
              e.effective_at::text,
              e.status::text,
              e.amount_cents,
              e.billing_interval::text,
              e.description,
              e.reason,
              e.previous_amount_cents,
              e.previous_billing_interval::text,
              e.previous_description,
              ${hasChangeType ? 'e.next_billing_date::text' : 'NULL::text'} AS next_billing_date
       FROM subscription_change_events e
       LEFT JOIN users u ON u.id = e.created_by
       LEFT JOIN profiles pr ON pr.id = u.id
       WHERE e.tenant_id = $1 AND e.subscription_id = $2
       ORDER BY e.created_at DESC`,
      [tenantId, subscriptionId]
    );

    return r.rows
      .map((row): CrmSubscriptionContractHistoryRow | null => {
        const changeTypeRaw = row.change_type;
        if (changeTypeRaw && isLifecycleHistoryChangeType(changeTypeRaw)) {
          return {
            id: row.id,
            created_at: row.created_at,
            actor_user_id: row.created_by,
            actor_name: row.actor_name,
            change_type: changeTypeRaw,
            effective_at: null,
            reason: row.reason,
            status: row.status,
            previous_payload: null,
            new_payload: null,
            next_billing_date: row.next_billing_date,
          };
        }

        const new_payload = buildHistoryPayload(row.amount_cents, row.billing_interval, row.description);
        if (!new_payload) {
          return null;
        }
        const previous_payload = buildHistoryPayload(
          row.previous_amount_cents,
          row.previous_billing_interval,
          row.previous_description
        );
        return {
          id: row.id,
          created_at: row.created_at,
          actor_user_id: row.created_by,
          actor_name: row.actor_name,
          change_type:
            changeTypeRaw && !isLifecycleHistoryChangeType(changeTypeRaw)
              ? (changeTypeRaw as CrmContractChangeType)
              : classifyCrmContractChangeType({
                  previous_amount_cents: row.previous_amount_cents,
                  previous_billing_interval: row.previous_billing_interval,
                  previous_description: row.previous_description,
                  amount_cents: row.amount_cents ?? 0,
                  billing_interval: row.billing_interval ?? 'monthly',
                  description: row.description ?? '',
                }),
          effective_at: row.effective_at ?? 'immediate',
          reason: row.reason,
          status: row.status,
          previous_payload,
          new_payload,
        };
      })
      .filter((row): row is CrmSubscriptionContractHistoryRow => row !== null);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/subscription_change_events/.test(msg)) {
      return [];
    }
    throw e;
  }
}
