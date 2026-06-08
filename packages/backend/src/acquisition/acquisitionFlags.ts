import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';
import { findPlatformFeatureFlagByKey } from '../platform/featureFlagRepository.js';

type FlagCtx = { tenantId?: string | null };

async function resolve(key: string, ctx: FlagCtx = {}) {
  return featureFlagRegistry.resolve(key, { tenantId: ctx.tenantId ?? undefined });
}

export async function isAcquisitionMasterOff(ctx: FlagCtx = {}): Promise<boolean> {
  const r = await resolve('acquisition.master_off', ctx);
  return r.enabled;
}

/**
 * Registry P0: shadow_mode ⇒ enabled=false (execução passiva / legado intacto).
 * Superfície pública acquisition (/cadastro, /teste-gratis, config API) segue
 * default_enabled do painel após kill switch — senão toggle ON + shadow ON nunca libera a UI.
 */
async function isAcquisitionPublicSurfaceEnabled(flagKey: string, ctx: FlagCtx = {}): Promise<boolean> {
  if (await isAcquisitionMasterOff(ctx)) return false;
  const res = await resolve(flagKey, ctx);
  if (res.enabled) return true;
  if (res.reason === 'shadow_mode') {
    const row = await findPlatformFeatureFlagByKey(flagKey);
    return row?.default_enabled === true;
  }
  return false;
}

export async function isAcquisitionPreSignupEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  return isAcquisitionPublicSurfaceEnabled('acquisition.pre_signup_v1', ctx);
}

export async function isAcquisitionSignupFlowEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  return isAcquisitionPublicSurfaceEnabled('acquisition.signup_flow_v1', ctx);
}

export async function isAcquisitionTrialFlowEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  return isAcquisitionPublicSurfaceEnabled('acquisition.trial_flow_v1', ctx);
}

export async function isAcquisitionRecoveryEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  return isAcquisitionPublicSurfaceEnabled('acquisition.recovery_v1', ctx);
}

export async function isAcquisitionActivationTrackingEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  return isAcquisitionPublicSurfaceEnabled('acquisition.activation_tracking_v1', ctx);
}

export async function isAcquisitionActivationScoreEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  return isAcquisitionPublicSurfaceEnabled('acquisition.activation_score_v1', ctx);
}

export async function isAcquisitionOnboardingKickoffEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  return isAcquisitionPublicSurfaceEnabled('acquisition.onboarding_kickoff_v1', ctx);
}

export async function getAcquisitionPublicConfig(): Promise<Record<string, boolean>> {
  await featureFlagRegistry.refresh();
  const [
    preSignup,
    signupFlow,
    trialFlow,
    recovery,
    activationTracking,
    activationScore,
    onboardingKickoff,
  ] = await Promise.all([
    isAcquisitionPreSignupEnabled(),
    isAcquisitionSignupFlowEnabled(),
    isAcquisitionTrialFlowEnabled(),
    isAcquisitionRecoveryEnabled(),
    isAcquisitionActivationTrackingEnabled(),
    isAcquisitionActivationScoreEnabled(),
    isAcquisitionOnboardingKickoffEnabled(),
  ]);
  return {
    pre_signup_v1: preSignup,
    signup_flow_v1: signupFlow,
    trial_flow_v1: trialFlow,
    recovery_v1: recovery,
    activation_tracking_v1: activationTracking,
    activation_score_v1: activationScore,
    onboarding_kickoff_v1: onboardingKickoff,
  };
}
