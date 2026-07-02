/**
 * Billing Engine V2 — Sprint 2.3F: preview de rollback (documentação apenas).
 */
import type { MigrationSimulationRecommendation, RollbackPreview } from './types.js';

export function buildRollbackPreview(params: {
  recommendation: MigrationSimulationRecommendation;
  rollback_safe: boolean;
}): RollbackPreview {
  const steps = [
    'Desativar BILLING_PLAN_V2 para o tenant (feature flag por tenant na Sprint 2.4)',
    'Motor V1 retoma cobrança no próximo ciclo automaticamente',
    'Billing plans V2 permanecem no banco como histórico (sem DELETE)',
    'Shadow/Projection continuam em modo auditoria para validação pós-rollback',
  ];

  if (params.recommendation === 'DO_NOT_MIGRATE' || params.recommendation === 'BLOCKED') {
    return {
      rollback_possible: true,
      rollback_steps: ['Nenhuma migração aplicada — rollback não necessário'],
      notes: ['Tenant permanece 100% no Motor V1'],
    };
  }

  return {
    rollback_possible: params.rollback_safe,
    rollback_steps: params.rollback_safe ? steps : ['Rollback manual requer intervenção operacional'],
    notes: [
      'Rollback é reversão de feature flag apenas — nenhuma invoice V2 é removida automaticamente',
      'Invoices geradas pelo V2 antes do rollback permanecem no histórico',
    ],
  };
}

export function isRollbackSafe(recommendation: MigrationSimulationRecommendation): boolean {
  return recommendation !== 'DO_NOT_MIGRATE';
}
