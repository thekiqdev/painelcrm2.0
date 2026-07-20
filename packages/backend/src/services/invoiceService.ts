/**
 * CRUD de tenant_billing: criação, lookup por gateway e atualização de status.
 * Geração de invoice_number; usado pelo webhook e pelo fluxo de compra.
 * Fase 4: apenas colunas genéricas gateway_reference_id, gateway_metadata, gateway_status.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../utils/db.js';
import { yyyyMmDdFromDbDateValue } from '../utils/calendarDateBr.js';
import { billingLog } from './billingLogger.js';
import type { GatewayPaymentData } from '../modules/payments/paymentGatewayTypes.js';

export type BillingInterval = 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';
export type BillingSource = 'superadmin' | 'self_service' | 'api';
export type BillingReason =
  | 'plan_purchase'
  | 'plan_upgrade'
  | 'plan_renewal'
  | 'manual_charge'
  | 'seat_addon'
  | 'instance_addon';

/** Idempotência estável por linha + método (evita colisão entre tenants; troca de método gera nova chave no gateway). */
export function buildSaasCheckoutChargeIdempotencyKey(billingId: string, paymentMethod: string): string {
  return `saas_co_${billingId}_${paymentMethod}`;
}
export type BillingStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

export interface TenantBillingRow {
  id: string;
  tenant_id: string;
  plan_id: string;
  billing_interval: string;
  amount_cents: number;
  due_date: string;
  status: string;
  paid_at: string | null;
  invoice_number: string | null;
  gateway: string | null;
  payment_method: string | null;
  gateway_reference_id: string | null;
  gateway_metadata: Record<string, unknown> | null;
  gateway_status: string | null;
  idempotency_key: string | null;
  period_start: string | null;
  period_end: string | null;
  subscription_id: string | null;
  plan_name_snapshot: string | null;
  plan_price_snapshot: number | null;
  users_count: number | null;
  source: string | null;
  billing_reason: string | null;
  created_at: string;
  updated_at: string;
  /** Token opaco para /saas-pay/:token (link público da mesma cobrança). */
  platform_public_pay_token?: string | null;
}

export interface CreateInvoiceInput {
  tenant_id: string;
  plan_id: string;
  billing_interval: BillingInterval;
  amount_cents: number;
  due_date: Date | string;
  source?: BillingSource | null;
  billing_reason?: BillingReason | null;
  payment_method?: string | null;
  users_count?: number | null;
  gateway?: string | null;
  idempotency_key?: string | null;
  subscription_id?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  plan_name_snapshot?: string | null;
  plan_price_snapshot?: number | null;
}

/**
 * Gera invoice_number: INV-{primeiros 8 do tenant_id}-{timestamp base36}
 */
function generateInvoiceNumber(tenantId: string): string {
  const short = tenantId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const suffix = Date.now().toString(36).toUpperCase();
  return `INV-${short}-${suffix}`;
}

/**
 * Cria registro em tenant_billing. Inclui subscription_id, period_start/end e snapshot do plano quando recorrência.
 */
export async function createInvoice(data: CreateInvoiceInput): Promise<TenantBillingRow> {
  const dueDate = yyyyMmDdFromDbDateValue(typeof data.due_date === 'string' ? data.due_date : data.due_date);
  if (!dueDate) {
    throw new Error('Invalid due_date');
  }
  const invoiceNumber = generateInvoiceNumber(data.tenant_id);

  const result = await pool.query<TenantBillingRow>(
    `INSERT INTO tenant_billing (
      tenant_id, plan_id, billing_interval, amount_cents, due_date, status, invoice_number,
      gateway, payment_method, idempotency_key,
      users_count, source, billing_reason, subscription_id, period_start, period_end,
      plan_name_snapshot, plan_price_snapshot
    ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING id, tenant_id, plan_id, billing_interval, amount_cents, due_date::text AS due_date, status, paid_at,
      invoice_number, gateway, payment_method,
      gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
      period_start, period_end, subscription_id, plan_name_snapshot, plan_price_snapshot,
      users_count, source, billing_reason, created_at, updated_at, platform_public_pay_token`,
    [
      data.tenant_id,
      data.plan_id,
      data.billing_interval,
      data.amount_cents,
      dueDate,
      invoiceNumber,
      data.gateway ?? null,
      data.payment_method ?? null,
      data.idempotency_key ?? null,
      data.users_count ?? null,
      data.source ?? null,
      data.billing_reason ?? null,
      data.subscription_id ?? null,
      data.period_start ?? null,
      data.period_end ?? null,
      data.plan_name_snapshot ?? null,
      data.plan_price_snapshot ?? null,
    ]
  );
  const row = result.rows[0];
  billingLog('invoice', 'invoice_created', {
    subscriptionId: data.subscription_id ?? undefined,
    invoiceId: row.id,
    invoiceNumber: row.invoice_number ?? undefined,
    periodStart: data.period_start ?? undefined,
    periodEnd: data.period_end ?? undefined,
    amount: data.amount_cents,
  });
  return row;
}

/**
 * Atualiza subscription_id na fatura (após criar assinatura no activatePlanFromBilling).
 */
export async function setBillingSubscriptionId(
  billingId: string,
  subscriptionId: string
): Promise<void> {
  await pool.query(
    `UPDATE tenant_billing SET subscription_id = $1, updated_at = now() WHERE id = $2`,
    [subscriptionId, billingId]
  );
}

/**
 * Busca tenant_billing pelo ID do pagamento no gateway (gateway_reference_id).
 * Fase 3: lookup apenas por coluna genérica.
 */
export async function getInvoiceByGatewayPaymentId(
  gateway: string,
  paymentId: string
): Promise<TenantBillingRow | null> {
  return getInvoiceByGatewayReferenceId(gateway, paymentId);
}

/**
 * Busca tenant_billing por (gateway, gateway_reference_id).
 */
export async function getInvoiceByGatewayReferenceId(
  gateway: string,
  referenceId: string
): Promise<TenantBillingRow | null> {
  const result = await pool.query<TenantBillingRow>(
    `SELECT id, tenant_id, plan_id, billing_interval, amount_cents, due_date::text AS due_date, status, paid_at,
       invoice_number, gateway, payment_method,
       gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
       period_start, period_end, subscription_id, plan_name_snapshot, plan_price_snapshot,
       users_count, source, billing_reason, created_at, updated_at
     FROM tenant_billing
     WHERE gateway = $1 AND gateway_reference_id = $2`,
    [gateway, referenceId]
  );
  return result.rows[0] ?? null;
}

/**
 * Atualiza dados do gateway na fatura (após createCharge). Fase 4: apenas colunas genéricas.
 */
export async function updateInvoiceGatewayData(
  billingId: string,
  data: GatewayPaymentData
): Promise<void> {
  const existing = await getInvoiceById(billingId);
  const prevMeta =
    existing?.gateway_metadata && typeof existing.gateway_metadata === 'object'
      ? ({ ...(existing.gateway_metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const incoming =
    data.gateway_metadata != null && typeof data.gateway_metadata === 'object'
      ? (data.gateway_metadata as Record<string, unknown>)
      : {};
  const merged: Record<string, unknown> = { ...prevMeta, ...incoming };
  const metadataJson = JSON.stringify(merged);
  await pool.query(
    `UPDATE tenant_billing
     SET gateway = $1, payment_method = $2,
         gateway_reference_id = $3, gateway_metadata = $4, gateway_status = $5,
         idempotency_key = COALESCE($6, idempotency_key), updated_at = now()
     WHERE id = $7`,
    [
      data.gateway,
      data.payment_method,
      data.gateway_reference_id,
      metadataJson,
      data.gateway_status,
      data.idempotency_key ?? null,
      billingId,
    ]
  );
}

/**
 * Atualiza status da fatura (e paid_at, payment_method, gateway_status quando pago). Fase 4: apenas gateway_status.
 */
export async function updateInvoiceStatus(
  billingId: string,
  status: BillingStatus,
  paidAt?: Date | null,
  paymentMethod?: string | null,
  gatewayStatus?: string | null
): Promise<void> {
  if (status === 'paid') {
    await pool.query(
      `UPDATE tenant_billing
       SET status = $1, paid_at = COALESCE($2::timestamptz, now()), payment_method = COALESCE($3, payment_method),
           gateway_status = COALESCE($4, gateway_status), updated_at = now()
       WHERE id = $5`,
      [status, paidAt ?? null, paymentMethod ?? null, gatewayStatus ?? null, billingId]
    );
  } else {
    await pool.query(
      `UPDATE tenant_billing
       SET status = $1, gateway_status = COALESCE($2, gateway_status), updated_at = now()
       WHERE id = $3`,
      [status, gatewayStatus ?? null, billingId]
    );
  }
}

/**
 * Busca fatura por id (para ativação).
 */
export async function getInvoiceById(billingId: string): Promise<TenantBillingRow | null> {
  const result = await pool.query<TenantBillingRow>(
    `SELECT id, tenant_id, plan_id, billing_interval, amount_cents, due_date::text AS due_date, status, paid_at,
       invoice_number, gateway, payment_method,
       gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
       period_start, period_end, subscription_id, plan_name_snapshot, plan_price_snapshot,
       users_count, source, billing_reason, created_at, updated_at, platform_public_pay_token
     FROM tenant_billing WHERE id = $1`,
    [billingId]
  );
  return result.rows[0] ?? null;
}

const PLATFORM_PUBLIC_PAY_TOKEN_BYTES = 32;

export function isValidPlatformPublicPayTokenFormat(raw: string | undefined | null): boolean {
  if (raw == null || typeof raw !== 'string') return false;
  const s = raw.trim();
  return /^[a-f0-9]{64}$/i.test(s);
}

/** Garante token opaco único (64 hex) para link público /saas-pay/:token. */
export async function ensureTenantBillingPublicPayToken(billingId: string): Promise<string> {
  const billing = await getInvoiceById(billingId);
  if (!billing) {
    throw new Error(`Billing not found: ${billingId}`);
  }
  const existing = billing.platform_public_pay_token?.trim();
  if (existing && isValidPlatformPublicPayTokenFormat(existing)) {
    return existing;
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const token = randomBytes(PLATFORM_PUBLIC_PAY_TOKEN_BYTES).toString('hex');
    try {
      const up = await pool.query<{ t: string }>(
        `UPDATE tenant_billing
         SET platform_public_pay_token = $1, updated_at = now()
         WHERE id = $2
           AND (platform_public_pay_token IS NULL OR trim(platform_public_pay_token) = '')
         RETURNING platform_public_pay_token AS t`,
        [token, billingId],
      );
      if (up.rows[0]?.t) {
        return up.rows[0].t;
      }
      const again = await getInvoiceById(billingId);
      const t2 = again?.platform_public_pay_token?.trim();
      if (t2 && isValidPlatformPublicPayTokenFormat(t2)) {
        return t2;
      }
    } catch (e: unknown) {
      const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
      if (code === '23505') {
        const again = await getInvoiceById(billingId);
        const t2 = again?.platform_public_pay_token?.trim();
        if (t2 && isValidPlatformPublicPayTokenFormat(t2)) return t2;
        continue;
      }
      throw e;
    }
  }
  throw new Error('Could not allocate platform_public_pay_token');
}

export async function getInvoiceByPlatformPublicPayToken(tokenRaw: string): Promise<TenantBillingRow | null> {
  const token = tokenRaw?.trim();
  if (!token || !isValidPlatformPublicPayTokenFormat(token)) {
    return null;
  }
  const result = await pool.query<TenantBillingRow>(
    `SELECT id, tenant_id, plan_id, billing_interval, amount_cents, due_date::text AS due_date, status, paid_at,
       invoice_number, gateway, payment_method,
       gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
       period_start, period_end, subscription_id, plan_name_snapshot, plan_price_snapshot,
       users_count, source, billing_reason, created_at, updated_at, platform_public_pay_token
     FROM tenant_billing WHERE platform_public_pay_token = $1 LIMIT 1`,
    [token],
  );
  return result.rows[0] ?? null;
}

/**
 * Token opaco para POST de cartão no checkout SaaS sem JWT (papel análogo ao `payment_token` do link público de faturas).
 * Persistido em `gateway_metadata.checkout_inline_pay_token` e preservado nos merges de metadata.
 */
export async function ensureTenantBillingInlinePayToken(billingId: string): Promise<string> {
  const billing = await getInvoiceById(billingId);
  if (!billing) {
    throw new Error(`Billing not found: ${billingId}`);
  }
  const meta =
    billing.gateway_metadata && typeof billing.gateway_metadata === 'object'
      ? ({ ...(billing.gateway_metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const existing = meta.checkout_inline_pay_token;
  if (typeof existing === 'string' && existing.length >= 32) {
    return existing;
  }
  const token = randomUUID();
  meta.checkout_inline_pay_token = token;
  await pool.query(
    `UPDATE tenant_billing SET gateway_metadata = $1::jsonb, updated_at = now() WHERE id = $2`,
    [JSON.stringify(meta), billingId]
  );
  return token;
}

/**
 * Verifica se já existe fatura para a assinatura e período (idempotência).
 */
export async function findInvoiceBySubscriptionAndPeriod(
  subscriptionId: string,
  periodStart: string
): Promise<TenantBillingRow | null> {
  const result = await pool.query<TenantBillingRow>(
    `SELECT id, tenant_id, plan_id, billing_interval, amount_cents, due_date::text AS due_date, status, paid_at,
       invoice_number, gateway, payment_method,
       gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
       period_start, period_end, subscription_id, plan_name_snapshot, plan_price_snapshot,
       users_count, source, billing_reason, created_at, updated_at
     FROM tenant_billing
     WHERE subscription_id = $1 AND period_start = $2
     LIMIT 1`,
    [subscriptionId, periodStart]
  );
  return result.rows[0] ?? null;
}

/**
 * Status em `tenant_billing` para o checkout SaaS do plano:
 *
 * Reutilizáveis (mesma linha, troca de método, retorno ao checkout ou preparação no gateway): inclui `overdue`
 * para o cliente pagar no painel após sincronizar com o gateway (links/PIX), sem forçar nova linha só pelo status.
 */
export const SAAS_PLAN_CHECKOUT_REUSABLE_STATUSES = ['pending', 'waiting_payment', 'processing', 'overdue'];

/** Irmãs concorrentes a cancelar ao confirmar pagamento (inclui overdue ainda “abertas” comercialmente). */
export const SAAS_PLAN_SIBLING_OPEN_STATUSES = ['pending', 'waiting_payment', 'processing', 'overdue'];

/** @deprecated use SAAS_PLAN_SIBLING_OPEN_STATUSES */
export const SAAS_SELF_SERVICE_REUSABLE_STATUSES = SAAS_PLAN_SIBLING_OPEN_STATUSES;

/**
 * Chave legada por contexto (tenant + plano + vencimento) — apenas referência/auditoria; a idempotência do gateway usa `buildSaasCheckoutChargeIdempotencyKey`.
 */
export function buildSaasPlanCheckoutIdempotencyKeys(
  tenantId: string,
  planId: string,
  dueDateStr: string,
  _paymentMethod: string
): { v2Key: string; legacyKey: string } {
  const legacyKey = `saas_${tenantId}_${planId}_${dueDateStr}`;
  const v2Key = `${legacyKey}_${_paymentMethod}`;
  return { v2Key, legacyKey };
}

/**
 * Mesma “cobrança de contexto” do checkout SaaS: tenant + plano + intervalo + usuários + finalidade.
 * Não usa `amount_cents` na chave — o valor deriva do contexto; divergência é corrigida em subscribePlan.
 */
export async function findReusableSaasPlanCheckoutInvoice(params: {
  tenantId: string;
  planId: string;
  billingInterval: BillingInterval;
  usersCount: number | null;
  billingReason: BillingReason | null;
}): Promise<TenantBillingRow | null> {
  const reasonNorm = params.billingReason ?? 'plan_purchase';
  const result = await pool.query<TenantBillingRow>(
    `SELECT id, tenant_id, plan_id, billing_interval, amount_cents, due_date::text AS due_date, status, paid_at,
       invoice_number, gateway, payment_method,
       gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
       period_start, period_end, subscription_id, plan_name_snapshot, plan_price_snapshot,
       users_count, source, billing_reason, created_at, updated_at
     FROM tenant_billing
     WHERE tenant_id = $1
       AND plan_id = $2
       AND billing_interval = $3
       AND status = ANY($4::text[])
       AND COALESCE(billing_reason, 'plan_purchase') = $5
       AND (users_count IS NOT DISTINCT FROM $6)
     ORDER BY created_at DESC
     LIMIT 1`,
    [
      params.tenantId,
      params.planId,
      params.billingInterval,
      SAAS_PLAN_CHECKOUT_REUSABLE_STATUSES,
      reasonNorm,
      params.usersCount,
    ]
  );
  return result.rows[0] ?? null;
}

/**
 * Antes de criar nova linha para o mesmo contexto comercial, encerra pendentes antigas (evita múltiplas faturas ativas).
 */
export async function cancelOpenPlanPurchaseBillingsForContext(params: {
  tenantId: string;
  planId: string;
  billingInterval: BillingInterval;
  usersCount: number | null;
  billingReason: BillingReason | null;
}): Promise<void> {
  const reasonNorm = params.billingReason ?? 'plan_purchase';
  await pool.query(
    `UPDATE tenant_billing
     SET status = 'cancelled', updated_at = now()
     WHERE tenant_id = $1
       AND plan_id = $2
       AND billing_interval = $3
       AND COALESCE(billing_reason, 'plan_purchase') = $4
       AND (users_count IS NOT DISTINCT FROM $5)
       AND status = ANY($6::text[])`,
    [
      params.tenantId,
      params.planId,
      params.billingInterval,
      reasonNorm,
      params.usersCount,
      SAAS_PLAN_SIBLING_OPEN_STATUSES,
    ]
  );
}

/**
 * Cancela faturas de plan_purchase/plan_upgrade abertas para tenant+plano em QUALQUER billing_interval.
 * Chamado antes de criar nova fatura quando o usuário troca de intervalo (ex: monthly → yearly):
 * garante que a fatura do intervalo anterior não fique em aberto indefinidamente.
 * NÃO afeta faturas de seat_addon nem plan_renewal — essas têm seu próprio ciclo de vida.
 */
export async function cancelOpenPlanPurchaseBillingsAllIntervalsForTenant(params: {
  tenantId: string;
  planId: string;
  billingReason: BillingReason | null;
}): Promise<void> {
  const reasonNorm = params.billingReason ?? 'plan_purchase';
  // Proteção explícita: nunca cancela seat_addon ou plan_renewal por este caminho
  if (reasonNorm === 'seat_addon' || reasonNorm === 'plan_renewal') return;
  await pool.query(
    `UPDATE tenant_billing
     SET status = 'cancelled', updated_at = now()
     WHERE tenant_id = $1
       AND plan_id = $2
       AND COALESCE(billing_reason, 'plan_purchase') = $3
       AND status = ANY($4::text[])`,
    [
      params.tenantId,
      params.planId,
      reasonNorm,
      SAAS_PLAN_SIBLING_OPEN_STATUSES,
    ]
  );
}

/**
 * Cancela faturas seat_addon abertas, exceto a indicada (reuso de checkout).
 * Limpa `tenants.seat_addon_pending_billing_id` quando apontava para fatura cancelada.
 */
export async function cancelOpenSeatAddonBillingsExcept(
  tenantId: string,
  exceptBillingId: string | null
): Promise<void> {
  const r = await pool.query<{ id: string }>(
    `UPDATE tenant_billing
     SET status = 'cancelled', updated_at = now()
     WHERE tenant_id = $1
       AND COALESCE(billing_reason, '') = 'seat_addon'
       AND status = ANY($2::text[])
       AND ($3::uuid IS NULL OR id <> $3::uuid)
     RETURNING id`,
    [tenantId, SAAS_PLAN_SIBLING_OPEN_STATUSES, exceptBillingId]
  );
  const ids = r.rows.map((row) => row.id);
  if (ids.length === 0) return;
  await pool.query(
    `UPDATE tenants
     SET seat_addon_pending_billing_id = NULL, updated_at = now()
     WHERE id = $1 AND seat_addon_pending_billing_id = ANY($2::uuid[])`,
    [tenantId, ids]
  );
}

export async function cancelOpenInstanceAddonBillingsExcept(
  tenantId: string,
  exceptBillingId: string | null
): Promise<void> {
  const r = await pool.query<{ id: string }>(
    `UPDATE tenant_billing
     SET status = 'cancelled', updated_at = now()
     WHERE tenant_id = $1
       AND COALESCE(billing_reason, '') = 'instance_addon'
       AND status = ANY($2::text[])
       AND ($3::uuid IS NULL OR id <> $3::uuid)
     RETURNING id`,
    [tenantId, SAAS_PLAN_SIBLING_OPEN_STATUSES, exceptBillingId]
  );
  const ids = r.rows.map((row) => row.id);
  if (ids.length === 0) return;
  await pool.query(
    `UPDATE tenants
     SET instance_addon_pending_billing_id = NULL, updated_at = now()
     WHERE id = $1 AND instance_addon_pending_billing_id = ANY($2::uuid[])`,
    [tenantId, ids]
  );
}
