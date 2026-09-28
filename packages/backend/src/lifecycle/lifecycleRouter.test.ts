import { describe, expect, it } from 'vitest';
import { LIFECYCLE_DEFAULT_ROUTES } from './lifecycleDefaultRoutes.js';
import { resolveLifecycleRoute } from './lifecycleRouter.js';
import { simulateLifecycleRoute } from './lifecycleDebugService.js';
import { inferLifecycleEventFromAcquisitionSync } from './lifecycleStageMapping.js';
import { LIFECYCLE_EVENT_TYPES } from './lifecycleTypes.js';

describe('resolveLifecycleRoute', () => {
  it('resolves all known default events', () => {
    for (const eventType of LIFECYCLE_EVENT_TYPES) {
      const route = LIFECYCLE_DEFAULT_ROUTES.find((r) => r.eventType === eventType);
      expect(route, `missing default route for ${eventType}`).toBeDefined();
      const res = resolveLifecycleRoute(eventType, {
        acquisitionLeadId: 'lead-1',
        tenantId: 'tenant-1',
        correlationId: 'corr-1',
      });
      expect(res.matched).toBe(true);
      expect(res.fallback).toBe(false);
      expect(res.eventType).toBe(eventType);
      expect(res.boardName).toBe(route!.boardName);
      expect(res.columnName).toBe(route!.columnName);
      expect(res.validation.boardKnown).toBe(true);
    }
  });

  it('returns fallback for invalid event type', () => {
    const res = resolveLifecycleRoute('not.a.real.event');
    expect(res.matched).toBe(false);
    expect(res.fallback).toBe(true);
    expect(res.eventType).toBe(null);
    expect(res.boardName).toBe('Aquisição');
    expect(res.columnName).toBe('Novo lead');
    expect(res.reason).toContain('unknown_event_type');
  });

  it('annotates reason when column is outside seed but in future catalog', () => {
    const res = resolveLifecycleRoute('lead.created');
    expect(res.columnName).toBe('Novo Lead');
    expect(res.validation.columnKnown).toBe(true);
  });

  it('flags column not in catalog for Sprint G future columns', () => {
    const onboardingStarted = resolveLifecycleRoute('onboarding.started');
    expect(onboardingStarted.boardName).toBe('Onboarding');
    expect(onboardingStarted.columnName).toBe('Provisionado');
    expect(onboardingStarted.validation.boardKnown).toBe(true);
    expect(onboardingStarted.validation.columnKnown).toBe(true);

    const subscription = resolveLifecycleRoute('subscription.activated');
    expect(subscription.columnName).toBe('Novo Cliente');
    expect(subscription.validation.columnKnown).toBe(true);
  });

  it('marks unknown board/column via reason when validating arbitrary resolution', () => {
    const res = resolveLifecycleRoute('lead.created');
    expect(res.validation.boardKnown).toBe(true);
    const unknownBoard = resolveLifecycleRoute('trial.expired');
    expect(unknownBoard.boardName).toBe('Reativação');
    expect(unknownBoard.columnName).toBe('Trial expirado');
    expect(unknownBoard.reason).not.toContain('board_not_in_catalog');
  });

  it('simulateLifecycleRoute returns same resolution as resolve', () => {
    const sim = simulateLifecycleRoute('trial.started', { tenantId: 't1' });
    const direct = resolveLifecycleRoute('trial.started', { tenantId: 't1' });
    expect(sim.resolution).toEqual(direct);
    expect(sim.resolution.boardName).toBe('Aquisição');
    expect(sim.resolution.columnName).toBe('Trial iniciado');
  });

  it('fallback path for empty string event', () => {
    const res = resolveLifecycleRoute('');
    expect(res.fallback).toBe(true);
    expect(res.matched).toBe(false);
  });
});

describe('inferLifecycleEventFromAcquisitionSync', () => {
  it('maps signup steps and stages', () => {
    expect(
      inferLifecycleEventFromAcquisitionSync({
        currentStage: 'contact_captured',
        cardCreated: true,
        signupStep: 'plan',
      }),
    ).toBe('lead.qualified');
    expect(
      inferLifecycleEventFromAcquisitionSync({
        currentStage: 'qualified',
        cardCreated: true,
      }),
    ).toBe('lead.qualified');
    expect(
      inferLifecycleEventFromAcquisitionSync({
        currentStage: 'trial_started',
        cardCreated: false,
      }),
    ).toBe('trial.started');
    expect(
      inferLifecycleEventFromAcquisitionSync({
        currentStage: 'onboarding_in_progress',
        cardCreated: false,
      }),
    ).toBe('onboarding.started');
    expect(
      inferLifecycleEventFromAcquisitionSync({
        currentStage: 'converted',
        cardCreated: false,
      }),
    ).toBe(null);
  });
});
