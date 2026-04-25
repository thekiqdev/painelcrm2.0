/**
 * Fase 3 — publicação de eventos reais da plataforma (domínio separado do motor do tenant).
 */
import type { Pool } from 'pg';
import { pool } from '../../utils/db.js';
import { runPlatformTransactionalNotification } from './platformNotificationEngineOrchestrator.js';
import {
  isPlatformNotificationsEnabled,
  isPlatformNotificationsBusinessEventsEnabled,
} from '../../config/platformNotificationsEnv.js';
import { ensureTenantBillingPublicPayToken, getInvoiceById } from '../invoiceService.js';
import { pnLogInfo, pnLogWarn } from './platformNotificationLog.js';
import { normalizeWhatsappDigits } from '../../utils/userIdentity.js';
import { pickGatewayFallbackUrlFromBilling } from '../saasBillingLinkHelpers.js';
import { buildPlatformSaasInvoiceUrl } from '../../utils/saasPlatformInvoiceUrl.js';
import { formatBillingDueDatePtBr, formatYmdToPtBr } from '../../utils/calendarDateBr.js';

const ACTOR_SYSTEM = { type: 'system', source: 'platform_business_events' };

function feBase(): string {
  return String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function platformPublicName(): string {
  return (process.env.APP_PUBLIC_NAME || 'PainelCRM').trim() || 'PainelCRM';
}

function platformSupportLink(): string {
  const s = process.env.PLATFORM_SUPPORT_URL?.trim();
  if (s) return s.replace(/\/$/, '');
  return feBase();
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

function shouldPublish(): boolean {
  return isPlatformNotificationsEnabled() && isPlatformNotificationsBusinessEventsEnabled();
}

export type TenantAdminNotifyRow = {
  user_id: string;
  email: string;
  whatsapp_digits: string | null;
  first_name: string | null;
  last_name: string | null;
  tenant_name: string;
  billing_phone: string | null;
};

export async function loadPrimaryTenantAdminForNotify(client: Pool, tenantId: string): Promise<TenantAdminNotifyRow | null> {
  const r = await client.query<TenantAdminNotifyRow>(
    `SELECT u.id::text AS user_id, u.email,
            regexp_replace(
              COALESCE(
                NULLIF(trim(COALESCE(u.whatsapp_number, '')), ''),
                NULLIF(trim(COALESCE(p.whatsapp_number, '')), ''),
                ''
              ),
              '\\D', '', 'g'
            ) AS whatsapp_digits,
            p.first_name, p.last_name,
            t.name AS tenant_name,
            regexp_replace(COALESCE(t.billing_phone, ''), '\\D', '', 'g') AS billing_phone
     FROM users u
     INNER JOIN tenants t ON t.id = u.tenant_id
     LEFT JOIN profiles p ON p.id = u.id
     WHERE u.tenant_id = $1::uuid
     ORDER BY u.created_at ASC
     LIMIT 1`,
    [tenantId],
  );
  return r.rows[0] ?? null;
}

function resolveRecipientWhatsapp(row: TenantAdminNotifyRow): string | null {
  const fromUser = normalizeWhatsappDigits(row.whatsapp_digits);
  if (fromUser) return fromUser;
  const fromBilling = normalizeWhatsappDigits(row.billing_phone);
  return fromBilling;
}

function adminDisplayName(row: TenantAdminNotifyRow): string {
  const fn = (row.first_name ?? '').trim();
  const ln = (row.last_name ?? '').trim();
  const joined = [fn, ln].filter(Boolean).join(' ').trim();
  if (joined) return joined;
  return row.email?.trim() || 'Administrador';
}

async function publishEvent(params: {
  targetTenantId: string;
  eventKey: string;
  entityType: string;
  entityId: string | null;
  idempotencyKey: string;
  mergeContext: Record<string, string>;
  eventOccurredAt: Date | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!shouldPublish()) {
    return;
  }
  const admin = await loadPrimaryTenantAdminForNotify(pool, params.targetTenantId);
  if (!admin) {
    pnLogWarn('platform_business_skip_no_admin', { tenant_id: params.targetTenantId, event_key: params.eventKey });
    return;
  }
  const phone = resolveRecipientWhatsapp(admin);
  if (!phone) {
    pnLogWarn('platform_business_skip_no_whatsapp', { tenant_id: params.targetTenantId, event_key: params.eventKey });
    return;
  }

  const res = await runPlatformTransactionalNotification({
    pool,
    targetTenantId: params.targetTenantId,
    eventKey: params.eventKey,
    entityType: params.entityType,
    entityId: params.entityId,
    idempotencyKey: params.idempotencyKey,
    recipientPhone: phone,
    recipientType: 'tenant_admin',
    mergeContext: params.mergeContext,
    eventOccurredAt: params.eventOccurredAt,
    actor: ACTOR_SYSTEM,
    metadata: { engine: 'platform_notifications', phase: 3, ...(params.metadata ?? {}) },
  });

  if (!res.ok) {
    pnLogWarn('platform_business_publish_failed', {
      tenant_id: params.targetTenantId,
      event_key: params.eventKey,
      error: res.error,
    });
    return;
  }
  pnLogInfo('platform_business_publish_ok', {
    tenant_id: params.targetTenantId,
    event_key: params.eventKey,
    delivery_id: res.deliveryId,
    duplicate: res.duplicate,
    status: res.status,
  });
}

export async function publishPlatformAccountCreated(tenantId: string): Promise<void> {
  const admin = await loadPrimaryTenantAdminForNotify(pool, tenantId);
  if (!admin) {
    pnLogWarn('platform_business_skip_no_admin', { tenant_id: tenantId, event_key: 'platform.account.created' });
    return;
  }
  const fe = feBase();
  await publishEvent({
    targetTenantId: tenantId,
    eventKey: 'platform.account.created',
    entityType: 'tenant',
    entityId: tenantId,
    idempotencyKey: `platform:tenant:${tenantId}:account_created`,
    mergeContext: {
      'platform.name': platformPublicName(),
      'platform.support_link': platformSupportLink(),
      'tenant.name': admin.tenant_name,
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
  await publishEvent({
    targetTenantId: row.tenant_id,
    eventKey: 'platform.billing.charge.created',
    entityType: 'tenant_billing',
    entityId: billingId,
    idempotencyKey: `platform:tenant_billing:${billingId}:charge_created`,
    mergeContext: {
      'platform.name': platformPublicName(),
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
  await publishEvent({
    targetTenantId: row.tenant_id,
    eventKey: 'platform.billing.payment_confirmed',
    entityType: 'tenant_billing',
    entityId: billingId,
    idempotencyKey: `platform:tenant_billing:${billingId}:payment_confirmed`,
    mergeContext: {
      'platform.name': platformPublicName(),
      'platform.support_link': platformSupportLink(),
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
  await publishEvent({
    targetTenantId: params.tenantId,
    eventKey: 'platform.plan.activated',
    entityType: 'tenant',
    entityId: params.tenantId,
    idempotencyKey: `platform:tenant:${params.tenantId}:plan_activated:${params.billingId}`,
    mergeContext: {
      'platform.name': platformPublicName(),
      'platform.support_link': platformSupportLink(),
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
  await publishEvent({
    targetTenantId: tenantId,
    eventKey: 'platform.trial.started',
    entityType: 'tenant',
    entityId: tenantId,
    idempotencyKey: `platform:tenant:${tenantId}:trial_started:${endsKey}`,
    mergeContext: {
      'platform.name': platformPublicName(),
      'platform.support_link': platformSupportLink(),
      'tenant.name': admin.tenant_name,
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
  await publishEvent({
    targetTenantId: tenantId,
    eventKey: 'platform.trial.ended',
    entityType: 'tenant',
    entityId: tenantId,
    idempotencyKey: `platform:tenant:${tenantId}:trial_ended:${endsKey}`,
    mergeContext: {
      'platform.name': platformPublicName(),
      'platform.support_link': platformSupportLink(),
      'tenant.name': admin.tenant_name,
      'tenant.admin_name': adminDisplayName(admin),
      'trial.ends_at': formatDateBr(endsRaw),
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
