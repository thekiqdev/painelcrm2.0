/**
 * Recebimentos automáticos de faturas CRM → conta financeira (idempotente).
 * Fonte única chamada quando customer_invoices passa a paid (via updateCustomerInvoiceStatus).
 */
import { pool } from '../utils/db.js';
import {
  normalizeGatewayKey,
  resolveFinancialAccountForGatewayIncome,
  type GatewayProviderKey,
} from './financialAccountGatewayLinkService.js';
import { createFinancialTransaction } from './financialTransactionsService.js';
import { getFinancialAccount } from './financialAccountsService.js';

const GATEWAY_LABEL: Record<string, string> = {
  asaas: 'Asaas',
  mercado_pago: 'Mercado Pago',
};

export type GatewayReceivableSyncReason =
  | 'skipped_invoice_not_found'
  | 'skipped_not_paid'
  | 'skipped_invalid_amount'
  | 'skipped_no_gateway'
  | 'skipped_no_linked_account'
  | 'skipped_existing_transaction'
  | 'created_transaction'
  | 'error';

export interface SyncCustomerInvoiceResult {
  ok: boolean;
  reason: GatewayReceivableSyncReason;
  invoice_id: string;
  tenant_id?: string;
  transaction_id?: string | null;
  detail?: string;
}

export interface SyncPaidInvoicesBatchResult {
  total_paid_invoices_found: number;
  eligible_count: number;
  eligible_amount_cents: number;
  created_count: number;
  created_amount_cents: number;
  skipped_existing_count: number;
  skipped_no_gateway_count: number;
  skipped_no_linked_account_count: number;
  skipped_other_count: number;
  errors: { invoice_id: string; message: string }[];
}

let invoiceColumnsCache: Promise<Set<string>> | null = null;

async function getCustomerInvoiceColumnNames(): Promise<Set<string>> {
  if (!invoiceColumnsCache) {
    invoiceColumnsCache = pool
      .query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'customer_invoices'`
      )
      .then((r) => new Set(r.rows.map((x) => x.column_name)));
  }
  return invoiceColumnsCache;
}

export interface InvoiceRowForSync {
  tenant_id: string;
  amount_cents: string;
  invoice_number: string | null;
  gateway: string | null;
  gateway_reference_id: string | null;
  asaas_payment_id: string | null;
  paid_at: string | null;
  client_id: string | null;
  status: string;
}

async function loadInvoiceForSync(invoiceId: string): Promise<InvoiceRowForSync | null> {
  const cols = await getCustomerInvoiceColumnNames();
  const hasLegacyAsaas = cols.has('asaas_payment_id');
  const sel = hasLegacyAsaas
    ? `tenant_id::text, amount_cents::text, invoice_number, gateway, gateway_reference_id,
       asaas_payment_id, paid_at::text, client_id::text, status`
    : `tenant_id::text, amount_cents::text, invoice_number, gateway, gateway_reference_id,
       NULL::text AS asaas_payment_id, paid_at::text, client_id::text, status`;
  const r = await pool.query<InvoiceRowForSync>(
    `SELECT ${sel} FROM customer_invoices WHERE id = $1::uuid LIMIT 1`,
    [invoiceId]
  );
  return r.rows[0] ?? null;
}

function isPaidStatus(raw: string | null | undefined): boolean {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  return s === 'paid' || s === 'pago';
}

function effectiveGatewayReferenceId(inv: InvoiceRowForSync, gatewayKey: GatewayProviderKey): string {
  const ref = inv.gateway_reference_id?.trim() ?? '';
  if (ref) return ref;
  if (gatewayKey === 'asaas' && inv.asaas_payment_id?.trim()) {
    return inv.asaas_payment_id.trim();
  }
  return '';
}

async function clientExistsForTenant(tenantId: string, clientId: string | null): Promise<boolean> {
  if (!clientId?.trim()) return false;
  // `clients` não tem `tenant_id`; o tenant vem de `users` (mesmo padrão que clientsController, dashboard, etc.)
  const r = await pool.query(
    `SELECT 1 FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2::uuid
     WHERE c.id = $1::uuid
     LIMIT 1`,
    [clientId, tenantId]
  );
  return (r.rowCount ?? 0) > 0;
}

async function resolveGatewayKeyForInvoice(
  tenantId: string,
  invoiceId: string,
  inv: InvoiceRowForSync
): Promise<GatewayProviderKey | null> {
  const first = normalizeGatewayKey(inv.gateway);
  if (first) return first;

  const att = await pool.query<{ gateway: string }>(
    `SELECT gateway
     FROM customer_invoice_payment_attempts
     WHERE invoice_id = $1::uuid AND tenant_id = $2::uuid
       AND gateway IS NOT NULL AND trim(gateway) <> ''
     ORDER BY CASE WHEN status = 'paid' THEN 0 ELSE 1 END, updated_at DESC NULLS LAST
     LIMIT 5`,
    [invoiceId, tenantId]
  );
  for (const row of att.rows) {
    const k = normalizeGatewayKey(row.gateway);
    if (k) return k;
  }

  if (inv.asaas_payment_id?.trim()) {
    return 'asaas';
  }

  return null;
}

async function resolveTargetAccountId(
  tenantId: string,
  gatewayKey: GatewayProviderKey,
  financialAccountIdOverride?: string | null
): Promise<{ financial_account_id: string } | null> {
  if (financialAccountIdOverride?.trim()) {
    const acc = await getFinancialAccount(tenantId, financialAccountIdOverride.trim());
    if (!acc) return null;
    const r = await pool.query(
      `SELECT financial_account_id::text FROM financial_account_gateway_links
       WHERE tenant_id = $1::uuid AND financial_account_id = $2::uuid
         AND gateway = $3 AND is_enabled = true`,
      [tenantId, financialAccountIdOverride.trim(), gatewayKey]
    );
    if ((r.rowCount ?? 0) === 0) return null;
    return { financial_account_id: financialAccountIdOverride.trim() };
  }
  return resolveFinancialAccountForGatewayIncome(tenantId, gatewayKey);
}

/** Logs JSON estruturados — nomes estáveis para observabilidade */
function emitSyncLog(
  event:
    | 'gateway_receivable_sync_invoice_loaded'
    | 'gateway_receivable_sync_link_lookup'
    | 'gateway_receivable_sync_created'
    | 'gateway_receivable_sync_skipped_existing'
    | 'gateway_receivable_sync_skipped_no_gateway'
    | 'gateway_receivable_sync_skipped_no_linked_account'
    | 'gateway_receivable_sync_error',
  payload: Record<string, unknown>
): void {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...payload }));
}

/**
 * Idempotente: reference_id da fatura e (opcionalmente) gateway_provider + gateway_reference_id.
 */
export async function syncCustomerInvoicePaymentToFinancialAccount(
  invoiceId: string,
  options?: { financial_account_id?: string | null }
): Promise<SyncCustomerInvoiceResult> {
  const inv = await loadInvoiceForSync(invoiceId);
  if (!inv) {
    emitSyncLog('gateway_receivable_sync_error', {
      invoice_id: invoiceId,
      outcome: 'skipped_invoice_not_found',
    });
    return { ok: false, reason: 'skipped_invoice_not_found', invoice_id: invoiceId, detail: 'invoice_not_found' };
  }

  const tenantId = inv.tenant_id;
  const invNo = (inv.invoice_number && inv.invoice_number.trim()) || invoiceId.slice(0, 8);

  emitSyncLog('gateway_receivable_sync_invoice_loaded', {
    tenant_id: tenantId,
    invoice_id: invoiceId,
    invoice_number: invNo,
    status: inv.status,
    gateway_raw: inv.gateway,
    gateway_reference_id: inv.gateway_reference_id,
    asaas_payment_id: inv.asaas_payment_id,
    amount_cents: inv.amount_cents,
  });

  if (!isPaidStatus(inv.status)) {
    emitSyncLog('gateway_receivable_sync_error', {
      tenant_id: tenantId,
      invoice_id: invoiceId,
      invoice_number: invNo,
      outcome: 'skipped_not_paid',
      status: inv.status,
    });
    return { ok: false, reason: 'skipped_not_paid', invoice_id: invoiceId, tenant_id: tenantId };
  }

  const amountCents = Math.round(Number(inv.amount_cents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    emitSyncLog('gateway_receivable_sync_error', {
      tenant_id: tenantId,
      invoice_id: invoiceId,
      outcome: 'skipped_invalid_amount',
      amount_cents: amountCents,
    });
    return { ok: false, reason: 'skipped_invalid_amount', invoice_id: invoiceId, tenant_id: tenantId };
  }

  const gKey = await resolveGatewayKeyForInvoice(tenantId, invoiceId, inv);
  if (!gKey) {
    emitSyncLog('gateway_receivable_sync_skipped_no_gateway', {
      tenant_id: tenantId,
      invoice_id: invoiceId,
      invoice_number: invNo,
      gateway_raw: inv.gateway,
      outcome: 'no_normalizable_gateway',
    });
    return { ok: false, reason: 'skipped_no_gateway', invoice_id: invoiceId, tenant_id: tenantId };
  }

  const gwRefEffective = effectiveGatewayReferenceId(inv, gKey);

  emitSyncLog('gateway_receivable_sync_link_lookup', {
    tenant_id: tenantId,
    invoice_id: invoiceId,
    invoice_number: invNo,
    gateway: gKey,
    gateway_reference_id: gwRefEffective || null,
    financial_account_override: options?.financial_account_id ?? null,
  });

  const account = await resolveTargetAccountId(tenantId, gKey, options?.financial_account_id ?? undefined);
  if (!account) {
    emitSyncLog('gateway_receivable_sync_skipped_no_linked_account', {
      tenant_id: tenantId,
      invoice_id: invoiceId,
      invoice_number: invNo,
      gateway: gKey,
      outcome: 'no_enabled_financial_account_for_gateway',
    });
    return { ok: false, reason: 'skipped_no_linked_account', invoice_id: invoiceId, tenant_id: tenantId };
  }

  const dupRef = await pool.query(
    `SELECT id FROM financial_transactions
     WHERE tenant_id = $1::uuid AND entry_source = 'gateway_payment'
       AND reference_type = 'customer_invoice' AND reference_id = $2::uuid
     LIMIT 1`,
    [tenantId, invoiceId]
  );
  if (dupRef.rowCount && dupRef.rowCount > 0) {
    emitSyncLog('gateway_receivable_sync_skipped_existing', {
      tenant_id: tenantId,
      invoice_id: invoiceId,
      invoice_number: invNo,
      gateway: gKey,
      account_id: account.financial_account_id,
      existing_transaction_id: dupRef.rows[0]?.id,
      outcome: 'duplicate_by_reference_id',
    });
    return {
      ok: true,
      reason: 'skipped_existing_transaction',
      invoice_id: invoiceId,
      tenant_id: tenantId,
      transaction_id: dupRef.rows[0]?.id ?? null,
    };
  }

  if (gwRefEffective) {
    const dupGw = await pool.query(
      `SELECT id FROM financial_transactions
       WHERE tenant_id = $1::uuid AND gateway_provider = $2 AND gateway_reference_id = $3
       LIMIT 1`,
      [tenantId, gKey, gwRefEffective]
    );
    if (dupGw.rowCount && dupGw.rowCount > 0) {
      emitSyncLog('gateway_receivable_sync_skipped_existing', {
        tenant_id: tenantId,
        invoice_id: invoiceId,
        invoice_number: invNo,
        gateway: gKey,
        gateway_reference_id: gwRefEffective,
        outcome: 'duplicate_by_gateway_reference',
      });
      return {
        ok: true,
        reason: 'skipped_existing_transaction',
        invoice_id: invoiceId,
        tenant_id: tenantId,
        transaction_id: dupGw.rows[0]?.id ?? null,
      };
    }
  }

  const paidYmd = inv.paid_at ? inv.paid_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const accRow = await getFinancialAccount(tenantId, account.financial_account_id);
  let transactionDateYmd = paidYmd;
  let dateClampedForBalance = false;
  if (accRow && transactionDateYmd < accRow.initial_balance_date) {
    transactionDateYmd = accRow.initial_balance_date;
    dateClampedForBalance = true;
  }
  const gwLabel = GATEWAY_LABEL[gKey] ?? gKey;
  const description = `Recebimento via ${gwLabel} — Fatura ${invNo}`;

  const customerId =
    inv.client_id && (await clientExistsForTenant(tenantId, inv.client_id)) ? inv.client_id : undefined;

  try {
    const tx = await createFinancialTransaction(tenantId, {
      account_id: account.financial_account_id,
      type: 'income',
      amount_cents: amountCents,
      description,
      transaction_date: transactionDateYmd,
      status: 'completed',
      transaction_kind: 'regular',
      customer_id: customerId,
      entry_source: 'gateway_payment',
      reference_type: 'customer_invoice',
      reference_id: invoiceId,
      gateway_provider: gKey,
      gateway_reference_id: gwRefEffective || null,
      metadata: {
        synced_from: 'financialGatewayReceivablesService',
        invoice_number: inv.invoice_number,
        ...(dateClampedForBalance
          ? { invoice_paid_at_date: paidYmd, ledger_date_clamped: true }
          : {}),
      },
    });
    emitSyncLog('gateway_receivable_sync_created', {
      tenant_id: tenantId,
      invoice_id: invoiceId,
      invoice_number: invNo,
      gateway: gKey,
      gateway_reference_id: gwRefEffective || null,
      account_id: account.financial_account_id,
      transaction_id: tx.id,
      outcome: 'created',
      transaction_date: transactionDateYmd,
      date_clamped_for_balance: dateClampedForBalance,
    });
    return {
      ok: true,
      reason: 'created_transaction',
      invoice_id: invoiceId,
      tenant_id: tenantId,
      transaction_id: tx.id,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
      emitSyncLog('gateway_receivable_sync_skipped_existing', {
        tenant_id: tenantId,
        invoice_id: invoiceId,
        invoice_number: invNo,
        outcome: 'unique_constraint_race',
        detail: msg,
      });
      return { ok: true, reason: 'skipped_existing_transaction', invoice_id: invoiceId, tenant_id: tenantId };
    }
    emitSyncLog('gateway_receivable_sync_error', {
      tenant_id: tenantId,
      invoice_id: invoiceId,
      invoice_number: invNo,
      gateway: gKey,
      account_id: account.financial_account_id,
      outcome: 'exception',
      detail: msg,
    });
    console.error('[gateway_receivable_sync_error]', e);
    return { ok: false, reason: 'error', invoice_id: invoiceId, tenant_id: tenantId, detail: msg };
  }
}

/** Backfill idempotente por período */
export async function syncPaidInvoicesForGatewayPeriod(params: {
  tenantId: string;
  gateway: GatewayProviderKey;
  financialAccountId: string;
  from: string;
  to: string;
  dryRun: boolean;
}): Promise<SyncPaidInvoicesBatchResult> {
  const { tenantId, gateway, financialAccountId, from, to, dryRun } = params;

  const linkOk = await pool.query(
    `SELECT 1 FROM financial_account_gateway_links
     WHERE tenant_id = $1::uuid AND financial_account_id = $2::uuid
       AND gateway = $3 AND is_enabled = true`,
    [tenantId, financialAccountId, gateway]
  );
  if ((linkOk.rowCount ?? 0) === 0) {
    throw new Error('Conta não encontrada ou sem vínculo activo com este gateway');
  }

  const invoices = await pool.query<{ id: string }>(
    `SELECT id::text FROM customer_invoices
     WHERE tenant_id = $1::uuid
       AND lower(trim(status)) IN ('paid', 'pago')
       AND paid_at IS NOT NULL
       AND paid_at::date >= $2::date
       AND paid_at::date <= $3::date`,
    [tenantId, from, to]
  );

  const total_paid_invoices_found = invoices.rows.length;

  let eligible_count = 0;
  let eligible_amount_cents = 0;
  let skipped_existing_count = 0;
  let skipped_no_gateway_count = 0;
  let skipped_no_linked_account_count = 0;
  let skipped_other_count = 0;
  let created_count = 0;
  let created_amount_cents = 0;
  const errors: { invoice_id: string; message: string }[] = [];

  for (const row of invoices.rows) {
    const full = await loadInvoiceForSync(row.id);
    if (!full) {
      skipped_other_count++;
      continue;
    }

    const gKey = await resolveGatewayKeyForInvoice(tenantId, row.id, full);
    if (!gKey || gKey !== gateway) {
      skipped_no_gateway_count++;
      continue;
    }

    const dup = await pool.query(
      `SELECT 1 FROM financial_transactions
       WHERE tenant_id = $1::uuid AND entry_source = 'gateway_payment'
         AND reference_type = 'customer_invoice' AND reference_id = $2::uuid
       LIMIT 1`,
      [tenantId, row.id]
    );
    if ((dup.rowCount ?? 0) > 0) {
      skipped_existing_count++;
      continue;
    }

    const amt = Math.round(Number(full.amount_cents));
    if (!Number.isFinite(amt) || amt <= 0) {
      skipped_other_count++;
      continue;
    }

    eligible_count++;
    eligible_amount_cents += amt;

    if (dryRun) continue;

    const result = await syncCustomerInvoicePaymentToFinancialAccount(row.id, {
      financial_account_id: financialAccountId,
    });
    if (result.reason === 'created_transaction') {
      created_count++;
      created_amount_cents += amt;
    } else if (result.reason === 'skipped_existing_transaction') {
      skipped_existing_count++;
    } else if (result.reason === 'skipped_no_linked_account') {
      skipped_no_linked_account_count++;
    } else if (result.reason === 'skipped_no_gateway') {
      skipped_no_gateway_count++;
    } else if (!result.ok) {
      errors.push({ invoice_id: row.id, message: result.detail ?? result.reason });
    }
  }

  return {
    total_paid_invoices_found,
    eligible_count,
    eligible_amount_cents,
    created_count,
    created_amount_cents,
    skipped_existing_count,
    skipped_no_gateway_count,
    skipped_no_linked_account_count,
    skipped_other_count,
    errors,
  };
}

/** Nome alinhado à especificação; mesmo comportamento que `syncCustomerInvoicePaymentToFinancialAccount`. */
export const syncPaidCustomerInvoiceToGatewayAccount = syncCustomerInvoicePaymentToFinancialAccount;
