import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./acquisitionFlags.js', () => ({
  isAcquisitionPreSignupEnabled: vi.fn(),
  isAcquisitionSignupFlowEnabled: vi.fn(),
  isAcquisitionTrialFlowEnabled: vi.fn(),
  isAcquisitionRecoveryEnabled: vi.fn(),
  isAcquisitionActivationTrackingEnabled: vi.fn(),
  isAcquisitionActivationScoreEnabled: vi.fn(),
  isAcquisitionOnboardingKickoffEnabled: vi.fn(),
}));

vi.mock('./acquisitionLeadRepository.js', () => ({
  acquisitionLeadsTableExists: vi.fn().mockResolvedValue(true),
  insertAcquisitionLead: vi.fn(),
  findAcquisitionLeadById: vi.fn(),
  updateAcquisitionLeadStage: vi.fn(),
  updateAcquisitionLeadActivationScore: vi.fn(),
}));

vi.mock('./activationTrackingService.js', () => ({
  trackActivationEvent: vi.fn().mockResolvedValue({ tracked: true }),
  countActivationEventsForLead: vi.fn().mockResolvedValue(2),
  listActivationEventsForLead: vi.fn().mockResolvedValue(['signup_started', 'trial_started']),
}));

vi.mock('../automation/orchestration/orchestrationService.js', () => ({
  startWorkflow: vi.fn().mockResolvedValue({ outcome: 'shadow_executed' }),
}));

vi.mock('../automation/automationJobRepository.js', () => ({
  scheduleAutomationJob: vi.fn().mockResolvedValue({ id: 'job-1' }),
}));

vi.mock('../communication/channelProviderGateway/channelProviderGateway.js', () => ({
  sendTransactionalMessage: vi.fn().mockResolvedValue({ outcome: 'shadow_logged', shadow: true }),
}));

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [{ id: 'plan-trial-1' }] }) },
}));

vi.mock('../platform/exclusiveSignupFlowGate.js', () => ({
  isExclusiveSignupFlowActive: vi.fn(),
  buildExclusiveSignupInactivePayload: vi.fn(),
}));

import {
  isAcquisitionPreSignupEnabled,
  isAcquisitionSignupFlowEnabled,
  isAcquisitionTrialFlowEnabled,
  isAcquisitionRecoveryEnabled,
  isAcquisitionActivationScoreEnabled,
  isAcquisitionOnboardingKickoffEnabled,
} from './acquisitionFlags.js';
import {
  insertAcquisitionLead,
  findAcquisitionLeadById,
  updateAcquisitionLeadStage,
} from './acquisitionLeadRepository.js';
import { createPreSignupLead, orchestrateSignupStep } from './signupOrchestrationService.js';
import { orchestrateTesteGratis } from './trialOrchestrationService.js';
import { evaluateRecoveryEligibility, markAcquisitionAbandoned } from './acquisitionRecoveryService.js';
import { computeActivationScore } from './activationScoreService.js';
import { kickoffOnboarding } from './onboardingKickoffService.js';
import { sendTransactionalMessage } from '../communication/channelProviderGateway/channelProviderGateway.js';
import { isExclusiveSignupFlowActive } from '../platform/exclusiveSignupFlowGate.js';

const sampleLead = {
  id: 'lead-1',
  name: 'Test',
  email: 'test@example.com',
  phone: '5511999999999',
  source: 'web',
  campaign: null,
  utm_json: {},
  selected_plan_id: 'plan-1',
  current_stage: 'checkout_abandoned' as const,
  activation_score: 'low' as const,
  abandoned_at: new Date().toISOString(),
  converted_at: null,
  tenant_id: null,
  correlation_id: 'corr-1',
  metadata_json: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('acquisition lead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAcquisitionPreSignupEnabled).mockResolvedValue(true);
    vi.mocked(isAcquisitionTrialFlowEnabled).mockResolvedValue(true);
  });

  it('creates pre-signup lead when flag on', async () => {
    vi.mocked(insertAcquisitionLead).mockResolvedValue(sampleLead);
    const result = await createPreSignupLead({
      email: 'test@example.com',
      correlationId: 'corr-1',
    });
    expect(result.ok).toBe(true);
    expect(result.lead?.id).toBe('lead-1');
  });
});

describe('trial orchestration', () => {
  beforeEach(() => {
    vi.mocked(isAcquisitionTrialFlowEnabled).mockResolvedValue(true);
    vi.mocked(isAcquisitionPreSignupEnabled).mockResolvedValue(true);
    vi.mocked(isAcquisitionOnboardingKickoffEnabled).mockResolvedValue(true);
    vi.mocked(insertAcquisitionLead).mockResolvedValue({ ...sampleLead, current_stage: 'contact_captured' });
    vi.mocked(updateAcquisitionLeadStage).mockResolvedValue({ ...sampleLead, current_stage: 'trial_started' });
  });

  it('orchestrates teste-gratis without tenant creation', async () => {
    const result = await orchestrateTesteGratis({
      name: 'Test',
      email: 'test@example.com',
      phone: '5511999999999',
      correlationId: 'corr-trial',
    });
    expect(result.ok).toBe(true);
    expect(result.checkoutPath).toContain('/checkout');
    expect(result.shadow).toBe(true);
  });
});

describe('signup orchestration', () => {
  beforeEach(() => {
    vi.mocked(isExclusiveSignupFlowActive).mockResolvedValue(true);
    vi.mocked(isAcquisitionSignupFlowEnabled).mockResolvedValue(true);
    vi.mocked(isAcquisitionPreSignupEnabled).mockResolvedValue(true);
    vi.mocked(insertAcquisitionLead).mockResolvedValue(sampleLead);
    vi.mocked(updateAcquisitionLeadStage).mockResolvedValue({ ...sampleLead, current_stage: 'plan_selected' });
  });

  it('advances signup step', async () => {
    const result = await orchestrateSignupStep({
      email: 'test@example.com',
      phone: '5511999999999',
      step: 'plan',
      correlationId: 'corr-signup',
    });
    expect(result.ok).toBe(true);
    expect(result.nextPath).toContain('/cadastro');
  });
});

describe('recovery', () => {
  it('evaluates eligibility for abandoned checkout', () => {
    const eligibility = evaluateRecoveryEligibility(sampleLead);
    expect(eligibility.eligible).toBe(true);
  });

  it('marks abandoned when recovery flag on', async () => {
    vi.mocked(isAcquisitionRecoveryEnabled).mockResolvedValue(true);
    vi.mocked(findAcquisitionLeadById).mockResolvedValue(sampleLead);
    vi.mocked(updateAcquisitionLeadStage).mockResolvedValue(sampleLead);
    const result = await markAcquisitionAbandoned({ leadId: 'lead-1', correlationId: 'corr-r' });
    expect(result.ok).toBe(true);
  });
});

describe('activation score', () => {
  beforeEach(() => {
    vi.mocked(isAcquisitionActivationScoreEnabled).mockResolvedValue(true);
  });

  it('computes medium score with trial event', () => {
    const score = computeActivationScore({
      lead: sampleLead,
      eventTypes: ['signup_started', 'trial_started'],
      eventCount: 2,
    });
    expect(score).toBe('medium');
  });
});

describe('onboarding kickoff', () => {
  beforeEach(() => {
    vi.mocked(isAcquisitionOnboardingKickoffEnabled).mockResolvedValue(true);
    vi.mocked(updateAcquisitionLeadStage).mockResolvedValue({ ...sampleLead, current_stage: 'onboarding_kickoff' });
  });

  it('integrates communication gateway shadow', async () => {
    await kickoffOnboarding({
      lead: sampleLead,
      correlationId: 'corr-k',
      trigger: 'trial',
    });
    expect(sendTransactionalMessage).toHaveBeenCalled();
  });
});
