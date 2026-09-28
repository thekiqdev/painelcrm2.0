/**
 * Billing Engine V2 — Sprint 2.3E: pontuação ponderada de readiness.
 */
import type { MigrationAreaScore } from './types.js';
import { MIGRATION_AREA_WEIGHTS } from './types.js';

export function computeWeightedOverallScore(areas: MigrationAreaScore[]): number {
  if (areas.length === 0) return 0;
  let weighted = 0;
  for (const area of areas) {
    weighted += area.score * area.weight;
  }
  return Math.round(weighted / 100);
}

export function isAreaPerfect(score: number): boolean {
  return score >= 100;
}

export function allAreasPerfect(areas: MigrationAreaScore[]): boolean {
  return areas.every((a) => isAreaPerfect(a.score));
}
