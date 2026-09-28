/**
 * Billing Engine V2 — Sprint 2.4B: relatórios em storage/debug/billing-certification-lab/.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BillingFunctionalCertificationReport } from './types.js';

export function resolveLabOutputDir(): string {
  const cwd = process.cwd();
  if (cwd.replace(/\\/g, '/').endsWith('packages/backend')) {
    return path.resolve(cwd, '../../storage/debug/billing-certification-lab');
  }
  return path.resolve(cwd, 'storage/debug/billing-certification-lab');
}

export async function writeLabReports(report: BillingFunctionalCertificationReport): Promise<{
  output_dir: string;
  files: string[];
}> {
  const outputDir = resolveLabOutputDir();
  await mkdir(outputDir, { recursive: true });

  const files: string[] = [];
  const write = async (name: string, data: unknown) => {
    const filePath = path.join(outputDir, name);
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    files.push(filePath);
  };

  await write('latest-report.json', report);
  await write('summary.json', {
    version: report.version,
    generated_at: report.generated_at,
    recommendation: report.recommendation,
    summary: report.summary,
    golden_dataset: report.golden_dataset,
  });
  await write('stress-report.json', report.stress);
  await write('regression-report.json', {
    version: report.regression.version,
    generated_at: report.regression.generated_at,
    total_scenarios: report.regression.total_scenarios,
    passed: report.regression.passed,
    failed: report.regression.failed,
    pass_rate_pct: report.regression.pass_rate_pct,
    approved: report.regression.approved,
    scenarios: report.regression.scenarios.map((s) => ({
      id: s.scenario.id,
      group: s.scenario.group,
      name: s.scenario.name,
      passed: s.passed,
      duration_ms: s.duration_ms,
      certification_score: s.certification.score,
      failed_assertions: s.assertions.filter((a) => !a.passed).map((a) => a.name),
      errors: s.errors,
    })),
  });
  await write('golden-dataset-report.json', report.golden_dataset);

  return { output_dir: outputDir, files };
}
