import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./acquisitionLeadRepository.js', () => ({
  findAcquisitionLeadById: vi.fn(),
  findAcquisitionLeadByEmail: vi.fn(),
  findAcquisitionLeadByPhoneVariants: vi.fn(),
  finalizeAcquisitionLeadEmail: vi.fn(),
  mergeAcquisitionLeadMetadata: vi.fn(),
  updateAcquisitionLeadContactForLead: vi.fn(),
  upsertAcquisitionLeadContact: vi.fn(),
}));

vi.mock('./acquisitionOutbox.js', () => ({
  publishAcquisitionSignupStarted: vi.fn(),
  syncAcquisitionLeadOpsKanbanProfile: vi.fn(),
}));

vi.mock('./acquisitionResumeService.js', () => ({
  resolveAcquisitionResume: vi.fn().mockResolvedValue({
    path: '/cadastro?lead=lead-a&step=plan',
    step: 1,
    canContinueWhereLeftOff: true,
    message: 'Continuando de onde você parou.',
  }),
}));

vi.mock('./acquisitionLeadReconciliationService.js', () => ({
  reconcileAcquisitionLeadForResume: vi.fn().mockImplementation(async (lead) => ({ lead })),
}));

vi.mock('./acquisitionResumeLogger.js', () => ({
  logResumeDetected: vi.fn(),
}));

import {
  findAcquisitionLeadById,
  findAcquisitionLeadByEmail,
  findAcquisitionLeadByPhoneVariants,
  finalizeAcquisitionLeadEmail,
  updateAcquisitionLeadContactForLead,
  upsertAcquisitionLeadContact,
} from './acquisitionLeadRepository.js';
import { resolveAcquisitionContact } from './acquisitionContactIntelligenceService.js';
import { pool } from '../utils/db.js';

const leadA = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Solicitante',
  email: 'pending+5511999999999@signup.painelcrm.local',
  phone: '5511999999999',
  source: 'web',
  campaign: null,
  utm_json: {},
  selected_plan_id: null,
  current_stage: 'qualified' as const,
  activation_score: 'low' as const,
  abandoned_at: null,
  converted_at: null,
  tenant_id: null,
  correlation_id: 'corr-a',
  metadata_json: { email_pending: true },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const leadAFinalized = {
  ...leadA,
  email: 'admin@empresa.com',
  metadata_json: { email_confirmed_at: new Date().toISOString() },
};

describe('resolveAcquisitionContact E2.7', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pool.query).mockResolvedValue({ rows: [] });
    vi.mocked(findAcquisitionLeadByEmail).mockResolvedValue(null);
    vi.mocked(upsertAcquisitionLeadContact).mockResolvedValue(leadAFinalized);
    vi.mocked(updateAcquisitionLeadContactForLead).mockResolvedValue(leadAFinalized);
    vi.mocked(finalizeAcquisitionLeadEmail).mockResolvedValue(leadAFinalized);
  });

  it('reutiliza lead por lead_id e finaliza e-mail placeholder', async () => {
    vi.mocked(findAcquisitionLeadById).mockResolvedValue(leadA);

    const result = await resolveAcquisitionContact({
      leadId: leadA.id,
      email: 'admin@empresa.com',
      phone: '11999999999',
      correlationId: 'corr-resolve',
    });

    expect(result.lead.id).toBe(leadA.id);
    expect(finalizeAcquisitionLeadEmail).toHaveBeenCalledWith(
      leadA.id,
      'admin@empresa.com',
      'corr-resolve',
    );
    expect(updateAcquisitionLeadContactForLead).toHaveBeenCalled();
    expect(upsertAcquisitionLeadContact).not.toHaveBeenCalled();
    expect(result.action).toBe('continue_lead');
  });

  it('reutiliza lead por telefone com variante sem DDI', async () => {
    vi.mocked(findAcquisitionLeadById).mockResolvedValue(null);
    vi.mocked(findAcquisitionLeadByPhoneVariants).mockResolvedValue(leadA);

    const result = await resolveAcquisitionContact({
      email: 'admin@empresa.com',
      phone: '11999999999',
      correlationId: 'corr-phone',
    });

    expect(findAcquisitionLeadByPhoneVariants).toHaveBeenCalled();
    expect(result.lead.id).toBe(leadA.id);
    expect(upsertAcquisitionLeadContact).not.toHaveBeenCalled();
  });

  it('só insere quando não há lead por id, telefone ou e-mail', async () => {
    vi.mocked(findAcquisitionLeadById).mockResolvedValue(null);
    vi.mocked(findAcquisitionLeadByPhoneVariants).mockResolvedValue(null);
    vi.mocked(findAcquisitionLeadByEmail).mockResolvedValue(null);

    const result = await resolveAcquisitionContact({
      email: 'novo@empresa.com',
      phone: '11988887777',
      correlationId: 'corr-new',
    });

    expect(upsertAcquisitionLeadContact).toHaveBeenCalled();
    expect(finalizeAcquisitionLeadEmail).not.toHaveBeenCalled();
    expect(result.action).toBe('new_lead');
  });
});
