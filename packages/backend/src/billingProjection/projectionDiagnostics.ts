/**
 * Billing Engine V2 — Sprint 2.3D: diagnostics da projeção.
 */
import type { ProjectionDiagnostics } from './types.js';
import { PROJECTION_BUILDER_VERSION } from './types.js';

export function createProjectionDiagnostics(params: {
  calculationTime: number;
  warnings: string[];
  errors: string[];
  hash: string;
  cacheHit: boolean;
}): ProjectionDiagnostics {
  return {
    calculationTime: params.calculationTime,
    warnings: params.warnings,
    errors: params.errors,
    hash: params.hash,
    calculatorVersions: {
      items: '1.0.0',
      pricing: '1.0.0',
      discounts: '1.0.0',
      taxes: '1.0.0',
      gateway: '1.0.0',
      notification: '1.0.0',
      timeline: '1.0.0',
      history: '1.0.0',
      totals: '1.0.0',
    },
    cacheHit: params.cacheHit,
    builderVersion: PROJECTION_BUILDER_VERSION,
  };
}
