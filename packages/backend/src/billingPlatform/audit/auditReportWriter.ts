import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuditModuleResult, ProductionReadinessSummary } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PRODUCTION_AUDIT_DIR = path.resolve(
  __dirname,
  '../../../../../storage/debug/billing-production'
);

export function ensureAuditOutputDir(dir: string = DEFAULT_PRODUCTION_AUDIT_DIR): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeAuditArtifact(
  filename: string,
  payload: unknown,
  outputDir: string = DEFAULT_PRODUCTION_AUDIT_DIR
): string {
  const dir = ensureAuditOutputDir(outputDir);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

export function writeModuleArtifact(
  filename: string,
  result: AuditModuleResult,
  outputDir?: string
): string {
  return writeAuditArtifact(filename, result, outputDir);
}

export function writeProductionSummary(
  summary: ProductionReadinessSummary,
  outputDir?: string
): string {
  return writeAuditArtifact('production-readiness-summary.json', summary, outputDir);
}
