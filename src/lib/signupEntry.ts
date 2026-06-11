import {
  bumpSignupCacheEpoch,
  clearSignupStrategyCache,
  getSignupEntryUrl as getSignupEntryUrlFromStrategy,
  isSignupSessionCacheValid,
  loadSignupStrategy,
  SIGNUP_CACHE_EPOCH_KEY,
} from '@/lib/signupStrategy';

export type SignupEntryMode = 'legacy_checkout' | 'acquisition_flow';

export type SignupEntryConfig = {
  entry_mode: SignupEntryMode;
  paths: {
    signup: string;
    legacy_checkout: string;
    acquisition_signup: string;
    activation_checkout: string;
    post_activation: string;
  };
};

const CACHE_KEY = 'painelcrm_signup_entry_v1';
const DEFAULT: SignupEntryConfig = {
  entry_mode: 'legacy_checkout',
  paths: {
    signup: '/checkout',
    legacy_checkout: '/checkout',
    acquisition_signup: '/cadastro',
    activation_checkout: '/ativacao/checkout',
    post_activation: '/onboarding',
  },
};

let memoryCache: SignupEntryConfig | null = null;

function readSessionCache(): SignupEntryConfig | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SignupEntryConfig;
  } catch {
    return null;
  }
}

function writeSessionCache(cfg: SignupEntryConfig): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

export function clearSignupEntryCache(): void {
  memoryCache = null;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export const SIGNUP_CACHE_INVALIDATED_EVENT = 'signup-cache-invalidated';

/** Limpa memory + sessionStorage e sinaliza outras abas/componentes. */
export function invalidateSignupCaches(): void {
  clearSignupStrategyCache();
  clearSignupEntryCache();
  bumpSignupCacheEpoch();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SIGNUP_CACHE_INVALIDATED_EVENT));
  }
}

export function getCachedSignupEntry(): SignupEntryConfig {
  if (memoryCache && isSignupSessionCacheValid()) return memoryCache;
  const cached = readSessionCache();
  if (cached && isSignupSessionCacheValid()) return cached;
  return DEFAULT;
}

export async function loadSignupEntryConfig(force = false): Promise<SignupEntryConfig> {
  const cacheValid = isSignupSessionCacheValid();

  if (!force && cacheValid && memoryCache) return memoryCache;

  const cached = readSessionCache();
  if (!force && cacheValid && cached) {
    memoryCache = cached;
    return cached;
  }

  const strategy = await loadSignupStrategy(force);
  const entry_mode: SignupEntryMode =
    strategy.flow === 'exclusive_signup' ? 'acquisition_flow' : 'legacy_checkout';
  const cfg: SignupEntryConfig = {
    entry_mode,
    paths: {
      signup: strategy.entry_url,
      legacy_checkout: '/checkout',
      acquisition_signup: '/cadastro',
      activation_checkout: '/ativacao/checkout',
      post_activation: DEFAULT.paths.post_activation,
    },
  };
  memoryCache = cfg;
  writeSessionCache(cfg);
  return cfg;
}

export { getSignupEntryUrlFromStrategy as getSignupEntryUrl };
export { SIGNUP_CACHE_EPOCH_KEY };

/** URL principal de signup para CTAs públicos. */
export function buildSignupUrl(
  cfg: SignupEntryConfig,
  opts?: { planId?: string; leadId?: string },
): string {
  const base = cfg.paths.signup || '/checkout';
  if (base === '/cadastro' || base.startsWith('/cadastro')) {
    const q = new URLSearchParams();
    if (opts?.planId) q.set('plan', opts.planId);
    if (opts?.leadId) q.set('lead', opts.leadId);
    const qs = q.toString();
    return qs ? `/cadastro?${qs}` : '/cadastro';
  }
  if (opts?.planId) return `/checkout?plan=${encodeURIComponent(opts.planId)}`;
  return '/checkout';
}

export function buildActivationCheckoutUrl(opts: {
  leadId: string;
  planId?: string;
  usersCount?: number;
}): string {
  const q = new URLSearchParams({ lead: opts.leadId });
  if (opts.planId) q.set('plan', opts.planId);
  if (opts.usersCount != null && opts.usersCount > 0) q.set('users', String(opts.usersCount));
  return `/ativacao/checkout?${q.toString()}`;
}
