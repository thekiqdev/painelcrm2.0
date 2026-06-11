/**
 * Sprint G — tipos do Lifecycle Router (fundação; sem efeitos colaterais).
 */
export type TrialRecoveryLifecycleEventType =
  | 'trial.recovery.day1'
  | 'trial.recovery.day3'
  | 'trial.recovery.day7'
  | 'trial.recovery.last_attempt';

export type TrialEngagementLifecycleEventType =
  | 'trial.engagement.started'
  | 'trial.engagement.day2'
  | 'trial.engagement.day4'
  | 'trial.engagement.day6'
  | 'trial.engagement.finalizing';

export type LifecycleEventType =
  | 'lead.created'
  | 'lead.qualified'
  | 'trial.started'
  | 'trial.expired'
  | 'trial.recovery.day1'
  | 'trial.recovery.day3'
  | 'trial.recovery.day7'
  | 'trial.recovery.last_attempt'
  | 'trial.engagement.started'
  | 'trial.engagement.day2'
  | 'trial.engagement.day4'
  | 'trial.engagement.day6'
  | 'trial.engagement.finalizing'
  | 'onboarding.started'
  | 'onboarding.completed'
  | 'subscription.activated'
  | 'subscription.cancelled'
  | 'customer.reactivated';

export const TRIAL_RECOVERY_LIFECYCLE_EVENT_TYPES: readonly TrialRecoveryLifecycleEventType[] = [
  'trial.recovery.day1',
  'trial.recovery.day3',
  'trial.recovery.day7',
  'trial.recovery.last_attempt',
] as const;

export const TRIAL_ENGAGEMENT_LIFECYCLE_EVENT_TYPES: readonly TrialEngagementLifecycleEventType[] = [
  'trial.engagement.started',
  'trial.engagement.day2',
  'trial.engagement.day4',
  'trial.engagement.day6',
  'trial.engagement.finalizing',
] as const;

export const LIFECYCLE_EVENT_TYPES: readonly LifecycleEventType[] = [
  'lead.created',
  'lead.qualified',
  'trial.started',
  'trial.expired',
  ...TRIAL_RECOVERY_LIFECYCLE_EVENT_TYPES,
  ...TRIAL_ENGAGEMENT_LIFECYCLE_EVENT_TYPES,
  'onboarding.started',
  'onboarding.completed',
  'subscription.activated',
  'subscription.cancelled',
  'customer.reactivated',
] as const;

export type LifecycleRoute = {
  eventType: LifecycleEventType;
  boardName: string;
  columnName: string;
};

export type LifecycleContext = {
  acquisitionLeadId?: string | null;
  tenantId?: string | null;
  subscriptionId?: string | null;
  invoiceId?: string | null;
  correlationId?: string | null;
  currentStage?: string | null;
  tenantStatus?: string | null;
  metadata?: Record<string, unknown>;
};

export type LifecycleRouteValidation = {
  boardKnown: boolean;
  columnKnown: boolean;
};

export type LifecycleResolution = {
  boardName: string;
  columnName: string;
  reason: string;
  eventType: LifecycleEventType | null;
  matched: boolean;
  fallback: boolean;
  validation: LifecycleRouteValidation;
};
