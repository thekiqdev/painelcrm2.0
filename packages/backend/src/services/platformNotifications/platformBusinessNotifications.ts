/**
 * Fase 3 — publicação de eventos reais da plataforma (domínio separado do motor do tenant).
 */
import { pool } from '../../utils/db.js';
import { publishPlatformBusinessEventMultiChannel } from './platformBusinessEventMultiChannel.js';
import { ensureTenantBillingPublicPayToken, getInvoiceById } from '../invoiceService.js';
import { pnLogWarn } from './platformNotificationLog.js';
import { pickGatewayFallbackUrlFromBilling } from '../saasBillingLinkHelpers.js';
import { buildPlatformSaasInvoiceUrl } from '../../utils/saasPlatformInvoiceUrl.js';
import { formatBillingDueDatePtBr, formatYmdToPtBr } from '../../utils/calendarDateBr.js';
import { buildPlatformSupportLink } from '../../utils/platformPublicUrls.js';
import {
  adminDisplayName,
  loadPrimaryTenantAdminForNotify,
  resolveRecipientWhatsapp,
  type TenantAdminNotifyRow,
} from './platformTenantAdminForNotify.js';
import {
  isProvisionalOperationalName,
  isProvisionalOperationalSlug,
} from '../../acquisition/tenantOperationalSlug.js';
import { resolveTransactionalBrandName } from '../../partner/partnerBrandResolver.js';

export type { TenantAdminNotifyRow } from './platformTenantAdminForNotify.js';
export { loadPrimaryTenantAdminForNotify } from './platformTenantAdminForNotify.js';

function feBase(): string {
  return String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

async function platformPublicName(tenantId?: string | null): Promise<string> {
  return resolveTransactionalBrandName({ tenantId: tenantId ?? null });
}

function formatBrlFromCents(cents: number): string {
  const n = Number(cents) || 0;
  return (n / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBr(isoOrDate: string | Date | null | undefined): string {
  if (isoOrDate == null || isoOrDate === '') return '';
  if (typeof isoOrDate === 'string') {
    const t = isoOrDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return formatYmdToPtBr(t);
  }
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
}

async function loadTenantTrialEndsAtIso(tenantId: string): Promise<string | null> {
  const r = await pool.query<{ t: string | null }>(
    `SELECT trial_ends_at::text AS t FROM tenants WHERE id = $1::uuid LIMIT 1`,
    [tenantId],
  );
  return r.rows[0]?.t ?? null;
}

/** Nome/slug oficiais lidos do banco no momento do envio (P0-F.1). */
async function loadOfficialTenantIdentityForNotify(
  tenantId: string,
): Promise<{ name: string; slug: string } | null> {
  const identity = await pool.query<{ name: string; slug: string }>(
    `SELECT name, slug FROM tenants WHERE id = $1::uuid LIMIT 1`,
    [tenantId],
  );
  const row = identity.rows[0];
  if (!row || isProvisionalOperationalSlug(row.slug) || isProvisionalOperationalName(row.name)) {
    return null;
  }
  return { name: row.name.trim(), slug: row.slug.trim() };
}

export async function publishPlatformAccountCreated(tenantId: string): Promise<void> {
  const official = await loadOfficialTenantIdentityForNotify(tenantId);
  if (!official) {
    pnLogWarn('platform_business_defer_account_created', {
      tenant_id: tenantId,
      event_key: 'platform.account.created',
    });
    return;
  }

  const admin = await loadPrimaryTenantAdminForNotify(pool, tenantId);
  if (!admin) {
    pnLogWarn('platform_business_skip_no_admin', { tenant_id: tenantId, event_key: 'platform.account.created' });
    return;
  }
  const fe = feBase();
  await publishPlatformBusinessEventMultiChannel({
    targetTenantId: tenantId,
    eventKey: 'platform.account.created',
    entityType: 'tenant',
    entityId: tenantId,
    idempotencyBaseKey: `platform:tenant:${tenantId}:account_created`,
    mergeContext: {
      'platform.name': await platformPublicName(tenantId),
      'platform.support_link': buildPlatformSupportLink(),
      'tenant.name': official.name,
      'tenant.admin_name': adminDisplayName(admin),
      'tenant.admin_email': admin.email ?? '',
      'tenant.admin_whatsapp': resolveRecipientWhatsapp(admin) ?? '',
      'auth.login_link': `${fe}/login`,
    },
    eventOccurredAt: new Date(),
  });
}

export async function publishPlatformBillingChargeCreated(billingId: string): Promise<void> {
  const row = await getInvoiceById(billingId);
  if (!row) return;
  const admin = await loadPrimaryTenantAdminForNotify(pool, row.tenant_id);
  if (!admin) return;
  let platformInvoiceUrl = '';
  try {
    const tok = await ensureTenantBillingPublicPayToken(billingId);
    platformInvoiceUrl = buildPlatformSaasInvoiceUrl(tok);
  } catch (e) {
    pnLogWarn('platform_billing_public_token_failed', { billing_id: billingId, error: String(e) });
  }
  const gatewayFallback = pickGatewayFallbackUrlFromBilling(row);
  await publishPlatformBusinessEventMultiChannel({
    targetTenantId: row.tenant_id,
    eventKey: 'platform.billing.charge.created',
    entityType: 'tenant_billing',
    entityId: billingId,
    idempotencyBaseKey: `platform:tenant_billing:${billingId}:charge_created`,
    mergeContext: {
      'platform.name': await platformPublicName(row.tenant_id),
      'tenant.name': admin.tenant_name,
      'tenant.admin_name': adminDisplayName(admin),
      'billing.amount': formatBrlFromCents(row.amount_cents),
      'billing.due_date': formatBillingDueDatePtBr(row.due_date),
      'billing.payment_link': gatewayFallback,
      'billing.platform_invoice_url': platformInvoiceUrl,
      'billing.invoice_number': row.invoice_number ?? '',
    },
    eventOccurredAt: new Date(),
    metadata: { billing_id: billingId },
  });
}

export async function publishPlatformBillingChargeOverdue(billingId: string): Promise<void> {
  const row = await getInvoiceById(billingId);
  if (!row || row.status !== 'overdue') return;
  const admin = await loadPrimaryTenantAdminForNotify(pool, row.tenant_id);
  if (!admin) return;
  let platformInvoiceUrl = '';
  try {
    const tok = await ensureTenantBillingPublicPayToken(billingId);
    platformInvoiceUrl = buildPlatformSaasInvoiceUrl(tok);
  } catch (e) {
    pnLogWarn('platform_billing_public_token_failed', { billing_id: billingId, error: String(e) });
  }
  const gatewayFallback = pickGatewayFallbackUrlFromBilling(row);
  await publishPlatformBusinessEventMultiChannel({
    targetTenantId: row.tenant_id,
    eventKey: 'platform.billing.charge.overdue',
    entityType: 'tenant_billing',
    entityId: billingId,
    idempotencyBaseKey: `platform:tenant_billing:${billingId}:charge_overdue`,
    mergeContext: {
      'platform.name': await platformPublicName(row.tenant_id),
      'platform.support_link': buildPlatformSupportLink(),
      'tenant.name': admin.tenant_name,
      'tenant.admin_name': adminDisplayName(admin),
      'billing.amount': formatBrlFromCents(row.amount_cents),
      'billing.due_date': formatBillingDueDatePtBr(row.due_date),
      'billing.payment_link': gatewayFallback,
      'billing.platform_invoice_url': platformInvoiceUrl,
      'billing.invoice_number': row.invoice_number ?? '',
    },
    eventOccurredAt: new Date(),
    metadata: { billing_id: billingId },
  });
}

export async function publishPlatformBillingPaymentConfirmed(billingId: string): Promise<void> {
  const row = await getInvoiceById(billingId);
  if (!row) {
    pnLogWarn('platform_business_payment_skip', { billing_id: billingId, reason: 'no_row' });
    return;
  }
  const paidLike = row.status === 'paid' || row.paid_at != null;
  if (!paidLike) {
    pnLogWarn('platform_business_payment_skip', {
      billing_id: billingId,
      reason: 'not_paid',
      status: row.status,
      has_paid_at: Boolean(row.paid_at),
    });
    return;
  }
  const admin = await loadPrimaryTenantAdminForNotify(pool, row.tenant_id);
  if (!admin) {
    pnLogWarn('platform_business_skip_no_admin', { tenant_id: row.tenant_id, event_key: 'platform.billing.payment_confirmed' });
    return;
  }
  const planName = row.plan_name_snapshot?.trim() || '';
  let planLabel = planName;
  if (!planLabel && row.plan_id) {
    const pr = await pool.query<{ name: string }>(`SELECT name FROM plans WHERE id = $1 LIMIT 1`, [row.plan_id]);
    planLabel = pr.rows[0]?.name ?? '';
  }
  const paidAt = row.paid_at ? new Date(row.paid_at) : new Date();
  const fe = feBase();
  await publishPlatformBusinessEventMultiChannel({
    targetTenantId: row.tenant_id,
    eventKey: 'platform.billing.payment_confirmed',
    entityType: 'tenant_billing',
    entityId: billingId,
    idempotencyBaseKey: `platform:tenant_billing:${billingId}:payment_confirmed`,
    mergeContext: {
      'platform.name': await platformPublicName(row.tenant_id),
      'platform.support_link': buildPlatformSupportLink(),
      'tenant.name': admin.tenant_name,
      'tenant.admin_name': adminDisplayName(admin),
      'tenant.admin_email': admin.email ?? '',
      'plan.name': planLabel,
      'billing.amount': formatBrlFromCents(row.amount_cents),
      'billing.invoice_number': row.invoice_number ?? '',
      'auth.login_link': `${fe}/login`,
    },
    eventOccurredAt: paidAt,
    metadata: { billing_id: billingId },
  });
}

export async function publishPlatformPlanActivated(params: { tenantId: string; billingId: string }): Promise<void> {
  const row = await getInvoiceById(params.billingId);
  if (!row || row.tenant_id !== params.tenantId) return;
  const admin = await loadPrimaryTenantAdminForNotify(pool, params.tenantId);
  if (!admin) {
    pnLogWarn('platform_business_skip_no_admin', { tenant_id: params.tenantId, event_key: 'platform.plan.activated' });
    return;
  }
  const planName = row.plan_name_snapshot?.trim() || '';
  let planLabel = planName;
  if (!planLabel && row.plan_id) {
    const pr = await pool.query<{ name: string }>(`SELECT name FROM plans WHERE id = $1 LIMIT 1`, [row.plan_id]);
    planLabel = pr.rows[0]?.name ?? '';
  }
  const fe = feBase();
  await publishPlatformBusinessEventMultiChannel({
    targetTenantId: params.tenantId,
    eventKey: 'platform.plan.activated',
    entityType: 'tenant',
    entityId: params.tenantId,
    idempotencyBaseKey: `platform:tenant:${params.tenantId}:plan_activated:${params.billingId}`,
    mergeContext: {
      'platform.name': await platformPublicName(params.tenantId),
      'platform.support_link': buildPlatformSupportLink(),
      'tenant.name': admin.tenant_name,
      'tenant.admin_name': adminDisplayName(admin),
      'plan.name': planLabel,
      'auth.login_link': `${fe}/login`,
    },
    eventOccurredAt: new Date(),
    metadata: { billing_id: params.billingId },
  });
}

export async function publishPlatformTrialStarted(tenantId: string): Promise<void> {
  const official = await loadOfficialTenantIdentityForNotify(tenantId);
  if (!official) {
    pnLogWarn('platform_business_defer_trial_started', {
      tenant_id: tenantId,
      event_key: 'platform.trial.started',
    });
    return;
  }

  const endsRaw = await loadTenantTrialEndsAtIso(tenantId);
  if (!endsRaw) {
    pnLogWarn('platform_trial_started_skip', { tenant_id: tenantId, reason: 'no_trial_ends_at' });
    return;
  }
  const admin = await loadPrimaryTenantAdminForNotify(pool, tenantId);
  if (!admin) {
    pnLogWarn('platform_business_skip_no_admin', { tenant_id: tenantId, event_key: 'platform.trial.started' });
    return;
  }
  const fe = feBase();
  const endsKey = endsRaw.slice(0, 10);
  await publishPlatformBusinessEventMultiChannel({
    targetTenantId: tenantId,
    eventKey: 'platform.trial.started',
    entityType: 'tenant',
    entityId: tenantId,
    idempotencyBaseKey: `platform:tenant:${tenantId}:trial_started:${endsKey}`,
    mergeContext: {
      'platform.name': await platformPublicName(tenantId),
      'platform.support_link': buildPlatformSupportLink(),
      'tenant.name': official.name,
      'tenant.admin_name': adminDisplayName(admin),
      'trial.ends_at': formatDateBr(endsRaw),
      'auth.login_link': `${fe}/login`,
    },
    eventOccurredAt: new Date(),
  });
}

export async function publishPlatformTrialEnded(tenantId: string): Promise<void> {
  const endsRaw = await loadTenantTrialEndsAtIso(tenantId);
  const admin = await loadPrimaryTenantAdminForNotify(pool, tenantId);
  if (!admin) {
    pnLogWarn('platform_business_skip_no_admin', { tenant_id: tenantId, event_key: 'platform.trial.ended' });
    return;
  }
  const fe = feBase();
  const endsKey = (endsRaw ?? '').slice(0, 10) || 'unknown';
  await publishPlatformBusinessEventMultiChannel({
    targetTenantId: tenantId,
    eventKey: 'platform.trial.ended',
    entityType: 'tenant',
    entityId: tenantId,
    idempotencyBaseKey: `platform:tenant:${tenantId}:trial_ended:${endsKey}`,
    mergeContext: {
      'platform.name': await platformPublicName(tenantId),
      'platform.support_link': buildPlatformSupportLink(),
      'tenant.name': admin.tenant_name,
      'tenant.admin_name': adminDisplayName(admin),
      'trial.ends_at': formatDateBr(endsRaw),
      'auth.login_link': `${fe}/login`,
    },
    eventOccurredAt: new Date(),
  });
}

export async function publishPlatformTrialExpiring(tenantId: string, daysLeft: number): Promise<void> {
  const endsRaw = await loadTenantTrialEndsAtIso(tenantId);
  if (!endsRaw) {
    pnLogWarn('platform_trial_expiring_skip', { tenant_id: tenantId, reason: 'no_trial_ends_at' });
    return;
  }
  const admin = await loadPrimaryTenantAdminForNotify(pool, tenantId);
  if (!admin) {
    pnLogWarn('platform_business_skip_no_admin', { tenant_id: tenantId, event_key: 'platform.trial.expiring' });
    return;
  }
  const fe = feBase();
  const endsKey = endsRaw.slice(0, 10);
  await publishPlatformBusinessEventMultiChannel({
    targetTenantId: tenantId,
    eventKey: 'platform.trial.expiring',
    entityType: 'tenant',
    entityId: tenantId,
    idempotencyBaseKey: `platform:tenant:${tenantId}:trial_expiring:${endsKey}`,
    mergeContext: {
      'platform.name': await platformPublicName(tenantId),
      'platform.support_link': buildPlatformSupportLink(),
      'tenant.name': admin.tenant_name,
      'tenant.admin_name': adminDisplayName(admin),
      'tenant.admin_email': admin.email ?? '',
      'trial.ends_at': formatDateBr(endsRaw),
      'trial.days_left': String(daysLeft),
      'auth.login_link': `${fe}/login`,
    },
    eventOccurredAt: new Date(),
  });
}

export function schedulePublishPlatformAccountCreated(tenantId: string): void {
  setImmediate(() => {
    void publishPlatformAccountCreated(tenantId).catch((e) =>
      console.error('[platform-notifications/business] account.created', e),
    );
  });
}

export function schedulePublishPlatformBillingChargeCreated(billingId: string): void {
  setImmediate(() => {
    void publishPlatformBillingChargeCreated(billingId).catch((e) =>
      console.error('[platform-notifications/business] charge.created', e),
    );
  });
}

export function schedulePublishPlatformBillingChargeOverdue(billingId: string): void {
  setImmediate(() => {
    void publishPlatformBillingChargeOverdue(billingId).catch((e) =>
      console.error('[platform-notifications/business] charge.overdue', e),
    );
  });
}

export function schedulePublishPlatformBillingPaymentConfirmed(billingId: string): void {
  setImmediate(() => {
    void publishPlatformBillingPaymentConfirmed(billingId).catch((e) =>
      console.error('[platform-notifications/business] payment_confirmed', e),
    );
  });
}

export function schedulePublishPlatformPlanActivated(params: { tenantId: string; billingId: string }): void {
  setImmediate(() => {
    void publishPlatformPlanActivated(params).catch((e) =>
      console.error('[platform-notifications/business] plan.activated', e),
    );
  });
}

export function schedulePublishPlatformTrialStarted(tenantId: string): void {
  // lifecycle shadow observation
  void import('../../lifecycle/lifecycleBillingObserver.js')
    .then(({ observeBillingLifecycleEventWithKanbanActual }) =>
      observeBillingLifecycleEventWithKanbanActual('trial.started', { tenantId }, 'platform.trial.started'),
    )
    .catch((e) => {
      const message = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : undefined;
      console.error('[lifecycle_billing_observe_import_error]', { message, stack });
    });
  setImmediate(() => {
    void publishPlatformTrialStarted(tenantId).catch((e) =>
      console.error('[platform-notifications/business] trial.started', e),
    );
  });
}

export function schedulePublishPlatformTrialEnded(tenantId: string): void {
  setImmediate(() => {
    void publishPlatformTrialEnded(tenantId).catch((e) =>
      console.error('[platform-notifications/business] trial.ended', e),
    );
  });
}

export function schedulePublishPlatformTrialExpiring(tenantId: string, daysLeft: number): void {
  setImmediate(() => {
    void publishPlatformTrialExpiring(tenantId, daysLeft).catch((e) =>
      console.error('[platform-notifications/business] trial.expiring', e),
    );
  });
}
