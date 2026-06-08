import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveSignupCredentialDraft,
  loadSignupCredentialDraft,
  getSignupCredentialDraft,
  clearSignupCredentialDraft,
  inspectCredentialDraft,
  resolveProvisionPasswordUiState,
  setProvisionPasswordUiReason,
  getStoredProvisionPasswordUiReason,
} from './acquisitionSignupCredentialDraft';

const LEAD = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

function mockSessionStorage() {
  const store: Record<string, string> = {};
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  });
}

describe('acquisitionSignupCredentialDraft', () => {
  beforeEach(() => {
    mockSessionStorage();
    sessionStorage.clear();
  });

  it('save and load by lead id', () => {
    saveSignupCredentialDraft(LEAD, 'secret12');
    expect(loadSignupCredentialDraft(LEAD)).toBe('secret12');
    expect(getSignupCredentialDraft(LEAD)).toEqual({ password: 'secret12' });
  });

  it('returns null for wrong lead or rejected short password save', () => {
    saveSignupCredentialDraft(LEAD, 'secret12');
    expect(inspectCredentialDraft(OTHER)).toEqual({ reason: 'lead_id_mismatch' });
    clearSignupCredentialDraft();
    saveSignupCredentialDraft(LEAD, '123');
    expect(inspectCredentialDraft(LEAD)).toEqual({ reason: 'draft_missing' });
  });

  it('clear removes draft', () => {
    saveSignupCredentialDraft(LEAD, 'secret12');
    clearSignupCredentialDraft();
    expect(inspectCredentialDraft(LEAD)).toEqual({ reason: 'draft_missing' });
  });

  it('resolveProvisionPasswordUiState — draft ok hides password ui', () => {
    saveSignupCredentialDraft(LEAD, 'secret12');
    const state = resolveProvisionPasswordUiState({
      needsProvision: true,
      leadId: LEAD,
      provisionManualFallback: false,
    });
    expect(state.show).toBe(false);
    expect(state.reason).toBe('hidden');
  });

  it('resolveProvisionPasswordUiState — draft missing shows ui', () => {
    const state = resolveProvisionPasswordUiState({
      needsProvision: true,
      leadId: LEAD,
      provisionManualFallback: false,
    });
    expect(state.show).toBe(true);
    expect(state.reason).toBe('draft_missing');
  });

  it('persists provision ui reason code', () => {
    setProvisionPasswordUiReason('provision_failed');
    expect(getStoredProvisionPasswordUiReason()).toBe('provision_failed');
    setProvisionPasswordUiReason('hidden');
    expect(getStoredProvisionPasswordUiReason()).toBeNull();
  });
});
