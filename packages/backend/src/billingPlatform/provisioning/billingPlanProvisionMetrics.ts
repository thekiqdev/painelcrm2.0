export type BillingProvisionMetricsSnapshot = {
  /** @deprecated use billing_plan_created */
  billing_plans_created: number;
  billing_plan_created: number;
  /** @deprecated use billing_plan_repaired */
  billing_plans_repaired: number;
  billing_plan_repaired: number;
  billing_plan_syncs: number;
  billing_items_created: number;
  billing_items_repaired: number;
  billing_plan_validation_errors: number;
  provision_runtime_errors: number;
  provision_sql_errors: number;
  tenant_resolution_errors: number;
  billing_plan_auto_provision_time_ms_total: number;
  billing_plan_auto_provision_count: number;
};

const metrics: BillingProvisionMetricsSnapshot = {
  billing_plans_created: 0,
  billing_plan_created: 0,
  billing_plans_repaired: 0,
  billing_plan_repaired: 0,
  billing_plan_syncs: 0,
  billing_items_created: 0,
  billing_items_repaired: 0,
  billing_plan_validation_errors: 0,
  provision_runtime_errors: 0,
  provision_sql_errors: 0,
  tenant_resolution_errors: 0,
  billing_plan_auto_provision_time_ms_total: 0,
  billing_plan_auto_provision_count: 0,
};

function bumpPlanCreated(): void {
  metrics.billing_plan_created += 1;
  metrics.billing_plans_created = metrics.billing_plan_created;
}

function bumpPlanRepaired(): void {
  metrics.billing_plan_repaired += 1;
  metrics.billing_plans_repaired = metrics.billing_plan_repaired;
}

export function recordBillingPlanCreated(): void {
  bumpPlanCreated();
}

export function recordBillingPlanRepaired(): void {
  bumpPlanRepaired();
}

export function recordBillingItemsCreated(count = 1): void {
  metrics.billing_items_created += Math.max(1, count);
}

export function recordBillingItemsRepaired(count = 1): void {
  metrics.billing_items_repaired += Math.max(1, count);
}

export function recordBillingPlanSync(): void {
  metrics.billing_plan_syncs += 1;
}

export function recordBillingPlanValidationError(): void {
  metrics.billing_plan_validation_errors += 1;
}

export function recordProvisionRuntimeError(): void {
  metrics.provision_runtime_errors += 1;
}

export function recordProvisionSqlError(): void {
  metrics.provision_sql_errors += 1;
}

export function recordTenantResolutionError(): void {
  metrics.tenant_resolution_errors += 1;
}

export function recordBillingPlanProvisionDuration(ms: number): void {
  metrics.billing_plan_auto_provision_time_ms_total += Math.max(0, ms);
  metrics.billing_plan_auto_provision_count += 1;
}

export function getBillingProvisionMetrics(): BillingProvisionMetricsSnapshot {
  return { ...metrics };
}

export function resetBillingProvisionMetricsForTests(): void {
  metrics.billing_plans_created = 0;
  metrics.billing_plan_created = 0;
  metrics.billing_plans_repaired = 0;
  metrics.billing_plan_repaired = 0;
  metrics.billing_plan_syncs = 0;
  metrics.billing_items_created = 0;
  metrics.billing_items_repaired = 0;
  metrics.billing_plan_validation_errors = 0;
  metrics.provision_runtime_errors = 0;
  metrics.provision_sql_errors = 0;
  metrics.tenant_resolution_errors = 0;
  metrics.billing_plan_auto_provision_time_ms_total = 0;
  metrics.billing_plan_auto_provision_count = 0;
}

export type BillingProvisionHealthSnapshot = {
  status: 'healthy' | 'degraded' | 'critical';
  provision_health_score: number;
  metrics: BillingProvisionMetricsSnapshot;
  signals: string[];
};

export function buildProvisionHealthDashboard(): BillingProvisionHealthSnapshot {
  const m = getBillingProvisionMetrics();
  const signals: string[] = [];
  let score = 100;

  if (m.provision_runtime_errors > 0) {
    signals.push('provision_runtime_errors');
    score -= Math.min(40, m.provision_runtime_errors * 5);
  }
  if (m.provision_sql_errors > 0) {
    signals.push('provision_sql_errors');
    score -= Math.min(30, m.provision_sql_errors * 5);
  }
  if (m.tenant_resolution_errors > 0) {
    signals.push('tenant_resolution_errors');
    score -= Math.min(25, m.tenant_resolution_errors * 5);
  }
  if (m.billing_plan_validation_errors > 0) {
    signals.push('billing_plan_validation_errors');
    score -= Math.min(20, m.billing_plan_validation_errors * 2);
  }

  const status: BillingProvisionHealthSnapshot['status'] =
    score >= 85 ? 'healthy' : score >= 60 ? 'degraded' : 'critical';

  return {
    status,
    provision_health_score: Math.max(0, score),
    metrics: m,
    signals,
  };
}
