/**
 * Sprint 5.0-21A — Comparação read-only Legacy vs Aggregate.
 * Não altera motores; apenas mede e classifica divergências.
 */
import { buildBillingAggregateFromDetail } from '@/lib/billingAggregate';
import { FinancialEventStore } from '@/lib/subscriptionFinancialEventStore';
import { buildFinancialAlerts } from '@/lib/subscriptionFinancialExperience';
import { cycleSupportsManualGenerate } from '@/lib/operationalCompetencyResolver';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import {
  buildAggregateShadowSnapshot,
  buildLegacyShadowSnapshot,
} from './shadowSnapshot';

export type DivergenceClass =
  | 'structural'
  | 'semantic'
  | 'ordering'
  | 'data'
  | 'behavior';

export type SurfaceName =
  | 'subscription'
  | 'cycles'
  | 'events'
  | 'history'
  | 'calendar'
  | 'sidebar'
  | 'nextInvoice'
  | 'alerts'
  | 'capabilities';

export type SurfaceDivergence = {
  surface: SurfaceName;
  scenarioId: string;
  field: string;
  legacy: unknown;
  aggregate: unknown;
  classification: DivergenceClass;
  evidence: string;
};

export type SurfaceParity = {
  surface: SurfaceName;
  checks: number;
  passed: number;
  percent: number;
  divergences: SurfaceDivergence[];
};

export type ScenarioCertification = {
  scenarioId: string;
  legacyMs: number;
  aggregateMs: number;
  surfaces: SurfaceParity[];
  divergences: SurfaceDivergence[];
};

export type ShadowCertificationReport = {
  sprint: '5.0-21A';
  generatedAt: string;
  scenarioCount: number;
  metrics: {
    legacyExecutionMs: number;
    aggregateExecutionMs: number;
    historyParityPercent: number;
    calendarParityPercent: number;
    sidebarParityPercent: number;
    nextInvoiceParityPercent: number;
    alertsParityPercent: number;
    capabilitiesParityPercent: number;
    eventsParityPercent: number;
    overallParityPercent: number;
  };
  scenarios: ScenarioCertification[];
  divergenceMatrix: SurfaceDivergence[];
  cutoverRecommendation: 'NOT_READY' | 'READY_WITH_CORRECTIONS' | 'READY';
};

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function check(
  surface: SurfaceName,
  scenarioId: string,
  field: string,
  legacy: unknown,
  aggregate: unknown,
  classification: DivergenceClass,
  evidence: string
): { pass: boolean; divergence?: SurfaceDivergence } {
  if (eq(legacy, aggregate)) return { pass: true };
  return {
    pass: false,
    divergence: {
      surface,
      scenarioId,
      field,
      legacy,
      aggregate,
      classification,
      evidence,
    },
  };
}

function surfaceParity(
  surface: SurfaceName,
  results: Array<{ pass: boolean; divergence?: SurfaceDivergence }>
): SurfaceParity {
  const divergences = results
    .filter((r) => !r.pass && r.divergence)
    .map((r) => r.divergence!);
  const checks = results.length;
  const passed = results.filter((r) => r.pass).length;
  return {
    surface,
    checks,
    passed,
    percent: checks === 0 ? 100 : Math.round((passed / checks) * 1000) / 10,
    divergences,
  };
}

function avgPercent(surfaces: SurfaceParity[], name: SurfaceName): number {
  const items = surfaces.filter((s) => s.surface === name);
  if (items.length === 0) return 100;
  return Math.round((items.reduce((s, i) => s + i.percent, 0) / items.length) * 10) / 10;
}

/** Certifica um cenário Golden — read-only. */
export function certifyScenario(
  scenarioId: string,
  detail: CrmSubscriptionDetailPayload,
  todayYmd: string
): ScenarioCertification {
  // Instancia o store legado diretamente (sem Shadow side-effect) para medição limpa.
  const legacyStart = performance.now();
  const store = new FinancialEventStore(detail, todayYmd);
  const legacyMs = performance.now() - legacyStart;

  const aggregateStart = performance.now();
  const aggregate = buildBillingAggregateFromDetail(detail, todayYmd);
  const aggregateMs = performance.now() - aggregateStart;

  const legacySnap = buildLegacyShadowSnapshot(store);
  const aggSnap = buildAggregateShadowSnapshot(aggregate);

  const historyRows = store.getHistoryRows();
  const calendarEvents = store.getCalendarEvents();
  const realCalendar = calendarEvents.filter((e) => !e.isProjected);
  const legacyAlerts = buildFinancialAlerts(detail, todayYmd);
  const legacyCanGenerate = historyRows.some((r) => r.canGenerateNow === true);
  const legacyCanGenerateCycleIds = historyRows
    .filter((r) => r.canGenerateNow)
    .map((r) => r.cycleId)
    .filter(Boolean)
    .sort();
  const aggregateGeneratableCycleIds = aggregate.cycles
    .filter(
      (c) =>
        !c.invoiceId &&
        ['pending', 'queued', 'failed', 'skipped', 'cancelled'].includes(
          c.status.trim().toLowerCase()
        )
    )
    .map((c) => c.id)
    .sort();
  if (aggregate.subscription.status === 'cancelled') {
    aggregateGeneratableCycleIds.length = 0;
  }

  // --- subscription ---
  const subscription = surfaceParity('subscription', [
    check(
      'subscription',
      scenarioId,
      'subscriptionId',
      legacySnap.subscriptionId,
      aggSnap.subscriptionId,
      'data',
      'ID da assinatura deve ser idêntico'
    ),
    check(
      'subscription',
      scenarioId,
      'status',
      detail.subscription.status,
      aggregate.subscription.status,
      'data',
      'Status da assinatura no Aggregate deve espelhar o payload'
    ),
  ]);

  // --- cycles ---
  const legacyCycleIds = (detail.cycles_raw ?? []).map((c) => c.id).sort();
  const cycles = surfaceParity('cycles', [
    check(
      'cycles',
      scenarioId,
      'count',
      legacyCycleIds.length,
      aggregate.cycles.length,
      'data',
      'Quantidade de cycles deve igualar cycles_raw'
    ),
    check(
      'cycles',
      scenarioId,
      'ids',
      legacyCycleIds,
      aggregate.cycles.map((c) => c.id).sort(),
      'data',
      'IDs de cycles devem ser 1:1 com cycles_raw'
    ),
  ]);

  // --- events (real only) ---
  const legacyRealCycleIds = store.realEvents
    .map((e) => e.cycleId)
    .filter(Boolean)
    .sort() as string[];
  const aggEventCycleIds = aggregate.events.map((e) => e.cycleId).sort();
  const events = surfaceParity('events', [
    check(
      'events',
      scenarioId,
      'count',
      legacySnap.realEventCount,
      aggSnap.eventCount,
      'semantic',
      'Contagem de eventos reais (legado) vs events do Aggregate'
    ),
    check(
      'events',
      scenarioId,
      'cycleIds',
      legacyRealCycleIds,
      aggEventCycleIds,
      'semantic',
      'Conjunto de cycleIds em eventos reais'
    ),
  ]);

  // --- history ---
  const legacyHistoryCycleIds = historyRows
    .map((r) => r.cycleId)
    .filter(Boolean)
    .sort() as string[];
  const aggHistoryCycleIds = [...aggregate.history.map((r) => r.cycleId)].sort();
  const legacyHistoryOrder = historyRows.map((r) => r.cycleId).filter(Boolean);
  const aggHistoryOrder = aggregate.history.map((r) => r.cycleId);
  const history = surfaceParity('history', [
    check(
      'history',
      scenarioId,
      'count',
      legacySnap.historyCount,
      aggSnap.historyCount,
      'semantic',
      'Quantidade de linhas do histórico'
    ),
    check(
      'history',
      scenarioId,
      'cycleIds',
      legacyHistoryCycleIds,
      aggHistoryCycleIds,
      'data',
      'Conjunto de cycleIds no histórico'
    ),
    check(
      'history',
      scenarioId,
      'order',
      legacyHistoryOrder,
      aggHistoryOrder,
      'ordering',
      'Ordem das linhas do histórico (legado: due desc; aggregate: occurredAt asc)'
    ),
  ]);

  // --- calendar (reais + projeções) ---
  const legacyRealCalCycleIds = realCalendar
    .map((e) => e.cycleId)
    .filter(Boolean)
    .sort() as string[];
  const aggRealCalCycleIds = aggregate.calendar
    .filter((e) => !e.isProjected)
    .map((e) => e.cycleId)
    .filter(Boolean)
    .sort() as string[];
  const calendar = surfaceParity('calendar', [
    check(
      'calendar',
      scenarioId,
      'realCount',
      realCalendar.length,
      aggregate.calendar.filter((e) => !e.isProjected).length,
      'semantic',
      'Contagem de eventos reais no calendário'
    ),
    check(
      'calendar',
      scenarioId,
      'totalCount',
      legacySnap.calendarCount,
      aggSnap.calendarCount,
      'semantic',
      'Contagem total do calendário (reais + projeções)'
    ),
    check(
      'calendar',
      scenarioId,
      'realCycleIds',
      legacyRealCalCycleIds,
      aggRealCalCycleIds,
      'semantic',
      'cycleIds de eventos reais no calendário'
    ),
    check(
      'calendar',
      scenarioId,
      'projectedCount',
      legacySnap.projectedCalendarCount,
      aggSnap.projectedCalendarCount,
      'semantic',
      'Contagem de projeções UX no calendário'
    ),
  ]);

  // --- sidebar ---
  const legacySidebar = store.getSidebarSummary();
  const sidebar = surfaceParity('sidebar', [
    check(
      'sidebar',
      scenarioId,
      'nextReceiptDate',
      legacySidebar.nextReceiptDate,
      aggregate.sidebar.nextReceiptDate,
      'semantic',
      'Data da próxima cobrança (label curto)'
    ),
    check(
      'sidebar',
      scenarioId,
      'openAmount',
      legacySidebar.openAmount,
      aggregate.sidebar.openAmount,
      'semantic',
      'Valor em aberto'
    ),
    check(
      'sidebar',
      scenarioId,
      'lastPaymentDate',
      legacySidebar.lastPaymentDate,
      aggregate.sidebar.lastPaymentDate,
      'semantic',
      'Data do último pagamento'
    ),
    check(
      'sidebar',
      scenarioId,
      'eventCount',
      store.realEvents.length,
      aggregate.sidebar.eventCount,
      'semantic',
      'eventCount do sidebar vs realEvents'
    ),
  ]);

  // --- nextInvoice ---
  const nextInvoice = surfaceParity('nextInvoice', [
    check(
      'nextInvoice',
      scenarioId,
      'cycleId',
      legacySnap.nextChargeCycleId,
      aggSnap.nextInvoiceCycleId,
      'semantic',
      'cycleId da próxima cobrança (first eligible)'
    ),
    check(
      'nextInvoice',
      scenarioId,
      'presence',
      legacySnap.nextChargeCycleId != null || legacySnap.nextChargeIsProjected,
      aggSnap.nextInvoiceCycleId != null || aggSnap.nextInvoiceIsProjected,
      'semantic',
      'Presença de próxima cobrança (real ou projetada)'
    ),
    check(
      'nextInvoice',
      scenarioId,
      'isProjected',
      legacySnap.nextChargeIsProjected,
      aggSnap.nextInvoiceIsProjected,
      'semantic',
      'Flag isProjected da próxima cobrança'
    ),
  ]);

  // --- alerts ---
  const legacyAlertKinds = legacyAlerts.map((a) => a.kind).sort();
  const aggAlertKinds = aggregate.alerts.map((a) => a.kind).sort();
  const alerts = surfaceParity('alerts', [
    check(
      'alerts',
      scenarioId,
      'kinds',
      legacyAlertKinds,
      aggAlertKinds,
      'structural',
      'Taxonomias de alerta diferentes (legado UX vs Aggregate)'
    ),
    check(
      'alerts',
      scenarioId,
      'count',
      legacyAlerts.length,
      aggregate.alerts.length,
      'semantic',
      'Quantidade de alertas'
    ),
  ]);

  // --- capabilities / Generate ---
  const capabilities = surfaceParity('capabilities', [
    check(
      'capabilities',
      scenarioId,
      'canGenerate',
      legacyCanGenerate,
      aggregate.capabilities.canGenerate,
      'behavior',
      'canGenerate: histórico legado vs capabilities do Aggregate'
    ),
    check(
      'capabilities',
      scenarioId,
      'generateCycleIds',
      legacyCanGenerateCycleIds,
      aggregate.subscription.status === 'cancelled' ? [] : aggregateGeneratableCycleIds,
      'behavior',
      'Ciclos elegíveis a Generate'
    ),
    check(
      'capabilities',
      scenarioId,
      'cycleSupportsManualGenerate_first',
      detail.cycles_raw[0]
        ? cycleSupportsManualGenerate(detail, detail.cycles_raw[0].id)
        : false,
      detail.cycles_raw[0]
        ? aggregate.subscription.status !== 'cancelled' &&
            !aggregate.cycles.find((c) => c.id === detail.cycles_raw[0]!.id)?.invoiceId &&
            ['pending', 'queued', 'failed', 'skipped', 'cancelled'].includes(
              (aggregate.cycles.find((c) => c.id === detail.cycles_raw[0]!.id)?.status ?? '')
                .trim()
                .toLowerCase()
            )
        : false,
      'behavior',
      'Paridade pontual do primeiro cycle_raw com elegibilidade do Aggregate'
    ),
  ]);

  const surfaces = [
    subscription,
    cycles,
    events,
    history,
    calendar,
    sidebar,
    nextInvoice,
    alerts,
    capabilities,
  ];

  return {
    scenarioId,
    legacyMs,
    aggregateMs,
    surfaces,
    divergences: surfaces.flatMap((s) => s.divergences),
  };
}

/** Certifica todos os cenários e produz o relatório oficial. */
export function runShadowCertification(
  scenarios: Array<{ id: string; build: () => CrmSubscriptionDetailPayload; todayYmd: string }>
): ShadowCertificationReport {
  const results = scenarios.map((s) => certifyScenario(s.id, s.build(), s.todayYmd));
  const allSurfaces = results.flatMap((r) => r.surfaces);
  const divergenceMatrix = results.flatMap((r) => r.divergences);

  const historyParityPercent = avgPercent(allSurfaces, 'history');
  const calendarParityPercent = avgPercent(allSurfaces, 'calendar');
  const sidebarParityPercent = avgPercent(allSurfaces, 'sidebar');
  const nextInvoiceParityPercent = avgPercent(allSurfaces, 'nextInvoice');
  const alertsParityPercent = avgPercent(allSurfaces, 'alerts');
  const capabilitiesParityPercent = avgPercent(allSurfaces, 'capabilities');
  const eventsParityPercent = avgPercent(allSurfaces, 'events');

  const overallChecks = allSurfaces.reduce((s, x) => s + x.checks, 0);
  const overallPassed = allSurfaces.reduce((s, x) => s + x.passed, 0);
  const overallParityPercent =
    overallChecks === 0 ? 100 : Math.round((overallPassed / overallChecks) * 1000) / 10;

  const legacyExecutionMs =
    Math.round(results.reduce((s, r) => s + r.legacyMs, 0) * 100) / 100;
  const aggregateExecutionMs =
    Math.round(results.reduce((s, r) => s + r.aggregateMs, 0) * 100) / 100;

  let cutoverRecommendation: ShadowCertificationReport['cutoverRecommendation'] = 'NOT_READY';
  if (overallParityPercent >= 99) cutoverRecommendation = 'READY';
  else if (overallParityPercent >= 70) cutoverRecommendation = 'READY_WITH_CORRECTIONS';

  return {
    sprint: '5.0-21A',
    generatedAt: new Date().toISOString(),
    scenarioCount: scenarios.length,
    metrics: {
      legacyExecutionMs,
      aggregateExecutionMs,
      historyParityPercent,
      calendarParityPercent,
      sidebarParityPercent,
      nextInvoiceParityPercent,
      alertsParityPercent,
      capabilitiesParityPercent,
      eventsParityPercent,
      overallParityPercent,
    },
    scenarios: results,
    divergenceMatrix,
    cutoverRecommendation,
  };
}

export function classifyDivergenceSummary(
  matrix: SurfaceDivergence[]
): Record<DivergenceClass, number> {
  const summary: Record<DivergenceClass, number> = {
    structural: 0,
    semantic: 0,
    ordering: 0,
    data: 0,
    behavior: 0,
  };
  for (const d of matrix) summary[d.classification] += 1;
  return summary;
}
