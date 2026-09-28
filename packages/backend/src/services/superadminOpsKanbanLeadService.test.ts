import { describe, expect, it } from 'vitest';
import { resolveOpsColumnForLead } from './superadminOpsKanbanLeadService.js';
import type { AcquisitionLeadRow } from '../acquisition/acquisitionTypes.js';

function lead(stage: AcquisitionLeadRow['current_stage']): AcquisitionLeadRow {
  return {
    id: '00000000-0000-4000-8000-000000000099',
    name: 'Test',
    email: 't@example.com',
    phone: '11999999999',
    source: 'web',
    campaign: null,
    utm_json: {},
    selected_plan_id: null,
    current_stage: stage,
    activation_score: 'low',
    abandoned_at: null,
    converted_at: null,
    tenant_id: null,
    correlation_id: 'corr-1',
    metadata_json: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe('resolveOpsColumnForLead', () => {
  it('maps new contact to Novo lead', () => {
    expect(resolveOpsColumnForLead(lead('contact_captured'))).toBe('Novo lead');
  });

  it('maps checkout abandoned column', () => {
    expect(resolveOpsColumnForLead(lead('checkout_abandoned'))).toBe('Checkout abandonado');
  });

  it('maps signup step checkout', () => {
    expect(resolveOpsColumnForLead(lead('contact_captured'), { signupStep: 'checkout' })).toBe('Checkout');
  });

  it('maps checkout_started stage to Checkout column', () => {
    expect(resolveOpsColumnForLead(lead('checkout_started'))).toBe('Checkout');
  });
});
