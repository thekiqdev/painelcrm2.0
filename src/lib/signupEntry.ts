import { apiClient } from '@/integrations/api/client';

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

export function getCachedSignupEntry(): SignupEntryConfig {
  return memoryCache ?? readSessionCache() ?? DEFAULT;
}

export async function loadSignupEntryConfig(force = false): Promise<SignupEntryConfig> {
  if (!force && memoryCache) return memoryCache;
  const cached = readSessionCache();
  if (!force && cached) {
    memoryCache = cached;
    return cached;
  }

  const res = await apiClient.get<{
    ok?: boolean;
    entry_mode?: SignupEntryMode;
    paths?: SignupEntryConfig['paths'];
  }>('/api/public/platform/signup-entry');

  if (res.data?.paths && res.data.entry_mode) {
    const cfg: SignupEntryConfig = {
      entry_mode: res.data.entry_mode,
      paths: res.data.paths,
    };
    memoryCache = cfg;
    writeSessionCache(cfg);
    return cfg;
  }

  return getCachedSignupEntry();
}

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
