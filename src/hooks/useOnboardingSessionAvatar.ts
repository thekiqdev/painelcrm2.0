import { useCallback, useEffect, useState } from 'react';
import { getOnboardingSessionAvatar, setOnboardingSessionAvatar } from '@/lib/onboardingSessionStorage';

export const ONBOARDING_AVATAR_CHANGED = 'painelcrm:onboarding-avatar-changed';

export function useOnboardingSessionAvatar() {
  const [avatarUrl, setAvatarUrlState] = useState<string | null>(() => getOnboardingSessionAvatar());

  useEffect(() => {
    const sync = () => setAvatarUrlState(getOnboardingSessionAvatar());
    window.addEventListener(ONBOARDING_AVATAR_CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ONBOARDING_AVATAR_CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setAvatarUrl = useCallback((url: string | null) => {
    setOnboardingSessionAvatar(url);
    setAvatarUrlState(url);
    window.dispatchEvent(new Event(ONBOARDING_AVATAR_CHANGED));
  }, []);

  return { avatarUrl, setAvatarUrl };
}
