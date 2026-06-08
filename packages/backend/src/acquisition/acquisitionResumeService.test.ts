import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AcquisitionLeadRow } from './acquisitionTypes.js';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./acquisitionOnboardingSessionService.js', () => ({
  onboardingSessionsTableExists: vi.fn().mockResolvedValue(true),
}));

import { pool } from '../utils/db.js';
import { resolveAcquisitionResume } from './acquisitionResumeService.js';

function lead(
  overrides: Partial<AcquisitionLeadRow> & { current_stage: AcquisitionLeadRow['current_stage'] },
): AcquisitionLeadRow {
  return {
    id: '5d0e980d-0f16-4a98-9233-d79874825c29',
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
    metadata_json: overrides.metadata_json ?? {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
    current_stage: overrides.current_stage,
  };
}

describe('resolveAcquisitionResume', () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it('plan_selected with plan offers verified continue to conversion', async () => {
    const r = await resolveAcquisitionResume(
      lead({ current_stage: 'plan_selected', selected_plan_id: 'plan-uuid' }),
    );
    expect(r.canContinueWhereLeftOff).toBe(true);
    expect(r.message).toContain('Continuando');
    expect(r.path).toContain('step=conversion');
    expect(r.path).toContain('plan=plan-uuid');
  });

  it('plan_selected without plan opens plan step (P0-D caso A)', async () => {
    const r = await resolveAcquisitionResume(lead({ current_stage: 'plan_selected' }));
    expect(r.canContinueWhereLeftOff).toBe(false);
    expect(r.path).toContain('step=plan');
    expect(r.message).not.toContain('Continuando de onde você parou');
  });

  it('converted directs to login without continue copy', async () => {
    const r = await resolveAcquisitionResume(lead({ current_stage: 'converted' }));
    expect(r.canContinueWhereLeftOff).toBe(false);
    expect(r.path).toBe('/login');
    expect(r.message).not.toContain('Continuando de onde você parou');
  });

  it('onboarding uses active session token when DB has session', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ session_token: 'tok-active', status: 'active', tenant_id: null }],
      rowCount: 1,
    } as never);

    const r = await resolveAcquisitionResume(lead({ current_stage: 'onboarding_in_progress' }));
    expect(r.canContinueWhereLeftOff).toBe(true);
    expect(r.path).toContain('session=tok-active');
  });

  it('completed session with tenant sends to login', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ session_token: 'tok-done', status: 'completed', tenant_id: 'tenant-1' }],
      rowCount: 1,
    } as never);

    const r = await resolveAcquisitionResume(lead({ current_stage: 'onboarding_in_progress' }));
    expect(r.canContinueWhereLeftOff).toBe(false);
    expect(r.path).toBe('/login');
  });

  it('onboarding without session falls back to cadastro without continue copy', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [{ c: '0' }], rowCount: 1 } as never);

    const r = await resolveAcquisitionResume(
      lead({
        current_stage: 'onboarding_in_progress',
        metadata_json: { onboarding_session_token: 'stale' },
      }),
    );
    expect(r.canContinueWhereLeftOff).toBe(false);
    expect(r.message).not.toBe('Continuando de onde você parou.');
    expect(r.path).toContain('/cadastro');
  });
});
