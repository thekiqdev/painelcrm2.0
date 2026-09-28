const STORAGE_KEY = 'painelcrm.onboardingSession';

export type OnboardingSessionDraft = {
  avatarDataUrl?: string | null;
  updatedAt?: string;
};

function read(): OnboardingSessionDraft {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as OnboardingSessionDraft;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function write(draft: OnboardingSessionDraft): void {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
  );
}

export function getOnboardingSessionAvatar(): string | null {
  return read().avatarDataUrl ?? null;
}

export function setOnboardingSessionAvatar(dataUrl: string | null): void {
  const current = read();
  write({ ...current, avatarDataUrl: dataUrl });
}

export function clearOnboardingSessionDraft(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
