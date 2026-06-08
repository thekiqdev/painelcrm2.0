import { pool } from '../utils/db.js';
import { isAcquisitionSignupFlowEnabled } from '../acquisition/acquisitionFlags.js';
import { getAcquisitionPublicConfig } from '../acquisition/acquisitionFlags.js';

export type SignupEntryMode = 'legacy_checkout' | 'acquisition_flow';

export type SignupEntryRuntimeConfig = {
  mode: SignupEntryMode;
  post_activation_path: string;
  legacy_checkout_enabled: boolean;
  acquisition_flow_enabled: boolean;
};

const SIGNUP_ENTRY_KEY = 'signup_entry';

const DEFAULT_CONFIG: SignupEntryRuntimeConfig = {
  mode: 'legacy_checkout',
  post_activation_path: '/onboarding',
  legacy_checkout_enabled: true,
  acquisition_flow_enabled: true,
};

function parseSignupEntryJson(raw: unknown): SignupEntryRuntimeConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG };
  const o = raw as Record<string, unknown>;
  const mode = o.mode === 'acquisition_flow' ? 'acquisition_flow' : 'legacy_checkout';
  const post = typeof o.post_activation_path === 'string' && o.post_activation_path.startsWith('/')
    ? o.post_activation_path
    : DEFAULT_CONFIG.post_activation_path;
  return {
    mode,
    post_activation_path: post,
    legacy_checkout_enabled: o.legacy_checkout_enabled !== false,
    acquisition_flow_enabled: o.acquisition_flow_enabled !== false,
  };
}

export async function getSignupEntryRuntimeConfig(): Promise<SignupEntryRuntimeConfig> {
  try {
    const r = await pool.query<{ value_json: unknown }>(
      `SELECT value_json FROM platform_runtime_config WHERE key = $1`,
      [SIGNUP_ENTRY_KEY],
    );
    return parseSignupEntryJson(r.rows[0]?.value_json);
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: string }).code) : '';
    if (code === '42P01') return { ...DEFAULT_CONFIG };
    throw e;
  }
}

export async function setSignupEntryRuntimeConfig(
  patch: Partial<SignupEntryRuntimeConfig>,
  updatedBy?: string,
): Promise<SignupEntryRuntimeConfig> {
  const current = await getSignupEntryRuntimeConfig();
  const next: SignupEntryRuntimeConfig = {
    mode: patch.mode ?? current.mode,
    post_activation_path: patch.post_activation_path ?? current.post_activation_path,
    legacy_checkout_enabled: patch.legacy_checkout_enabled ?? current.legacy_checkout_enabled,
    acquisition_flow_enabled: patch.acquisition_flow_enabled ?? current.acquisition_flow_enabled,
  };
  await pool.query(
    `INSERT INTO platform_runtime_config (key, value_json, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()`,
    [SIGNUP_ENTRY_KEY, JSON.stringify({ ...next, updated_by: updatedBy ?? null })],
  );
  return next;
}

/** Modo efetivo respeitando flags acquisition e toggles admin. */
export async function resolveEffectiveSignupEntryMode(): Promise<SignupEntryMode> {
  const cfg = await getSignupEntryRuntimeConfig();
  if (cfg.mode !== 'acquisition_flow' || !cfg.acquisition_flow_enabled) {
    return cfg.legacy_checkout_enabled ? 'legacy_checkout' : 'legacy_checkout';
  }
  const signupOn = await isAcquisitionSignupFlowEnabled();
  return signupOn ? 'acquisition_flow' : 'legacy_checkout';
}

export async function getPublicSignupEntryPayload(): Promise<{
  ok: true;
  entry_mode: SignupEntryMode;
  paths: {
    signup: string;
    legacy_checkout: string;
    acquisition_signup: string;
    activation_checkout: string;
    post_activation: string;
  };
  config: SignupEntryRuntimeConfig;
  acquisition_flags: Record<string, boolean>;
}> {
  const cfg = await getSignupEntryRuntimeConfig();
  const entry_mode = await resolveEffectiveSignupEntryMode();
  const acquisition_flags = await getAcquisitionPublicConfig();
  const signup =
    entry_mode === 'acquisition_flow' ? '/cadastro' : cfg.legacy_checkout_enabled ? '/checkout' : '/cadastro';
  return {
    ok: true,
    entry_mode,
    paths: {
      signup,
      legacy_checkout: '/checkout',
      acquisition_signup: '/cadastro',
      activation_checkout: '/ativacao/checkout',
      post_activation: cfg.post_activation_path || '/onboarding',
    },
    config: cfg,
    acquisition_flags,
  };
}
