import { useCallback, useEffect, useState } from 'react';
import {
  buildSignupUrl,
  loadSignupEntryConfig,
  SIGNUP_CACHE_EPOCH_KEY,
  SIGNUP_CACHE_INVALIDATED_EVENT,
  type SignupEntryConfig,
} from '@/lib/signupEntry';
import { getCachedSignupStrategy, type ActiveSignupFlow } from '@/lib/signupStrategy';

export function useSignupEntry(opts?: { planId?: string }) {
  const [config, setConfig] = useState<SignupEntryConfig | null>(null);
  const [flow, setFlow] = useState<ActiveSignupFlow>(() => getCachedSignupStrategy().flow);

  const reload = useCallback(
    async (force = true) => {
      const [cfg, strategy] = await Promise.all([
        loadSignupEntryConfig(force),
        import('@/lib/signupStrategy').then((m) => m.loadSignupStrategy(force)),
      ]);
      setConfig(cfg);
      setFlow(strategy.flow);
      return cfg;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const run = async (force = false) => {
      const cfg = await loadSignupEntryConfig(force);
      const strategy = await import('@/lib/signupStrategy').then((m) => m.loadSignupStrategy(force));
      if (!cancelled) {
        setConfig(cfg);
        setFlow(strategy.flow);
      }
    };

    void run(false);

    const onInvalidate = () => {
      void run(true);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === SIGNUP_CACHE_EPOCH_KEY) {
        void run(true);
      }
    };

    window.addEventListener(SIGNUP_CACHE_INVALIDATED_EVENT, onInvalidate);
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      window.removeEventListener(SIGNUP_CACHE_INVALIDATED_EVENT, onInvalidate);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const fallback = getCachedSignupStrategy().entry_url || '/checkout';
  const signupPath = config ? buildSignupUrl(config, { planId: opts?.planId }) : fallback;
  const isExclusiveSignup = flow === 'exclusive_signup';
  const showSignupOnLogin = !isExclusiveSignup;
  const signupLabel = 'Cadastro';

  return {
    config,
    signupPath,
    loading: config === null,
    flow,
    isExclusiveSignup,
    showSignupOnLogin,
    signupLabel,
    reload,
  };
}
