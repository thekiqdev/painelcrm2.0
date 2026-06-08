const STORAGE_KEY = 'acquisition_signup_credential_draft';
const PROVISION_FAIL_REASON_KEY = 'acquisition_provision_password_ui_reason';

type Draft = {
  leadId: string;
  password: string;
  savedAt: number;
};

export type CredentialDraftInspectReason = 'draft_missing' | 'lead_id_mismatch' | 'draft_invalid';

export type ProvisionPasswordUiReason =
  | 'hidden'
  | CredentialDraftInspectReason
  | 'provision_failed'
  | 'already_provisioned'
  | 'strict_mode_retry';

export function saveSignupCredentialDraft(leadId: string, password: string): void {
  if (typeof sessionStorage === 'undefined') return;
  const id = leadId.trim();
  if (!id || password.length < 6) return;
  const draft: Draft = { leadId: id, password, savedAt: Date.now() };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function getSignupCredentialDraft(leadId: string): { password: string } | null {
  const password = loadSignupCredentialDraft(leadId);
  return password ? { password } : null;
}

export function inspectCredentialDraft(leadId: string): { password: string } | { reason: CredentialDraftInspectReason } {
  if (typeof sessionStorage === 'undefined') {
    return { reason: 'draft_missing' };
  }
  const id = leadId.trim();
  if (!id) return { reason: 'draft_missing' };

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { reason: 'draft_missing' };
    const draft = JSON.parse(raw) as Draft;
    if (!draft?.leadId) return { reason: 'draft_invalid' };
    if (draft.leadId !== id) return { reason: 'lead_id_mismatch' };
    if (typeof draft.password !== 'string' || draft.password.length < 6) {
      return { reason: 'draft_invalid' };
    }
    return { password: draft.password };
  } catch {
    return { reason: 'draft_invalid' };
  }
}

export function loadSignupCredentialDraft(leadId: string): string | null {
  const inspected = inspectCredentialDraft(leadId);
  return 'password' in inspected ? inspected.password : null;
}

export function clearSignupCredentialDraft(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function setProvisionPasswordUiReason(reason: ProvisionPasswordUiReason): void {
  if (typeof sessionStorage === 'undefined') return;
  if (reason === 'hidden') {
    sessionStorage.removeItem(PROVISION_FAIL_REASON_KEY);
    return;
  }
  sessionStorage.setItem(PROVISION_FAIL_REASON_KEY, reason);
}

export function getStoredProvisionPasswordUiReason(): ProvisionPasswordUiReason | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(PROVISION_FAIL_REASON_KEY);
  if (!raw) return null;
  const allowed: ProvisionPasswordUiReason[] = [
    'draft_missing',
    'lead_id_mismatch',
    'draft_invalid',
    'provision_failed',
    'already_provisioned',
    'strict_mode_retry',
  ];
  return allowed.includes(raw as ProvisionPasswordUiReason) ? (raw as ProvisionPasswordUiReason) : null;
}

export function resolveProvisionPasswordUiState(input: {
  needsProvision: boolean;
  leadId?: string;
  provisionManualFallback: boolean;
  storedFailReason?: ProvisionPasswordUiReason | null;
}): { show: boolean; reason: ProvisionPasswordUiReason } {
  if (!input.needsProvision) {
    return { show: false, reason: 'hidden' };
  }

  if (input.provisionManualFallback && input.storedFailReason) {
    return { show: true, reason: input.storedFailReason };
  }

  if (!input.leadId?.trim()) {
    return { show: true, reason: 'draft_missing' };
  }

  const inspected = inspectCredentialDraft(input.leadId);
  if ('password' in inspected) {
    return { show: false, reason: 'hidden' };
  }

  return { show: true, reason: inspected.reason };
}
