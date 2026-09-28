/**
 * Billing Engine V2 — Sprint 2.4B: CLI do Functional Certification Lab.
 * Uso: npm run billing:cert-lab
 */
import { runBillingFunctionalCertification } from '../internal-tools/billing-migration/billingCertificationLab/billingRegressionSuite.js';
import { writeLabReports } from '../internal-tools/billing-migration/billingCertificationLab/billingScenarioReporter.js';
import type { ScenarioPipelineResult } from '../internal-tools/billing-migration/billingCertificationLab/types.js';

async function main(): Promise<void> {
  console.log('[CERTIFICATION_LAB] Iniciando Billing Functional Certification...');
  const report = await runBillingFunctionalCertification();
  const { output_dir, files } = await writeLabReports(report);

  console.log(`[CERTIFICATION_LAB] Cenários: ${report.regression.passed}/${report.regression.total_scenarios} aprovados`);
  console.log(`[CERTIFICATION_LAB] Stress: ${report.stress.approved ? 'OK' : 'FALHOU'}`);
  console.log(`[CERTIFICATION_LAB] Recomendação: ${report.recommendation}`);
  console.log(`[CERTIFICATION_LAB] Relatórios em: ${output_dir}`);
  for (const f of files) console.log(`  - ${f}`);

  if (report.recommendation !== 'CERTIFIED') {
    const failed = report.regression.scenarios.filter((s: ScenarioPipelineResult) => !s.passed);
    for (const f of failed.slice(0, 10)) {
      console.error(
        `[CERTIFICATION_FAILED] ${f.scenario.id}: ${f.assertions
          .filter((a) => !a.passed)
          .map((a) => a.name)
          .join(', ')}`
      );
    }
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('[CERTIFICATION_LAB] Erro fatal:', e);
  process.exitCode = 1;
});
