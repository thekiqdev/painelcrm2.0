import type { LifecycleEventType, LifecycleRoute } from './lifecycleTypes.js';

/**
 * Rotas padrão Sprint G — não aplicadas em produção ainda (somente resolve).
 */
export const LIFECYCLE_DEFAULT_ROUTES: readonly LifecycleRoute[] = [
  { eventType: 'lead.created', boardName: 'Aquisição', columnName: 'Novo Lead' },
  { eventType: 'lead.qualified', boardName: 'Aquisição', columnName: 'Qualificado' },
  { eventType: 'trial.started', boardName: 'Aquisição', columnName: 'Trial iniciado' },
  { eventType: 'onboarding.started', boardName: 'Onboarding', columnName: 'Provisionado' },
  { eventType: 'onboarding.completed', boardName: 'Onboarding', columnName: 'Onboarding concluído' },
  { eventType: 'subscription.activated', boardName: 'Expansão', columnName: 'Novo Cliente' },
  { eventType: 'trial.expired', boardName: 'Reativação', columnName: 'Trial expirado' },
  { eventType: 'trial.recovery.day1', boardName: 'Reativação', columnName: 'Dia 1' },
  { eventType: 'trial.recovery.day3', boardName: 'Reativação', columnName: 'Dia 3' },
  { eventType: 'trial.recovery.day7', boardName: 'Reativação', columnName: 'Dia 7' },
  { eventType: 'trial.recovery.last_attempt', boardName: 'Reativação', columnName: 'Última tentativa' },
  { eventType: 'subscription.cancelled', boardName: 'Reativação', columnName: 'Cancelado' },
  { eventType: 'customer.reactivated', boardName: 'Reativação', columnName: 'Reativado' },
] as const;

const ROUTE_BY_EVENT = new Map<LifecycleEventType, LifecycleRoute>(
  LIFECYCLE_DEFAULT_ROUTES.map((r) => [r.eventType, r]),
);

export function getDefaultLifecycleRoute(eventType: LifecycleEventType): LifecycleRoute | undefined {
  return ROUTE_BY_EVENT.get(eventType);
}
