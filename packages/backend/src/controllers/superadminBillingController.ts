/**
 * Super Admin – relatórios e configurações de cobrança (Billing Engine Fase 3).
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { getBillingSettings, updateBillingSettings } from '../services/billingSettingsService.js';
import {
  getSubscriptionCyclesSuperadminSettings,
  updateSubscriptionCyclesSuperadminSettings,
} from '../services/subscriptionCyclesSuperadminSettingsService.js';
import {
  getBillingRecurringJobsStatusSummary,
  listBillingRecurringJobsForOps,
} from '../services/billingRecurringJobsOpsService.js';
import { getBillingOpsHeartbeats } from '../services/billingOpsHeartbeatService.js';
import {
  getBillingHealthSnapshot,
  runBillingRecovery,
  isBillingRecoveryDryRun,
} from '../services/billingRecoveryService.js';
import { billingEngineHealth } from '../services/billingEngineHealthService.js';
import { getBillingShadowReportForSubscription } from '../internal-tools/billing-migration/billingShadow/billingShadowReportService.js';
import {
  getBillingConsistencyDashboard,
  getBillingConsistencyReportForSubscription,
  runBillingConsistencyValidation,
} from '../billingConsistency/billingConsistencyReportService.js';
import {
  getBillingExecutionContextForSubscription,
  rebuildBillingExecutionContext,
  getBillingExecutionContextDashboard,
} from '../billingExecutionContext/billingExecutionContextService.js';
import {
  projectBillingForSubscription,
  compareProjectionWithLegacy,
  getBillingProjectionDashboard,
} from '../billingProjection/projectionService.js';
import {
  evaluateTenantMigrationReadiness,
  getMigrationReadinessReportForTenant,
  getMigrationReadinessDashboard,
} from '../internal-tools/billing-migration/billingMigrationReadiness/billingMigrationReadinessService.js';
import {
  runMigrationSimulation,
  getMigrationSimulationForTenant,
  getMigrationSimulatorDashboard,
  serializeSimulationDashboard,
} from '../internal-tools/billing-migration/billingMigrationSimulator/billingMigrationSimulatorService.js';
import {
  evaluateTenantCutover,
  getCutoverReportForTenant,
  getCutoverDashboard,
} from '../internal-tools/billing-migration/billingCutover/billingCutoverService.js';
import {
  certifySubscriptionById,
  getCertificationReportForSubscription,
  getCertificationDashboard,
  runFullCertificationSuite,
} from '../internal-tools/billing-migration/billingCertification/billingCertificationService.js';
import { getBillingObservabilityReport } from '../billingObservability/billingObservabilityService.js';
import { getSubscriptionById } from '../services/billingSubscriptionService.js';
import { z } from 'zod';

/** GET /api/superadmin/billing/subscriptions – assinaturas ativas (saas). */
export async function getBillingSubscriptions(req: AuthRequest, res: Response): Promise<void> {
  try {
    const r = await pool.query(
      `SELECT s.id, s.tenant_id, s.plan_id, s.amount_cents, s.billing_interval, s.status, s.next_billing_date,
              s.current_period_start, s.current_period_end, s.cancel_at_period_end, s.last_job_at, s.created_at,
              t.company_name AS tenant_name,
              p.name AS plan_name
       FROM subscriptions s
       JOIN tenants t ON t.id = s.tenant_id
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE s.type = 'saas'
       ORDER BY s.next_billing_date ASC`
    );
    res.json({ subscriptions: r.rows });
  } catch (e: any) {
    console.error('[getBillingSubscriptions]', e);
    res.status(500).json({ error: e.message || 'Erro ao listar assinaturas' });
  }
}

/** GET /api/superadmin/billing/upcoming – próximas cobranças (next_billing_date nos próximos N dias). */
export async function getBillingUpcoming(req: AuthRequest, res: Response): Promise<void> {
  try {
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || 30), 10) || 30));
    const r = await pool.query(
      `SELECT s.id, s.tenant_id, s.plan_id, s.amount_cents, s.billing_interval, s.next_billing_date,
              t.company_name AS tenant_name, p.name AS plan_name
       FROM subscriptions s
       JOIN tenants t ON t.id = s.tenant_id
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE s.type = 'saas' AND s.status = 'active'
         AND s.next_billing_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1::int || ' days')::interval
       ORDER BY s.next_billing_date ASC`,
      [days]
    );
    res.json({ upcoming: r.rows, days });
  } catch (e: any) {
    console.error('[getBillingUpcoming]', e);
    res.status(500).json({ error: e.message || 'Erro ao listar próximas cobranças' });
  }
}

/** GET /api/superadmin/billing/jobs-failed – jobs com status failed. */
export async function getBillingJobsFailed(req: AuthRequest, res: Response): Promise<void> {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || 50), 10) || 50));
    const r = await pool.query(
      `SELECT j.id, j.subscription_id, j.tenant_id, j.cycle_key, j.scheduled_at, j.attempts, j.max_attempts,
              j.error_message, j.created_at, j.updated_at,
              t.company_name AS tenant_name
       FROM billing_recurring_jobs j
       JOIN tenants t ON t.id = j.tenant_id
       WHERE j.status = 'failed'
       ORDER BY j.updated_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ jobs: r.rows });
  } catch (e: any) {
    console.error('[getBillingJobsFailed]', e);
    res.status(500).json({ error: e.message || 'Erro ao listar jobs com falha' });
  }
}

/** GET /api/superadmin/billing/settings – configurações de cobrança. */
export async function getBillingSettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const settings = await getBillingSettings();
    res.json(settings);
  } catch (e: any) {
    console.error('[getBillingSettings]', e);
    res.status(500).json({ error: e.message || 'Erro ao carregar configurações' });
  }
}

const updateSettingsSchema = z.object({
  grace_period_days: z.number().int().min(0).max(90).optional(),
  auto_suspend_enabled: z.boolean().optional(),
});

/** GET /api/superadmin/billing/recurring-jobs — diagnóstico operacional (CRM + SaaS). */
export async function getBillingRecurringJobsOps(req: AuthRequest, res: Response): Promise<void> {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || 100), 10) || 100));
    const windowDays = Math.min(365, Math.max(1, parseInt(String(req.query.window_days || 30), 10) || 30));
    const sinceDaysRaw = req.query.since_days;
    const sinceDays =
      sinceDaysRaw === undefined || sinceDaysRaw === ''
        ? null
        : Math.min(365, Math.max(1, parseInt(String(sinceDaysRaw), 10) || 30));
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const [summary, jobs, process_heartbeats] = await Promise.all([
      getBillingRecurringJobsStatusSummary(windowDays),
      listBillingRecurringJobsForOps({ limit, status, since_days: sinceDays }),
      getBillingOpsHeartbeats(),
    ]);
    res.json({
      summary,
      jobs,
      process_heartbeats,
      query: { limit, window_days: windowDays, since_days: sinceDays, status },
    });
  } catch (e: any) {
    console.error('[getBillingRecurringJobsOps]', e);
    res.status(500).json({ error: e.message || 'Erro ao listar jobs de recorrência' });
  }
}

/** PUT /api/superadmin/billing/settings – atualizar configurações de cobrança. */
export async function putBillingSettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const settings = await updateBillingSettings(parsed.data);
    res.json(settings);
  } catch (e: any) {
    console.error('[putBillingSettings]', e);
    res.status(500).json({ error: e.message || 'Erro ao salvar configurações' });
  }
}

const subscriptionCyclesFlagsSchema = z.object({
  subscription_cycles_read: z.boolean(),
  subscription_cycles_write: z.boolean(),
});

/** GET /api/superadmin/billing/subscription-cycles-flags */
export async function getSubscriptionCyclesFlagsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const settings = await getSubscriptionCyclesSuperadminSettings();
    res.json(settings);
  } catch (e: any) {
    console.error('[getSubscriptionCyclesFlags]', e);
    res.status(500).json({ error: e.message || 'Erro ao carregar flags de ciclos' });
  }
}

/** GET /api/superadmin/billing/health — recovery engine snapshot + health score. */
export async function getBillingHealthHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const full = req.query.full === '1' || req.query.full === 'true';
    const health = full ? await billingEngineHealth() : await getBillingHealthSnapshot();
    res.json(health);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingHealth]', e);
    res.status(500).json({ error: msg || 'Erro ao carregar saúde do billing' });
  }
}

/** GET /api/superadmin/billing/observability — dashboard + health + métricas pipeline. */
export async function getBillingObservabilityHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const includeAudit = req.query.audit === '1' || req.query.audit === 'true';
    const report = await getBillingObservabilityReport({ includeAudit });
    res.json(report);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingObservability]', e);
    res.status(500).json({ error: msg || 'Erro ao carregar observabilidade do billing' });
  }
}

/** @deprecated Sprint 3.2B — use getBillingObservabilityHandler */
export const getBillingV2ObservabilityHandler = getBillingObservabilityHandler;

/** GET /api/superadmin/billing/engine-health — auditoria completa Fase 1B (somente diagnóstico). */
export async function getBillingEngineHealthHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const report = await billingEngineHealth();
    res.json(report);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingEngineHealth]', e);
    res.status(500).json({ error: msg || 'Erro na auditoria do motor de billing' });
  }
}

/** GET /api/superadmin/billing/shadow-report/:subscriptionId — último relatório Shadow Mode. */
export async function getBillingShadowReportHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const subscriptionId = String(req.params.subscriptionId ?? '').trim();
    if (!subscriptionId) {
      res.status(400).json({ error: 'subscriptionId obrigatório' });
      return;
    }
    const report = await getBillingShadowReportForSubscription(subscriptionId);
    res.json(report);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingShadowReport]', e);
    res.status(500).json({ error: msg || 'Erro ao carregar relatório shadow' });
  }
}

/** GET /api/superadmin/billing/consistency — resumo global de consistência. */
export async function getBillingConsistencyDashboardHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const [dashboard, executionContext, projection] = await Promise.all([
      getBillingConsistencyDashboard(),
      getBillingExecutionContextDashboard(),
      getBillingProjectionDashboard(),
    ]);
    res.json({ consistency: dashboard, execution_context: executionContext, projection });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingConsistencyDashboard]', e);
    res.status(500).json({ error: msg || 'Erro ao carregar dashboard de consistência' });
  }
}

/** GET /api/superadmin/billing/consistency/:subscriptionId — relatório de consistência. */
export async function getBillingConsistencyReportHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const subscriptionId = String(req.params.subscriptionId ?? '').trim();
    if (!subscriptionId) {
      res.status(400).json({ error: 'subscriptionId obrigatório' });
      return;
    }
    const report = await getBillingConsistencyReportForSubscription(subscriptionId);
    res.json(report);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingConsistencyReport]', e);
    res.status(500).json({ error: msg || 'Erro ao carregar relatório de consistência' });
  }
}

/** POST /api/superadmin/billing/consistency/:subscriptionId/validate — nova validação (READ ONLY). */
export async function postBillingConsistencyValidateHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const subscriptionId = String(req.params.subscriptionId ?? '').trim();
    if (!subscriptionId) {
      res.status(400).json({ error: 'subscriptionId obrigatório' });
      return;
    }
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription) {
      res.status(404).json({ error: 'Assinatura não encontrada' });
      return;
    }
    const bodyTenant = (req.body as { tenant_id?: string })?.tenant_id;
    const tenantId = bodyTenant?.trim() || subscription.tenant_id;
    const result = await runBillingConsistencyValidation({
      subscriptionId,
      tenantId,
      persist: true,
    });
    res.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[postBillingConsistencyValidate]', e);
    res.status(500).json({ error: msg || 'Erro ao validar consistência' });
  }
}

/** GET /api/superadmin/billing/context/:subscriptionId — BillingExecutionContext serializado. */
export async function getBillingExecutionContextHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const subscriptionId = String(req.params.subscriptionId ?? '').trim();
    if (!subscriptionId) {
      res.status(400).json({ error: 'subscriptionId obrigatório' });
      return;
    }
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription) {
      res.status(404).json({ error: 'Assinatura não encontrada' });
      return;
    }
    const cycleKey = String(req.query.cycle_key ?? req.query.period_start ?? '').trim() ||
      subscription.current_period_start?.slice(0, 10) ||
      subscription.next_billing_date?.slice(0, 10) ||
      new Date().toISOString().slice(0, 10);
    const result = await getBillingExecutionContextForSubscription({
      subscriptionId,
      tenantId: subscription.tenant_id,
      cycleKey,
      periodStartYmd: cycleKey,
    });
    res.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingExecutionContext]', e);
    res.status(500).json({ error: msg || 'Erro ao carregar execution context' });
  }
}

/** POST /api/superadmin/billing/context/:subscriptionId/rebuild — reconstrói contexto (READ ONLY). */
export async function postBillingExecutionContextRebuildHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const subscriptionId = String(req.params.subscriptionId ?? '').trim();
    if (!subscriptionId) {
      res.status(400).json({ error: 'subscriptionId obrigatório' });
      return;
    }
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription) {
      res.status(404).json({ error: 'Assinatura não encontrada' });
      return;
    }
    const body = (req.body ?? {}) as { cycle_key?: string; period_start?: string };
    const cycleKey =
      body.cycle_key?.trim() ||
      body.period_start?.trim() ||
      subscription.current_period_start?.slice(0, 10) ||
      subscription.next_billing_date?.slice(0, 10) ||
      new Date().toISOString().slice(0, 10);
    const context = await rebuildBillingExecutionContext({
      subscriptionId,
      tenantId: subscription.tenant_id,
      cycleKey,
      periodStartYmd: cycleKey,
      skipCache: true,
    });
    res.json({
      built_at: new Date().toISOString(),
      context: JSON.parse(JSON.stringify(context)),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[postBillingExecutionContextRebuild]', e);
    res.status(500).json({ error: msg || 'Erro ao reconstruir execution context' });
  }
}

/** GET /api/superadmin/billing/projection/:subscriptionId — ProjectedInvoice (READ ONLY). */
export async function getBillingProjectionHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const subscriptionId = String(req.params.subscriptionId ?? '').trim();
    if (!subscriptionId) {
      res.status(400).json({ error: 'subscriptionId obrigatório' });
      return;
    }
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription) {
      res.status(404).json({ error: 'Assinatura não encontrada' });
      return;
    }
    const cycleKey =
      String(req.query.cycle_key ?? req.query.period_start ?? '').trim() ||
      subscription.current_period_start?.slice(0, 10) ||
      subscription.next_billing_date?.slice(0, 10) ||
      new Date().toISOString().slice(0, 10);
    const result = await projectBillingForSubscription({
      subscriptionId,
      tenantId: subscription.tenant_id,
      cycleKey,
      periodStartYmd: cycleKey,
      correlationId: String(req.query.correlation_id ?? '').trim() || undefined,
    });
    res.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingProjection]', e);
    res.status(500).json({ error: msg || 'Erro ao projetar cobrança' });
  }
}

/** POST /api/superadmin/billing/projection/:subscriptionId/compare — projeção + comparação (READ ONLY). */
export async function postBillingProjectionCompareHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const subscriptionId = String(req.params.subscriptionId ?? '').trim();
    if (!subscriptionId) {
      res.status(400).json({ error: 'subscriptionId obrigatório' });
      return;
    }
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription) {
      res.status(404).json({ error: 'Assinatura não encontrada' });
      return;
    }
    const body = (req.body ?? {}) as {
      cycle_key?: string;
      period_start?: string;
      correlation_id?: string;
      persist_report?: boolean;
    };
    const cycleKey =
      body.cycle_key?.trim() ||
      body.period_start?.trim() ||
      subscription.current_period_start?.slice(0, 10) ||
      subscription.next_billing_date?.slice(0, 10) ||
      new Date().toISOString().slice(0, 10);
    const result = await compareProjectionWithLegacy({
      subscriptionId,
      tenantId: subscription.tenant_id,
      cycleKey,
      periodStartYmd: cycleKey,
      correlationId: body.correlation_id?.trim(),
      persistReport: Boolean(body.persist_report),
    });
    res.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[postBillingProjectionCompare]', e);
    res.status(500).json({ error: msg || 'Erro ao comparar projeção' });
  }
}

/** GET /api/superadmin/billing/migration-readiness — dashboard global. */
export async function getBillingMigrationReadinessDashboardHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const dashboard = await getMigrationReadinessDashboard();
    res.json(dashboard);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingMigrationReadinessDashboard]', e);
    res.status(500).json({ error: msg || 'Erro ao carregar migration readiness' });
  }
}

/** GET /api/superadmin/billing/migration-readiness/:tenantId — relatório do tenant. */
export async function getBillingMigrationReadinessHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId ?? '').trim();
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId obrigatório' });
      return;
    }
    const cached = await getMigrationReadinessReportForTenant(tenantId);
    if (cached.report) {
      res.json({ ...cached.report, from_cache: true });
      return;
    }
    const report = await evaluateTenantMigrationReadiness(tenantId);
    res.json({ ...report, from_cache: false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingMigrationReadiness]', e);
    res.status(500).json({ error: msg || 'Erro ao avaliar migration readiness' });
  }
}

/** POST /api/superadmin/billing/migration-readiness/:tenantId/evaluate — nova avaliação (READ ONLY). */
export async function postBillingMigrationReadinessEvaluateHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId ?? '').trim();
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId obrigatório' });
      return;
    }
    const report = await evaluateTenantMigrationReadiness(tenantId, { persist: true });
    res.json(report);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[postBillingMigrationReadinessEvaluate]', e);
    res.status(500).json({ error: msg || 'Erro ao executar avaliação' });
  }
}

/** GET /api/superadmin/billing/migration-simulator — dashboard do simulador. */
export async function getBillingMigrationSimulatorDashboardHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const dashboard = await getMigrationSimulatorDashboard();
    res.json(dashboard);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingMigrationSimulatorDashboard]', e);
    res.status(500).json({ error: msg || 'Erro ao carregar simulator dashboard' });
  }
}

/** GET /api/superadmin/billing/migration-simulator/:tenantId — relatório de simulação. */
export async function getBillingMigrationSimulatorHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId ?? '').trim();
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId obrigatório' });
      return;
    }
    const cached = await getMigrationSimulationForTenant(tenantId);
    if (cached.report) {
      res.json({
        report: cached.report,
        dashboard: serializeSimulationDashboard(cached.report),
        from_cache: true,
      });
      return;
    }
    const report = await runMigrationSimulation(tenantId);
    res.json({
      report,
      dashboard: serializeSimulationDashboard(report),
      from_cache: false,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingMigrationSimulator]', e);
    res.status(500).json({ error: msg || 'Erro ao carregar simulação' });
  }
}

/** POST /api/superadmin/billing/migration-simulator/:tenantId/run — nova simulação (READ ONLY). */
export async function postBillingMigrationSimulatorRunHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId ?? '').trim();
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId obrigatório' });
      return;
    }
    const body = (req.body ?? {}) as { correlation_id?: string; skip_cache?: boolean };
    const report = await runMigrationSimulation(tenantId, {
      correlationId: body.correlation_id?.trim(),
      skipProjectionCache: Boolean(body.skip_cache),
      persist: true,
    });
    res.json({
      report,
      dashboard: serializeSimulationDashboard(report),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[postBillingMigrationSimulatorRun]', e);
    res.status(500).json({ error: msg || 'Erro ao executar simulação' });
  }
}

/** GET /api/superadmin/billing/cutover — dashboard cutover. */
export async function getBillingCutoverDashboardHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const dashboard = await getCutoverDashboard();
    res.json(dashboard);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingCutoverDashboard]', e);
    res.status(500).json({ error: msg || 'Erro ao carregar cutover dashboard' });
  }
}

/** GET /api/superadmin/billing/cutover/:tenantId — última decisão de cutover. */
export async function getBillingCutoverHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId ?? '').trim();
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId obrigatório' });
      return;
    }
    const cached = await getCutoverReportForTenant(tenantId);
    if (cached.report) {
      res.json({ ...cached.report, from_cache: true });
      return;
    }
    const report = await evaluateTenantCutover(tenantId);
    res.json({ ...report, from_cache: false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingCutover]', e);
    res.status(500).json({ error: msg || 'Erro ao carregar cutover' });
  }
}

/** POST /api/superadmin/billing/cutover/:tenantId/evaluate — nova avaliação cutover (READ ONLY). */
export async function postBillingCutoverEvaluateHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId ?? '').trim();
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId obrigatório' });
      return;
    }
    const body = (req.body ?? {}) as { correlation_id?: string };
    const report = await evaluateTenantCutover(tenantId, {
      correlationId: body.correlation_id?.trim(),
      persist: true,
    });
    res.json(report);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[postBillingCutoverEvaluate]', e);
    res.status(500).json({ error: msg || 'Erro ao avaliar cutover' });
  }
}

/** GET /api/superadmin/billing/certification — dashboard de certificação. */
export async function getBillingCertificationDashboardHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const dashboard = await getCertificationDashboard();
    res.json(dashboard);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingCertificationDashboard]', e);
    res.status(500).json({ error: msg || 'Erro ao carregar certification dashboard' });
  }
}

/** GET /api/superadmin/billing/certification/:subscriptionId — certificação por assinatura. */
export async function getBillingCertificationHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const subscriptionId = String(req.params.subscriptionId ?? '').trim();
    if (!subscriptionId) {
      res.status(400).json({ error: 'subscriptionId obrigatório' });
      return;
    }
    const cached = await getCertificationReportForSubscription(subscriptionId);
    if (cached.report) {
      res.json({
        ...cached.report,
        from_cache: true,
        status: cached.report.certified ? 'CERTIFIED' : 'FAILED',
      });
      return;
    }
    const report = await certifySubscriptionById(subscriptionId);
    res.json({
      ...report,
      from_cache: false,
      status: report.certified ? 'CERTIFIED' : 'FAILED',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[getBillingCertification]', e);
    res.status(500).json({ error: msg || 'Erro ao carregar certificação' });
  }
}

/** POST /api/superadmin/billing/certification/run — suite completa (READ ONLY). */
export async function postBillingCertificationRunHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const body = (req.body ?? {}) as { correlation_id?: string };
    const result = await runFullCertificationSuite({
      correlationId: body.correlation_id?.trim(),
      persist: true,
    });
    res.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[postBillingCertificationRun]', e);
    res.status(500).json({ error: msg || 'Erro ao executar certification suite' });
  }
}

/** POST /api/superadmin/billing/certification/:subscriptionId/evaluate — nova certificação. */
export async function postBillingCertificationEvaluateHandler(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const subscriptionId = String(req.params.subscriptionId ?? '').trim();
    if (!subscriptionId) {
      res.status(400).json({ error: 'subscriptionId obrigatório' });
      return;
    }
    const body = (req.body ?? {}) as { correlation_id?: string };
    const report = await certifySubscriptionById(subscriptionId, {
      correlationId: body.correlation_id?.trim(),
      persist: true,
    });
    res.json({
      ...report,
      status: report.certified ? 'CERTIFIED' : 'FAILED',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[postBillingCertificationEvaluate]', e);
    res.status(500).json({ error: msg || 'Erro ao certificar assinatura' });
  }
}

/** POST /api/superadmin/billing/recovery/run — scan + reparação leve (dry_run via body ou env). */
export async function postBillingRecoveryRunHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body as { dry_run?: boolean } | undefined;
    const dryRun =
      typeof body?.dry_run === 'boolean' ? body.dry_run : isBillingRecoveryDryRun();
    const report = await runBillingRecovery({ dry_run: dryRun });
    res.json(report);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[postBillingRecoveryRun]', e);
    res.status(500).json({ error: msg || 'Erro ao executar recovery' });
  }
}

/** PUT /api/superadmin/billing/subscription-cycles-flags */
export async function putSubscriptionCyclesFlagsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = subscriptionCyclesFlagsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const settings = await updateSubscriptionCyclesSuperadminSettings(parsed.data);
    res.json(settings);
  } catch (e: any) {
    console.error('[putSubscriptionCyclesFlags]', e);
    res.status(500).json({ error: e.message || 'Erro ao salvar flags de ciclos' });
  }
}
