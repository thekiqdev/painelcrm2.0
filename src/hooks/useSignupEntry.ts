import { useEffect, useState } from 'react';
import { buildSignupUrl, loadSignupEntryConfig, type SignupEntryConfig } from '@/lib/signupEntry';

export function useSignupEntry(opts?: { planId?: string }) {
  const [config, setConfig] = useState<SignupEntryConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSignupEntryConfig().then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signupPath = config ? buildSignupUrl(config, { planId: opts?.planId }) : '/checkout';

  return { config, signupPath, loading: config === null };
}
