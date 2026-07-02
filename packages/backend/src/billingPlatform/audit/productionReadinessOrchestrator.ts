/**
 * Sprint 4.2 — Production Readiness orchestrator.
 */
import {
  writeModuleArtifact,
  writeProductionSummary,
  DEFAULT_PRODUCTION_AUDIT_DIR,
} from './auditReportWriter.js';
import { auditProductionSubscriptions } from './productionSubscriptions/productionSubscriptionAuditor.js';
import { certifyBillingWorker } from './worker/workerCertification.js';
import { certifyBillingFinancial } from './financial/financialCertification.js';
import { certifyBillingMigration } from './migration/migrationCertification.js';
import { certifyCalendarConsistency } from './calendar/calendarConsistency.js';
import { certifyBillingTimezone } from './timezone/timezoneCertification.js';
import { certifyBillingPerformance } from './performance/performanceCertification.js';
import type {
  AuditModuleResult,
  ProductionReadinessOptions,
  ProductionReadinessSummary,
} from './types.js';
import { BILLING_RUNTIME_VERSION } from '../../billingRuntime/billingRuntimeVersions.js';
import { getBillingPlatformVersion } from '../platformManifest.js';

const DEPLOYMENT_CHECKLIST = [
  'Todas as assinaturas certificadas',
  'Nenhum Billing Plan órfão',
  'Nenhum Billing Item órfão',
  'Nenhum ciclo inconsistente',
  'Nenhuma invoice órfã',
  'Nenhuma assinatura sem próxima cobrança',
  'Nenhum erro de timezone',
  'Nenhum SQL inválido',
  'Worker aprovado',
  'Scheduler aprovado',
  'Retry aprovado',
  'Performance aprovada',
  'Calendário consistente',
  'Histórico consistente',
  'Próxima cobrança consistente',
  'Assinaturas antigas migradas automaticamente',
] as const;

function buildChecklist(results: Record<string, AuditModuleResult>): Array<{ item: string; passed: boolean }> {
  const subs = results.productionSubscriptions;
  const migration = results.migration;
  const financial = results.financial;
  const calendar = results.calendar;
  const timezone = results.timezone;
  const worker = results.worker;
  const performance = results.performance;

  const checks: Record<string, boolean> = {
    'Todas as assinaturas certificadas': subs?.certified ?? false,
    'Nenhum Billing Plan órfão': migration?.certified ?? false,
    'Nenhum Billing Item órfão': migration?.certified ?? false,
    'Nenhum ciclo inconsistente': calendar?.certified ?? false,
    'Nenhuma invoice órfã': financial?.certified ?? false,
    'Nenhuma assinatura sem próxima cobrança': calendar?.certified ?? false,
    'Nenhum erro de timezone': timezone?.certified ?? false,
    'Nenhum SQL inválido': timezone?.certified ?? false,
    'Worker aprovado': worker?.certified ?? false,
    'Scheduler aprovado': worker?.certified ?? false,
    'Retry aprovado': worker?.certified ?? false,
    'Performance aprovada': performance?.certified ?? false,
    'Calendário consistente': calendar?.certified ?? false,
    'Histórico consistente': subs?.certified ?? false,
    'Próxima cobrança consistente': calendar?.certified ?? false,
    'Assinaturas antigas migradas automaticamente': migration?.certified ?? false,
  };

  return DEPLOYMENT_CHECKLIST.map((item) => ({ item, passed: checks[item] ?? false }));
}

export type ProductionReadinessReport = {
  summary: ProductionReadinessSummary;
  modules: Record<string, AuditModuleResult>;
  artifact_paths: Record<string, string>;
};

export async function runProductionReadinessCertification(
  options: ProductionReadinessOptions = {}
): Promise<ProductionReadinessReport> {
  const started = Date.now();
  const outputDir = options.outputDir ?? DEFAULT_PRODUCTION_AUDIT_DIR;

  const [
    productionSubscriptions,
    worker,
    financial,
    migration,
    calendar,
    timezone,
    performance,
  ] = await Promise.all([
    auditProductionSubscriptions(options),
    certifyBillingWorker(options.tenantId),
    certifyBillingFinancial(options),
    certifyBillingMigration(options),
    certifyCalendarConsistency(options),
    certifyBillingTimezone(),
    certifyBillingPerformance(options),
  ]);

  const modules: Record<string, AuditModuleResult> = {
    productionSubscriptions,
    worker,
    financial,
    migration,
    calendar,
    timezone,
    performance,
  };

  const artifact_paths: Record<string, string> = {
    'production-subscription-audit.json': writeModuleArtifact(
      'production-subscription-audit.json',
      productionSubscriptions,
      outputDir
    ),
    'worker-certification.json': writeModuleArtifact('worker-certification.json', worker, outputDir),
    'financial-certification.json': writeModuleArtifact(
      'financial-certification.json',
      financial,
      outputDir
    ),
    'migration-certification.json': writeModuleArtifact(
      'migration-certification.json',
      migration,
      outputDir
    ),
    'calendar-consistency.json': writeModuleArtifact('calendar-consistency.json', calendar, outputDir),
    'timezone-certification.json': writeModuleArtifact(
      'timezone-certification.json',
      timezone,
      outputDir
    ),
    'performance-certification.json': writeModuleArtifact(
      'performance-certification.json',
      performance,
      outputDir
    ),
  };

  const checklist = buildChecklist(modules);
  const allCertified = Object.values(modules).every((m) => m.certified);
  const checklistGreen = checklist.every((c) => c.passed);

  const summary: ProductionReadinessSummary = {
    sprint: '4.2',
    title: 'Production Readiness Certification',
    generated_at_iso: new Date().toISOString(),
    duration_ms: Date.now() - started,
    certified: allCertified && checklistGreen,
    status: allCertified && checklistGreen ? 'PRODUCTION READY' : 'NOT READY',
    deployment_approved: checklistGreen,
    modules: Object.fromEntries(
      Object.entries(modules).map(([k, v]) => [
        k,
        { certified: v.certified, issue_count: v.issues.length, repair_count: v.repairs.length },
      ])
    ),
    checklist,
    expected_final_status: {
      billing_platform: allCertified ? 'PRODUCTION READY' : 'NOT READY',
      billing_runtime: productionSubscriptions.certified ? 'CERTIFIED' : 'NOT CERTIFIED',
      billing_worker: worker.certified ? 'CERTIFIED' : 'NOT CERTIFIED',
      billing_financial: financial.certified ? 'CERTIFIED' : 'NOT CERTIFIED',
      billing_calendar: calendar.certified ? 'CERTIFIED' : 'NOT CERTIFIED',
      billing_migration: migration.certified ? 'CERTIFIED' : 'NOT CERTIFIED',
      deployment: checklistGreen ? 'APPROVED' : 'BLOCKED',
    },
  };

  (summary as ProductionReadinessSummary & { platform_version?: string }).platform_version =
    `${getBillingPlatformVersion()} / ${BILLING_RUNTIME_VERSION}`;

  artifact_paths['production-readiness-summary.json'] = writeProductionSummary(summary, outputDir);

  return { summary, modules, artifact_paths };
}
