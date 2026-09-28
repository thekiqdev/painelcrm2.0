import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AcquisitionLeadRow } from './acquisitionTypes.js';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./acquisitionLeadRepository.js', () => ({
  findAcquisitionLeadById: vi.fn(),
  updateAcquisitionLeadStage: vi.fn(),
}));

vi.mock('./acquisitionResumeService.js', () => ({
  findAccessibleSessionForLead: vi.fn(),
  isSessionTokenAccessible: vi.fn(),
}));

import { updateAcquisitionLeadStage } from './acquisitionLeadRepository.js';
import {
  findAccessibleSessionForLead,
  isSessionTokenAccessible,
} from './acquisitionResumeService.js';
import { reconcileAcquisitionLeadForResume } from './acquisitionLeadReconciliationService.js';

function lead(
  overrides: Partial<AcquisitionLeadRow> & { current_stage: AcquisitionLeadRow['current_stage'] },
): AcquisitionLeadRow {
  return {
    id: 'lead-1',
    name: 'Test',
    email: 't@example.com',
    phone: '11999999999',
    source: 'web',
    campaign: null,
    utm_json: {},
    selected_plan_id: null,
    activation_score: 'low',
    abandoned_at: null,
    converted_at: null,
    tenant_id: null,
    correlation_id: 'corr-1',
    metadata_json: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
    current_stage: overrides.current_stage,
  };
}

describe('reconcileAcquisitionLeadForResume P0-D', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('caso A: plan_selected sem plano → contact_captured', async () => {
    const fixed = lead({ current_stage: 'contact_captured' });
    vi.mocked(updateAcquisitionLeadStage).mockResolvedValue(fixed);

    const outcome = await reconcileAcquisitionLeadForResume(
      lead({ current_stage: 'plan_selected', selected_plan_id: null }),
    );

    expect(outcome.reconciled).toBe(true);
    expect(outcome.reason).toBe('plan_selected_without_plan_id');
    expect(outcome.corrected_stage).toBe('contact_captured');
    expect(updateAcquisitionLeadStage).toHaveBeenCalledWith(
      'lead-1',
      'contact_captured',
      expect.objectContaining({ metadata: expect.any(Object) }),
    );
  });

  it('caso B: onboarding sem sessão → activation_prepared com plano', async () => {
    vi.mocked(findAccessibleSessionForLead).mockResolvedValue(null);
    vi.mocked(isSessionTokenAccessible).mockResolvedValue(false);
    const fixed = lead({ current_stage: 'activation_prepared', selected_plan_id: 'p1' });
    vi.mocked(updateAcquisitionLeadStage).mockResolvedValue(fixed);

    const outcome = await reconcileAcquisitionLeadForResume(
      lead({ current_stage: 'onboarding_in_progress', selected_plan_id: 'p1' }),
    );

    expect(outcome.reconciled).toBe(true);
    expect(outcome.reason).toBe('onboarding_without_session');
    expect(outcome.corrected_stage).toBe('activation_prepared');
  });
});
