/**
 * Billing Platform 4.0 — HTTP API (foundation stubs).
 */
import { Response } from 'express';
import type { AuthRequest } from '../../middleware/auth.js';
import { buildAnalyticsSnapshotFoundation } from '../analytics/analyticsService.js';
import { buildForecastModelFoundation } from '../forecasting/forecastService.js';
import { buildIntelligenceProfileFoundation } from '../intelligence/intelligenceService.js';
import { getRecentBillingPlatformEvents } from '../events/billingEventBus.js';
import { BILLING_PLATFORM_EVENT_TYPES } from '../events/types.js';
import { getBillingPlatformManifest } from '../platformManifest.js';
import { describeRecoveryArchitectureFoundation } from '../recovery/recoveryService.js';
import { listReportContracts } from '../reports/types.js';
import { getPlatformObservabilityBridge } from '../shared/observabilityBridge.js';
import { BILLING_AUTOMATION_REFERENCE_WORKFLOW } from '../automation/types.js';
import {
  billingPlanProvisionService,
  getBillingProvisionMetrics,
  buildProvisionHealthDashboard,
} from '../provisioning/index.js';
import { BillingPlanProvisionError } from '../provisioning/types.js';

function tenantId(req: AuthRequest): string {
  return req.tenantId ?? '';
}

export async function getPlatformRoot(_req: AuthRequest, res: Response): Promise<void> {
  res.json(getBillingPlatformManifest());
}

export async function getPlatformAnalytics(req: AuthRequest, res: Response): Promise<void> {
  const tid = tenantId(req);
  if (!tid) {
    res.status(400).json({ error: 'tenant_required' });
    return;
  }
  res.json(buildAnalyticsSnapshotFoundation(tid));
}

export async function getPlatformReports(_req: AuthRequest, res: Response): Promise<void> {
  res.json({ reports: listReportContracts() });
}

export async function getPlatformForecast(req: AuthRequest, res: Response): Promise<void> {
  const tid = tenantId(req);
  if (!tid) {
    res.status(400).json({ error: 'tenant_required' });
    return;
  }
  res.json(buildForecastModelFoundation(tid));
}

export async function getPlatformRecovery(req: AuthRequest, res: Response): Promise<void> {
  const tid = tenantId(req);
  if (!tid) {
    res.status(400).json({ error: 'tenant_required' });
    return;
  }
  res.json(describeRecoveryArchitectureFoundation(tid));
}

export async function getPlatformEvents(_req: AuthRequest, res: Response): Promise<void> {
  res.json({
    event_types: BILLING_PLATFORM_EVENT_TYPES,
    recent: getRecentBillingPlatformEvents(20),
  });
}

export async function getPlatformIntelligence(req: AuthRequest, res: Response): Promise<void> {
  const tid = tenantId(req);
  if (!tid) {
    res.status(400).json({ error: 'tenant_required' });
    return;
  }
  res.json(buildIntelligenceProfileFoundation({ tenantId: tid }));
}

export async function getPlatformAutomation(_req: AuthRequest, res: Response): Promise<void> {
  res.json({
    status: 'foundation',
    reference_workflow: BILLING_AUTOMATION_REFERENCE_WORKFLOW,
  });
}

export async function getPlatformObservability(req: AuthRequest, res: Response): Promise<void> {
  try {
    const includeAudit = req.query.audit === '1' || req.query.audit === 'true';
    const bridge = await getPlatformObservabilityBridge({ includeAudit });
    res.json({
      ...bridge,
      provisioning: getBillingProvisionMetrics(),
      provision_health: buildProvisionHealthDashboard(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg || 'observability_bridge_error' });
  }
}

export async function postProvisionSubscription(req: AuthRequest, res: Response): Promise<void> {
  const tid = tenantId(req);
  const subscriptionId = String(req.params.id ?? '').trim();
  if (!tid || !subscriptionId) {
    res.status(400).json({ error: 'tenant_and_subscription_required' });
    return;
  }
  try {
    const result = await billingPlanProvisionService.provision(subscriptionId, { tenantId: tid });
    res.json(result);
  } catch (e: unknown) {
    if (e instanceof BillingPlanProvisionError) {
      res.status(400).json({ error: e.code, message: e.message, details: e.details });
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg || 'provision_error' });
  }
}

export async function postRepairSubscription(req: AuthRequest, res: Response): Promise<void> {
  const tid = tenantId(req);
  const subscriptionId = String(req.params.id ?? '').trim();
  if (!tid || !subscriptionId) {
    res.status(400).json({ error: 'tenant_and_subscription_required' });
    return;
  }
  try {
    const result = await billingPlanProvisionService.repair(subscriptionId, { tenantId: tid });
    res.json(result);
  } catch (e: unknown) {
    if (e instanceof BillingPlanProvisionError) {
      res.status(400).json({ error: e.code, message: e.message, details: e.details });
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg || 'repair_error' });
  }
}

export async function getProvisionStatus(req: AuthRequest, res: Response): Promise<void> {
  const tid = tenantId(req);
  const subscriptionId = String(req.params.id ?? '').trim();
  if (!tid || !subscriptionId) {
    res.status(400).json({ error: 'tenant_and_subscription_required' });
    return;
  }
  try {
    const status = await billingPlanProvisionService.validate(subscriptionId, { tenantId: tid });
    res.json(status);
  } catch (e: unknown) {
    if (e instanceof BillingPlanProvisionError) {
      res.status(400).json({ error: e.code, message: e.message, details: e.details });
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg || 'provision_status_error' });
  }
}
