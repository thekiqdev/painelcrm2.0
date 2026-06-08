/**
 * P0-B.1 — testes do módulo frontend (import cross-package em dev).
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeResumeNavigation,
  resolveWizardStepFromLead,
  resolveWizardStepIndex,
  shouldShowResumeBanner,
  shouldSkipSignupStepOnResume,
  stepIndexFromUrlStep,
} from '../../../src/lib/acquisitionSignupResume.js';

describe('acquisitionSignupResume P0-B.1', () => {
  it('caso 1: contact_captured → etapa plano', () => {
    const nav = normalizeResumeNavigation('/cadastro?lead=abc&step=plan', null);
    expect(nav.stepIndex).toBe(1);
    expect(nav.search).toContain('step=plan');
  });

  it('caso 2: plan_selected com plano → conversão', () => {
    const nav = normalizeResumeNavigation('/cadastro?lead=abc&step=conversion', 'plan-uuid');
    expect(nav.stepIndex).toBe(2);
    expect(nav.search).toContain('step=conversion');
  });

  it('caso 3: conversion sem plano → fallback plano', () => {
    const nav = normalizeResumeNavigation('/cadastro?lead=abc&step=conversion', null);
    expect(nav.stepIndex).toBe(1);
    expect(nav.search).toContain('step=plan');
  });

  it('caso 4: lead novo — step 0', () => {
    expect(stepIndexFromUrlStep(null)).toBe(0);
    expect(resolveWizardStepIndex(null, null)).toBe(0);
  });

  it('caso 5: continue_lead não chama signup/step no handler', () => {
    expect(shouldSkipSignupStepOnResume('continue_lead')).toBe(true);
    expect(shouldSkipSignupStepOnResume('new_lead')).toBe(false);
  });

  it('P0-D: plan_selected sem plano na URL infere etapa plano', () => {
    expect(
      resolveWizardStepFromLead(null, {
        id: 'x',
        current_stage: 'plan_selected',
        selected_plan_id: null,
      }),
    ).toBe(1);
  });

  it('P0-D: resume_verified false oculta copy "Continuando"', () => {
    expect(
      shouldShowResumeBanner(false, 'Continuando de onde você parou.'),
    ).toBe(false);
    expect(shouldShowResumeBanner(true, 'Continuando de onde você parou.')).toBe(true);
  });
});
