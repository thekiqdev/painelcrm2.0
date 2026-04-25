/**
 * Exclusão segura de cobrança no gateway (ex.: DELETE no Asaas) para ciclo de vida de tentativas.
 * Não altera webhook; falhas são logadas e não travam o fluxo principal.
 */
import { buildGateway } from '../modules/payments/gatewayRegistry.js';
import { getConfigForTest } from './paymentGatewayConfigService.js';
import { billingLog } from './billingLogger.js';
import { normalizeGatewayStatus } from '../modules/payments/webhook/statusNormalizer.js';
import type { PaymentGateway } from '../modules/payments/paymentGatewayTypes.js';
import type { CustomerInvoicePaymentAttemptRow } from './customerInvoicePaymentAttemptsService.js';
import type { TenantBillingPaymentAttemptRow } from './tenantBillingPaymentAttemptsService.js';

/** Status Asaas em que NÃO se deve excluir cobrança (já liquidada ou encerrada). */
const ASAAS_NO_DELETE = new Set([
  'RECEIVED',
  'CONFIRMED',
  'RECEIVED_IN_CASH',
  'REFUNDED',
  'REFUND_IN_PROGRESS',
  'CHARGEBACK_REQUESTED',
  'CHARGEBACK_DISPUTE',
  'AWAITING_CHARGEBACK_REVERSAL',
  'DUNNING_RECEIVED',
  'DUNNING_REQUESTED',
]);

/**
 * Verifica se o status bruto do Asaas permite exclusão da cobrança (DELETE).
 * pending / aguardando / vencido sem recebimento costumam ser deletáveis.
 */
export function isAsaasRawStatusSafeToDelete(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== 'string') return true;
  const u = raw.trim().toUpperCase();
  if (ASAAS_NO_DELETE.has(u)) return false;
  if (u === 'CANCELED' || u === 'CANCELLED' || u === 'DELETED') return false;
  return true;
}

export interface DeleteGatewayChargeContext {
  invoice_id?: string;
  billing_id?: string;
  attempt_id?: string;
  reason: 'superseded_by_paid' | 'switch_cleanup' | 'manual';
}

/**
 * Remove cobrança no gateway quando seguro (Asaas: DELETE /payments/:id via cancelPayment).
 * Erros são engolidos após log (não quebra fluxo).
 */
export async function deleteGatewayChargeIfSafe(params: {
  tenantId: string;
  gatewayKey: string;
  gatewayReferenceId: string;
  gatewayStatusRaw: string | null;
  ctx: DeleteGatewayChargeContext;
}): Promise<{ deleted: boolean; skipped: boolean; error?: string }> {
  const { tenantId, gatewayKey, gatewayReferenceId, gatewayStatusRaw, ctx } = params;
  if (!gatewayReferenceId?.trim()) {
    billingLog('invoice', 'gateway_charge_delete_skipped', {
      ...ctx,
      gateway_reference_id: gatewayReferenceId,
      reason: 'empty_reference',
    });
    return { deleted: false, skipped: true };
  }

  if (gatewayKey === 'asaas' && !isAsaasRawStatusSafeToDelete(gatewayStatusRaw)) {
    billingLog('invoice', 'gateway_charge_delete_skipped', {
      ...ctx,
      gateway_reference_id: gatewayReferenceId,
      gateway_status: gatewayStatusRaw ?? undefined,
      reason: 'status_not_deletable',
    });
    return { deleted: false, skipped: true };
  }

  const cfg = await getConfigForTest('tenant', tenantId, gatewayKey);
  if (!cfg) {
    billingLog('invoice', 'gateway_charge_delete_failed', {
      ...ctx,
      gateway_reference_id: gatewayReferenceId,
      error: 'config_not_found',
    });
    return { deleted: false, skipped: false, error: 'config_not_found' };
  }

  const gateway = buildGateway(cfg.gateway_key, {
    credentials: (cfg.credentials as Record<string, unknown>) ?? {},
    options: (cfg.options as Record<string, unknown>) ?? {},
  }) as PaymentGateway;

  if (!gateway.cancelPayment) {
    billingLog('invoice', 'gateway_charge_delete_skipped', {
      ...ctx,
      gateway_reference_id: gatewayReferenceId,
      reason: 'gateway_no_cancel',
    });
    return { deleted: false, skipped: true };
  }

  try {
    if (gateway.getPayment) {
      const live = await gateway.getPayment(gatewayReferenceId);
      if (live) {
        const internal = normalizeGatewayStatus(gatewayKey, live.status);
        if (internal === 'paid' || internal === 'refunded' || internal === 'cancelled') {
          billingLog('invoice', 'gateway_charge_delete_skipped', {
            ...ctx,
            gateway_reference_id: gatewayReferenceId,
            reason: 'live_status_terminal',
            live_status: live.status,
          });
          return { deleted: false, skipped: true };
        }
      }
    }
  } catch (e) {
    billingLog('invoice', 'gateway_charge_delete_prefetch_failed', {
      ...ctx,
      gateway_reference_id: gatewayReferenceId,
      error: e instanceof Error ? e.message : String(e),
    });
    // continua tentando delete se o GET falhar (rede); cancelPayment pode ainda funcionar ou 404
  }

  try {
    await gateway.cancelPayment(gatewayReferenceId);
    billingLog('invoice', 'gateway_charge_deleted', {
      ...ctx,
      gateway_reference_id: gatewayReferenceId,
      gateway: gatewayKey,
    });
    return { deleted: true, skipped: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    billingLog('invoice', 'gateway_charge_delete_failed', {
      ...ctx,
      gateway_reference_id: gatewayReferenceId,
      gateway: gatewayKey,
      error: msg,
    });
    return { deleted: false, skipped: false, error: msg };
  }
}

async function cleanupSupersedeTenantBillingAttemptRows(
  billingId: string,
  tenantId: string,
  rows: TenantBillingPaymentAttemptRow[]
): Promise<void> {
  const { markTenantBillingAttemptCancelledSuperseded } = await import('./tenantBillingPaymentAttemptsService.js');
  for (const row of rows) {
    await deleteGatewayChargeIfSafe({
      tenantId,
      gatewayKey: row.gateway,
      gatewayReferenceId: row.gateway_reference_id ?? '',
      gatewayStatusRaw: row.gateway_status,
      ctx: {
        billing_id: billingId,
        attempt_id: row.id,
        reason: 'superseded_by_paid',
      },
    });
    await markTenantBillingAttemptCancelledSuperseded(row.id, {
      reason: 'superseded_by_other_attempt_paid',
      superseded_by: 'paid_other',
    });
  }
}

async function cleanupSupersedeAttemptRows(
  invoiceId: string,
  tenantId: string,
  rows: CustomerInvoicePaymentAttemptRow[]
): Promise<void> {
  const { markAttemptCancelledSuperseded } = await import('./customerInvoicePaymentAttemptsService.js');
  for (const row of rows) {
    await deleteGatewayChargeIfSafe({
      tenantId,
      gatewayKey: row.gateway,
      gatewayReferenceId: row.gateway_reference_id ?? '',
      gatewayStatusRaw: row.gateway_status,
      ctx: {
        invoice_id: invoiceId,
        attempt_id: row.id,
        reason: 'superseded_by_paid',
      },
    });
    await markAttemptCancelledSuperseded(row.id, {
      reason: 'superseded_by_other_attempt_paid',
      superseded_by: 'paid_other',
    });
  }
}

/**
 * Quando uma tentativa confirma pagamento: remove cobranças pendentes das outras tentativas no gateway
 * e marca-as como canceladas/superseded no banco (histórico preservado).
 */
export async function supersedeOtherPendingAttemptsAfterPaid(
  invoiceId: string,
  paidAttemptId: string,
  tenantId: string
): Promise<void> {
  const { listPendingAttemptsForInvoiceExcept } = await import('./customerInvoicePaymentAttemptsService.js');
  const rows = await listPendingAttemptsForInvoiceExcept(invoiceId, paidAttemptId);
  await cleanupSupersedeAttemptRows(invoiceId, tenantId, rows);
}

/**
 * Igual a `supersedeOtherPendingAttemptsAfterPaid` nas faturas CRM: remove/supersed outras cobranças no gateway
 * e marca tentativas como canceladas no banco.
 */
export async function supersedeOtherPendingTenantBillingAttemptsAfterPaid(
  billingId: string,
  paidAttemptId: string,
  tenantId: string
): Promise<void> {
  const { listPendingTenantBillingAttemptsExcept } = await import('./tenantBillingPaymentAttemptsService.js');
  const rows = await listPendingTenantBillingAttemptsExcept(billingId, paidAttemptId);
  await cleanupSupersedeTenantBillingAttemptRows(billingId, tenantId, rows);
}

/**
 * Consolida tentativa vencedora na linha `tenant_billing`, ativa o plano e aplica o mesmo cleanup das faturas
 * (polling do checkout, quando o pagamento não veio só pela tentativa “ativa” na UI).
 */
export async function runPostPaidCleanupForTenantBilling(params: {
  billingId: string;
  tenantId: string;
  paidAttemptId: string | null;
  paidGatewayReferenceId: string;
  gatewayStatusRaw: string | null;
  paidAt: Date;
  /** Quando não há linha em `tenant_billing_payment_attempts` (legado). */
  paymentMethodFallback?: string | null;
}): Promise<void> {
  const {
    hasTenantBillingPaymentAttemptsTable,
    updateTenantBillingPaymentAttemptStatus,
    activateTenantBillingPaymentAttempt,
  } = await import('./tenantBillingPaymentAttemptsService.js');
  const { updateInvoiceGatewayData, updateInvoiceStatus } = await import('./invoiceService.js');
  const { activatePlanFromBilling } = await import('./subscriptionService.js');
  const { pool } = await import('../utils/db.js');

  const ref = params.paidGatewayReferenceId?.trim();
  if (!ref) return;

  const { getInvoiceById } = await import('./invoiceService.js');
  const rowBefore = await getInvoiceById(params.billingId);
  const wasAlreadyPaid = rowBefore?.status === 'paid';

  if (!(await hasTenantBillingPaymentAttemptsTable())) {
    const pm = (params.paymentMethodFallback || 'PIX').toUpperCase().trim() || 'PIX';
    await updateInvoiceStatus(params.billingId, 'paid', params.paidAt, pm, params.gatewayStatusRaw);
    await activatePlanFromBilling(params.billingId);
    if (!wasAlreadyPaid) {
      const { schedulePublishPlatformBillingPaymentConfirmed } = await import(
        './platformNotifications/platformBusinessNotifications.js'
      );
      schedulePublishPlatformBillingPaymentConfirmed(params.billingId);
    }
    return;
  }

  let paidAttemptId = params.paidAttemptId;
  if (!paidAttemptId) {
    const r = await pool.query<{ id: string }>(
      `SELECT id FROM tenant_billing_payment_attempts
       WHERE billing_id = $1 AND gateway_reference_id = $2
       LIMIT 1`,
      [params.billingId, ref]
    );
    paidAttemptId = r.rows[0]?.id ?? null;
  }

  if (paidAttemptId) {
    const attRes = await pool.query<TenantBillingPaymentAttemptRow>(
      `SELECT id, billing_id, tenant_id, gateway, payment_method, status, gateway_status,
        gateway_reference_id, gateway_metadata, idempotency_key, is_active, activated_at, deactivated_at,
        expires_at, paid_at, created_at, updated_at
       FROM tenant_billing_payment_attempts WHERE id = $1 LIMIT 1`,
      [paidAttemptId]
    );
    const att = attRes.rows[0];
    await updateTenantBillingPaymentAttemptStatus({
      attemptId: paidAttemptId,
      status: 'paid',
      gatewayStatus: params.gatewayStatusRaw,
      paidAt: params.paidAt,
    });
    await activateTenantBillingPaymentAttempt(params.billingId, paidAttemptId);
    if (att) {
      await updateInvoiceGatewayData(params.billingId, {
        gateway: att.gateway,
        payment_method: att.payment_method,
        gateway_reference_id: att.gateway_reference_id ?? ref,
        gateway_metadata: (att.gateway_metadata as Record<string, unknown>) ?? {},
        gateway_status: params.gatewayStatusRaw,
        idempotency_key: att.idempotency_key,
      });
    }
    const pm = (att?.payment_method ?? params.paymentMethodFallback ?? 'PIX').toString().toUpperCase().trim() || 'PIX';
    await updateInvoiceStatus(params.billingId, 'paid', params.paidAt, pm, params.gatewayStatusRaw);
    await activatePlanFromBilling(params.billingId);
    await supersedeOtherPendingTenantBillingAttemptsAfterPaid(params.billingId, paidAttemptId, params.tenantId);
    if (!wasAlreadyPaid) {
      const { schedulePublishPlatformBillingPaymentConfirmed } = await import(
        './platformNotifications/platformBusinessNotifications.js'
      );
      schedulePublishPlatformBillingPaymentConfirmed(params.billingId);
    }
  } else {
    const pm = (params.paymentMethodFallback || 'PIX').toUpperCase().trim() || 'PIX';
    await updateInvoiceStatus(params.billingId, 'paid', params.paidAt, pm, params.gatewayStatusRaw);
    await activatePlanFromBilling(params.billingId);
    if (!wasAlreadyPaid) {
      const { schedulePublishPlatformBillingPaymentConfirmed } = await import(
        './platformNotifications/platformBusinessNotifications.js'
      );
      schedulePublishPlatformBillingPaymentConfirmed(params.billingId);
    }
  }
}

/**
 * Consolida tentativa vencedora no banco e aplica o mesmo cleanup do webhook quando o pagamento
 * não passa por `applyPaymentAttemptEvent` (ex.: polling da página pública, cartão inline).
 */
export async function runPostPaidCleanupForCustomerInvoice(params: {
  invoiceId: string;
  tenantId: string;
  paidGatewayReferenceId: string;
  gatewayStatusRaw: string | null;
  paidAt: Date;
}): Promise<void> {
  if (!params.paidGatewayReferenceId?.trim()) return;
  const {
    hasInvoicePaymentAttemptsTable,
    updateInvoicePaymentAttemptStatus,
    listAttemptsForCleanupExceptGatewayReference,
  } = await import('./customerInvoicePaymentAttemptsService.js');
  if (!(await hasInvoicePaymentAttemptsTable())) return;

  const { pool } = await import('../utils/db.js');
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM customer_invoice_payment_attempts
     WHERE invoice_id = $1 AND tenant_id = $2 AND gateway_reference_id = $3
     LIMIT 1`,
    [params.invoiceId, params.tenantId, params.paidGatewayReferenceId]
  );
  const paidAttemptId = r.rows[0]?.id ?? null;

  if (paidAttemptId) {
    await updateInvoicePaymentAttemptStatus({
      attemptId: paidAttemptId,
      status: 'paid',
      gatewayStatus: params.gatewayStatusRaw ?? undefined,
      paidAt: params.paidAt,
    });
    await supersedeOtherPendingAttemptsAfterPaid(params.invoiceId, paidAttemptId, params.tenantId);
  } else {
    const rows = await listAttemptsForCleanupExceptGatewayReference(
      params.invoiceId,
      params.paidGatewayReferenceId
    );
    await cleanupSupersedeAttemptRows(params.invoiceId, params.tenantId, rows);
  }
}
