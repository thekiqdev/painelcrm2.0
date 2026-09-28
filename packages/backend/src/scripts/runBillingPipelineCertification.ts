/**
 * Billing Engine V2 — Sprint 3.0E: CLI Production Pipeline Certification.
 * Uso: npm run billing:pipeline-cert
 */
import { BillingProductionCertificationEngine } from '../internal-tools/billing-migration/billingPipelineCertification/billingProductionCertificationEngine.js';

async function main(): Promise<void> {
  console.log('[PIPELINE_CERTIFICATION] Iniciando certificação operacional V1 vs V2...');
  const report = BillingProductionCertificationEngine.runFullCertification();

  console.log(`[PIPELINE_RESULT] overall_score=${report.overall_score}% approved=${report.approved}`);
  console.log(`[PIPELINE_RESULT] recommendation=${report.recommendation}`);
  console.log(
    `[PIPELINE_RESULT] gates: invoice=${report.invoice_score}% items=${report.invoice_items_score}% gateway=${report.gateway_score}% notification=${report.notification_score}%`
  );
  console.log(
    `[PIPELINE_RESULT] timeline=${report.timeline_score}% history=${report.history_score}% subscription=${report.subscription_score}% billing_result=${report.billing_result_score}%`
  );
  console.log(
    `[PIPELINE_RESULT] idempotency=${report.idempotency_score}% rollback=${report.rollback_score}%`
  );
  console.log(`[PIPELINE_RESULT] scenarios=${report.scenarios.length} correlation_id=${report.correlation_id}`);

  if (report.blocking_issues.length > 0) {
    for (const issue of report.blocking_issues) {
      console.error(`[PIPELINE_GATE] BLOCKING: ${issue}`);
    }
  }

  if (report.recommendation !== 'APPROVED') {
    const failed = report.scenarios.filter((s) => !s.approved);
    for (const f of failed.slice(0, 5)) {
      console.error(
        `[PIPELINE_COMPARE] FAILED ${f.scenario_id}: ${f.differences.map((d) => d.field).join(', ')}`
      );
    }
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('[PIPELINE_CERTIFICATION] Erro fatal:', e);
  process.exitCode = 1;
});
