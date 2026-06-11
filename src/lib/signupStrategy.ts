import { apiClient } from '@/integrations/api/client';

export type ActiveSignupFlow = 'checkout' | 'exclusive_signup';

export type SignupStrategyFeatures = {
  phone_verification: boolean;
  closed_trial_mode: boolean;
  whatsapp_code_required: boolean;
  allow_checkout: boolean;
  show_exclusive_badges: boolean;
};

export type SignupStrategy = {
  flow: ActiveSignupFlow;
  entry_url: string;
  closed_trial: boolean;
  features: SignupStrategyFeatures;
};

const CACHE_KEY = 'painelcrm_signup_strategy_v1';
const SESSION_EPOCH_KEY = 'painelcrm_signup_strategy_session_epoch';
export const SIGNUP_CACHE_EPOCH_KEY = 'painelcrm_signup_cache_epoch';

const DEFAULT: SignupStrategy = {
  flow: 'checkout',
  entry_url: '/checkout',
  closed_trial: false,
  features: {
    phone_verification: false,
    closed_trial_mode: false,
    whatsapp_code_required: false,
    allow_checkout: true,
    show_exclusive_badges: false,
  },
};

let memoryCache: SignupStrategy | null = null;

function getGlobalCacheEpoch(): string {
  try {
    return localStorage.getItem(SIGNUP_CACHE_EPOCH_KEY) || '0';
  } catch {
    return '0';
  }
}

function readSessionEpoch(): string | null {
  try {
    return sessionStorage.getItem(SESSION_EPOCH_KEY);
  } catch {
    return null;
  }
}

export function isSignupSessionCacheValid(): boolean {
  const sessionEpoch = readSessionEpoch();
  if (!sessionEpoch) return false;
  return sessionEpoch === getGlobalCacheEpoch();
}

function readSessionCache(): SignupStrategy | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SignupStrategy;
  } catch {
    return null;
  }
}

function writeSessionCache(strategy: SignupStrategy): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(strategy));
    sessionStorage.setItem(SESSION_EPOCH_KEY, getGlobalCacheEpoch());
  } catch {
    /* ignore */
  }
}

export function bumpSignupCacheEpoch(): void {
  try {
    localStorage.setItem(SIGNUP_CACHE_EPOCH_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearSignupStrategyCache(): void {
  memoryCache = null;
  try {
    sessionStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem(SESSION_EPOCH_KEY);
  } catch {
    /* ignore */
  }
}

export function getCachedSignupStrategy(): SignupStrategy {
  if (memoryCache && isSignupSessionCacheValid()) return memoryCache;
  const cached = readSessionCache();
  if (cached && isSignupSessionCacheValid()) return cached;
  return DEFAULT;
}

export async function loadSignupStrategy(force = false): Promise<SignupStrategy> {
  const cacheValid = isSignupSessionCacheValid();

  if (!force && cacheValid && memoryCache) return memoryCache;

  const cached = readSessionCache();
  if (!force && cacheValid && cached) {
    memoryCache = cached;
    return cached;
  }

  const res = await apiClient.get<{
    flow?: ActiveSignupFlow;
    entry_url?: string;
    closed_trial?: boolean;
    features?: SignupStrategyFeatures;
  }>('/api/public/signup-flow');

  if (res.data?.flow && res.data.entry_url && res.data.features) {
    const strategy: SignupStrategy = {
      flow: res.data.flow,
      entry_url: res.data.entry_url,
      closed_trial: Boolean(res.data.closed_trial),
      features: res.data.features,
    };
    memoryCache = strategy;
    writeSessionCache(strategy);
    return strategy;
  }

  return getCachedSignupStrategy();
}

/** URL principal de signup para CTAs públicos (fonte: active_signup_flow). */
export async function getSignupEntryUrl(opts?: { planId?: string; leadId?: string }): Promise<string> {
  const strategy = await loadSignupStrategy();
  const base = strategy.entry_url || '/checkout';
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
