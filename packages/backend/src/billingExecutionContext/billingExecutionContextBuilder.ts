/**
 * Billing Engine 3.0 — BillingExecutionContextBuilder.
 */
import { getSubscriptionById } from '../services/billingSubscriptionService.js';
import { pool } from '../utils/db.js';
import { billingExecutionContextCache } from './contextCache.js';
import { certifyPlanAndItems } from './contextIndependenceGuard.js';
import {
  logContextCertified,
  logContextIndependence,
  logContextLegacyRejected,
} from './contextIndependenceLogger.js';
import { logBillingContext } from './contextLogger.js';
import { recordContextBuild } from './contextMetrics.js';
import { BillingExecutionContextError } from './errors.js';
import { resolvePlanAndItems } from './planItemResolver.js';
import { resolveBillingItems } from './resolveBillingItems.js';
import type {
  BillingExecutionContext,
  BuildBillingExecutionContextInput,
  ResolvedBillingPeriod,
  ResolvedContractContext,
  ResolvedCustomerContext,
  ResolvedGatewayContext,
  ResolvedHistoryContext,
  ResolvedNotificationContext,
  ResolvedTenantContext,
  ResolvedTimelineContext,
} from './types.js';
import type { SubscriptionRow } from '../services/billingSubscriptionService.js';

async function loadTenant(tenantId: string): Promise<ResolvedTenantContext> {
  const r = await pool.query<{ id: string; name: string | null }>(
    `SELECT id::text, name FROM tenants WHERE id = $1::uuid LIMIT 1`,
    [tenantId]
  );
  const row = r.rows[0];
  return { id: tenantId, name: row?.name ?? null };
}

async function loadCustomer(
  tenantId: string,
  customerId: string | null
): Promise<ResolvedCustomerContext | null> {
  if (!customerId) return null;
  const r = await pool.query<{ id: string; name: string; email: string | null }>(
    `SELECT c.id::text, c.name, c.email
     FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2::uuid
     WHERE c.id = $1::uuid
     LIMIT 1`,
    [customerId, tenantId]
  );
  const row = r.rows[0];
  if (!row) return { id: customerId, name: null, email: null };
  return { id: row.id, name: row.name, email: row.email };
}

function buildContract(subscription: SubscriptionRow): ResolvedContractContext {
  return {
    billing_interval: subscription.billing_interval,
    amount_cents: subscription.amount_cents,
    currency: subscription.currency,
    trial_until: subscription.current_period_end?.slice(0, 10) ?? null,
    status: subscription.status,
    metadata: {
      contracted_billing_interval: subscription.contracted_billing_interval ?? null,
      contracted_plan_price_cents: subscription.contracted_plan_price_cents ?? null,
      pricing_snapshot_source: subscription.pricing_snapshot_source ?? null,
    },
  };
}

function buildPeriod(
  subscription: SubscriptionRow,
  input: BuildBillingExecutionContextInput
): ResolvedBillingPeriod {
  const periodEnd =
    input.periodEndYmd?.slice(0, 10) ??
    subscription.current_period_end?.slice(0, 10) ??
    null;
  return {
    cycleKey: input.cycleKey,
    periodStart: input.periodStartYmd,
    periodEnd,
    dueDate: input.periodStartYmd,
    nextGeneration: subscription.next_billing_date?.slice(0, 10) ?? null,
    anchor: subscription.billing_anchor_day,
    interval: subscription.billing_interval,
    frequency: 1,
  };
}

function buildGateway(
  subscription: SubscriptionRow,
  planCurrency: string,
  totalCents: number
): ResolvedGatewayContext {
  return {
    provider: subscription.gateway,
    currency: planCurrency || subscription.currency || 'BRL',
    paymentMethod: subscription.default_payment_method,
    fees: 0,
    gatewayMetadata: {
      simulated: true,
      amount_cents: totalCents,
    },
  };
}

function buildNotifications(
  subscription: SubscriptionRow,
  customer: ResolvedCustomerContext | null
): ResolvedNotificationContext {
  return {
    channels: ['email'],
    templates: ['crm_invoice_charge'],
    recipient: customer?.email ?? customer?.id ?? subscription.customer_id,
    language: 'pt-BR',
    variables: {
      subscription_id: subscription.id,
      customer_id: subscription.customer_id,
    },
  };
}

function emptyTimeline(): ResolvedTimelineContext {
  return { events: [] };
}

function emptyHistory(): ResolvedHistoryContext {
  return { changes: [] };
}

export class BillingExecutionContextBuilder {
  async build(input: BuildBillingExecutionContextInput): Promise<BillingExecutionContext> {
    const started = Date.now();
    const logBase = {
      correlation_id: input.correlationId,
      subscription_id: input.subscriptionId,
    };

    if (!input.skipCache) {
      const cached = billingExecutionContextCache.get(
        input.subscriptionId,
        input.cycleKey,
        input.correlationId
      );
      if (cached) {
        logBillingContext('COMPLETE', { ...logBase, duration_ms: 0, cache_hit: true });
        recordContextBuild({ durationMs: 0, cacheHit: true, warnings: 0, errors: 0 });
        return cached;
      }
    }

    logBillingContext('BUILD_START', { ...logBase, cache_miss: true });
    logContextIndependence('build_start', logBase);

    const warnings: string[] = [];
    const errors: string[] = [];
    const sources: Record<string, string> = {};

    const subscription = await getSubscriptionById(input.subscriptionId);
    if (!subscription || subscription.tenant_id !== input.tenantId) {
      logBillingContext('ERROR', {
        ...logBase,
        duration_ms: Date.now() - started,
        error: 'subscription_not_found',
      });
      recordContextBuild({
        durationMs: Date.now() - started,
        cacheHit: false,
        warnings: 0,
        errors: 1,
        failed: true,
      });
      throw new Error('billing_execution_context_subscription_not_found');
    }

    logBillingContext('SUBSCRIPTION', logBase);

    let planResolution;
    try {
      const [tenant, resolution] = await Promise.all([
        loadTenant(input.tenantId),
        resolvePlanAndItems({ subscription, periodStartYmd: input.periodStartYmd }),
      ]);
      planResolution = { tenant, resolution };
    } catch (error) {
      const code =
        error instanceof BillingExecutionContextError ? error.code : 'CONTEXT_BUILD_FAILED';
      logContextLegacyRejected(logBase, code);
      logBillingContext('ERROR', {
        ...logBase,
        duration_ms: Date.now() - started,
        error: code,
      });
      recordContextBuild({
        durationMs: Date.now() - started,
        cacheHit: false,
        warnings: 0,
        errors: 1,
        failed: true,
      });
      throw error;
    }

    const { tenant, resolution: planRes } = planResolution;

    sources.plan = planRes.planSource;
    logBillingContext('PLAN', logBase, { plan_source: planRes.planSource });
    logBillingContext('ITEMS', logBase, { item_count: planRes.billingItems.length });

    const resolvedItems = resolveBillingItems(planRes.billingItems);
    logBillingContext('RESOLVED_ITEMS', logBase, { resolved_count: resolvedItems.length });

    if (resolvedItems.length === 0) {
      const err = new BillingExecutionContextError(
        'Nenhum item elegível após resolução do Billing Plan',
        'NO_ELIGIBLE_ITEMS'
      );
      logContextLegacyRejected(logBase, err.code);
      recordContextBuild({
        durationMs: Date.now() - started,
        cacheHit: false,
        warnings: 0,
        errors: 1,
        failed: true,
      });
      throw err;
    }

    const certification = certifyPlanAndItems(planRes.billingPlan, planRes.billingItems);

    const customer = await loadCustomer(input.tenantId, subscription.customer_id);
    const contract = buildContract(subscription);
    const period = buildPeriod(subscription, input);
    logBillingContext('DATES', logBase);

    const totalCents = resolvedItems.reduce((sum, it) => sum + it.item.total_amount, 0);
    const gateway = buildGateway(subscription, planRes.billingPlan.currency, totalCents);
    logBillingContext('GATEWAY', logBase);

    const notifications = buildNotifications(subscription, customer);
    logBillingContext('NOTIFICATION', logBase);

    const durationMs = Date.now() - started;
    const billing_plan_present = true;
    const billing_items_present = planRes.billingItems.length > 0;
    const engineReady =
      billing_plan_present && billing_items_present && resolvedItems.length > 0 && certification.context_certified;

    const context: BillingExecutionContext = {
      subscription,
      tenant,
      customer,
      billingPlan: planRes.billingPlan,
      billingPlans: planRes.billingPlans,
      billingItems: planRes.billingItems,
      resolvedItems,
      contract,
      cycle: input.cycleKey,
      period,
      dates: {
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        dueDate: period.dueDate,
        nextBilling: subscription.next_billing_date?.slice(0, 10) ?? period.dueDate,
        trialUntil: planRes.billingPlan.trial_until,
      },
      gateway,
      notifications,
      timeline: emptyTimeline(),
      history: emptyHistory(),
      featureFlags: {},
      metadata: {
        correlation_id: input.correlationId ?? null,
        execution_mode: input.executionMode ?? null,
        plan_source: 'persisted_plan',
        has_persisted_plan: true,
        context_certified: certification.context_certified,
      },
      diagnostics: {
        contextBuildTime: durationMs,
        warnings,
        errors,
        sources,
        shadowReady: resolvedItems.length > 0,
        consistencyReady: certification.context_certified,
        engineReady,
        cacheHit: false,
        billing_plan_present,
        billing_items_present,
        context_certified: certification.context_certified,
        context_pure: certification.context_pure,
        legacy_dependencies_detected: certification.legacy_dependencies_detected,
      },
    };

    billingExecutionContextCache.set(
      input.subscriptionId,
      input.cycleKey,
      context,
      input.correlationId
    );

    logContextCertified(logBase);
    logContextIndependence('build_complete', logBase, {
      context_certified: certification.context_certified,
      item_count: planRes.billingItems.length,
    });
    logBillingContext('COMPLETE', { ...logBase, duration_ms: durationMs, cache_miss: true });
    recordContextBuild({
      durationMs,
      cacheHit: false,
      warnings: warnings.length,
      errors: errors.length,
    });

    return context;
  }
}

export const billingExecutionContextBuilder = new BillingExecutionContextBuilder();
