import { describe, expect, it } from 'vitest';
import {
  cadastroWizardPath,
  isPlaceholderLeadName,
  resolveSignupWizardStep,
  wizardStepBackTarget,
} from './acquisitionSignupWizard';

describe('acquisitionSignupWizard E2.1', () => {
  it('URL step=plan não força admin', () => {
    expect(
      resolveSignupWizardStep('plan', {
        id: 'lead-1',
        email: 'user@example.com',
        name: 'Maria',
        current_stage: 'contact_captured',
      }),
    ).toBe('plan');
  });

  it('URL step=conversion exige plano', () => {
    expect(resolveSignupWizardStep('conversion', { id: 'x', selected_plan_id: null })).toBe('plan');
    expect(
      resolveSignupWizardStep('conversion', { id: 'x', selected_plan_id: 'plan-1' }),
    ).toBe('conversion');
  });

  it('fallback contact_captured com e-mail pendente → admin', () => {
    expect(
      resolveSignupWizardStep(null, {
        id: 'lead-1',
        email: 'pending+5511999999999@signup.painelcrm.local',
        name: null,
        current_stage: 'contact_captured',
      }),
    ).toBe('admin');
  });

  it('legado step=credentials mapeia para admin', () => {
    expect(resolveSignupWizardStep('credentials', { id: 'lead-1' })).toBe('admin');
  });

  it('voltar do plano vai para admin', () => {
    expect(wizardStepBackTarget('plan')).toBe('admin');
    expect(wizardStepBackTarget('admin')).toBe('verification');
  });

  it('Solicitante é placeholder', () => {
    expect(isPlaceholderLeadName('Solicitante')).toBe(true);
    expect(isPlaceholderLeadName('Maria')).toBe(false);
  });

  it('cadastroWizardPath inclui lead e step', () => {
    expect(cadastroWizardPath({ leadId: 'abc', step: 'admin' })).toBe(
      '/cadastro?lead=abc&step=admin',
    );
  });
});
