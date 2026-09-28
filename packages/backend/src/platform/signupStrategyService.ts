import { pool } from '../utils/db.js';
import {
  resolvePlatformWhatsAppChatInstanceId,
  resolvePlatformWhatsAppOutboundReady,
} from '../services/platformNotifications/platformNotificationDispatchContext.js';
import { setSignupEntryRuntimeConfig } from './platformRuntimeConfig.js';

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

export type SignupStrategyHealth = {
  flow: ActiveSignupFlow;
  checks: {
    phone_verification: boolean;
    whatsapp_platform_connected: boolean;
    whatsapp_instance_ready: boolean;
    public_routes_ready: boolean;
  };
  healthy: boolean;
  issues?: string[];
};

const GROWTH_SETTINGS_ID = '00000000-0000-4000-8000-000000000001';

const ENTRY_URL: Record<ActiveSignupFlow, string> = {
  checkout: '/checkout',
  exclusive_signup: '/cadastro',
};

function featuresForFlow(flow: ActiveSignupFlow): SignupStrategyFeatures {
  if (flow === 'exclusive_signup') {
    return {
      phone_verification: true,
      closed_trial_mode: true,
      whatsapp_code_required: true,
      allow_checkout: true,
      show_exclusive_badges: true,
    };
  }
  return {
    phone_verification: false,
    closed_trial_mode: false,
    whatsapp_code_required: false,
    allow_checkout: true,
    show_exclusive_badges: false,
  };
}

function parseActiveSignupFlow(raw: unknown): ActiveSignupFlow {
  return raw === 'exclusive_signup' ? 'exclusive_signup' : 'checkout';
}

export async function getActiveSignupFlow(): Promise<ActiveSignupFlow> {
  try {
    const r = await pool.query<{ active_signup_flow: string }>(
      `SELECT active_signup_flow FROM platform_growth_settings WHERE id = $1::uuid LIMIT 1`,
      [GROWTH_SETTINGS_ID],
    );
    return parseActiveSignupFlow(r.rows[0]?.active_signup_flow);
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: string }).code) : '';
    if (code === '42P01') return 'checkout';
    throw e;
  }
}

/** Fonte única da estratégia de aquisição — não depende de ENV. */
export async function getSignupStrategy(): Promise<SignupStrategy> {
  const flow = await getActiveSignupFlow();
  const features = featuresForFlow(flow);
  return {
    flow,
    entry_url: ENTRY_URL[flow],
    closed_trial: flow === 'exclusive_signup',
    features,
  };
}

async function phoneVerificationServiceReady(): Promise<boolean> {
  try {
    const r = await pool.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'signup_phone_verifications'
       ) AS ok`,
    );
    return Boolean(r.rows[0]?.ok);
  } catch {
    return false;
  }
}

export async function getSignupStrategyHealth(): Promise<SignupStrategyHealth> {
  const strategy = await getSignupStrategy();
  const configuredInstanceId = resolvePlatformWhatsAppChatInstanceId();
  const outbound = await resolvePlatformWhatsAppOutboundReady(pool);
  const phoneVerificationReady = await phoneVerificationServiceReady();

  const checks = {
    phone_verification: strategy.features.phone_verification && phoneVerificationReady,
    whatsapp_platform_connected: Boolean(configuredInstanceId),
    whatsapp_instance_ready: Boolean(outbound?.instanceToken),
    public_routes_ready: true,
  };

  const issues: string[] = [];
  if (strategy.flow === 'exclusive_signup') {
    if (!configuredInstanceId) issues.push('platform_whatsapp_not_connected');
    if (!outbound?.instanceToken) issues.push('platform_whatsapp_instance_not_ready');
    if (!phoneVerificationReady) issues.push('phone_verification_unavailable');
  }

  const healthy =
    strategy.flow === 'checkout' ||
    (checks.phone_verification &&
      checks.whatsapp_platform_connected &&
      checks.whatsapp_instance_ready &&
      checks.public_routes_ready);

  return {
    flow: strategy.flow,
    checks,
    healthy,
    ...(issues.length > 0 ? { issues } : {}),
  };
}

export async function setActiveSignupFlow(
  flow: ActiveSignupFlow,
  updatedBy?: string,
): Promise<SignupStrategy> {
  await pool.query(
    `INSERT INTO platform_growth_settings (id, active_signup_flow)
     VALUES ($1::uuid, $2)
     ON CONFLICT (id) DO UPDATE
       SET active_signup_flow = EXCLUDED.active_signup_flow,
           updated_at = now()`,
    [GROWTH_SETTINGS_ID, flow],
  );

  await setSignupEntryRuntimeConfig(
    {
      mode: flow === 'exclusive_signup' ? 'acquisition_flow' : 'legacy_checkout',
      acquisition_flow_enabled: flow === 'exclusive_signup',
      legacy_checkout_enabled: true,
    },
    updatedBy,
  );

  return getSignupStrategy();
}
