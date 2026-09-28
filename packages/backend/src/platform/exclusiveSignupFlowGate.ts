/**
 * E3.2 — Fonte única para liberar/bloquear o fluxo /cadastro (exclusive_signup).
 * Deriva de platform_growth_settings.active_signup_flow via getSignupStrategy().
 */
import type { Response } from 'express';
import { getSignupStrategy } from './signupStrategyService.js';

export const EXCLUSIVE_SIGNUP_INACTIVE_CODE = 'exclusive_signup_inactive' as const;

export type ExclusiveSignupInactivePayload = {
  ok: false;
  code: typeof EXCLUSIVE_SIGNUP_INACTIVE_CODE;
  error: string;
  fallback_path: '/checkout';
};

export function buildExclusiveSignupInactivePayload(): ExclusiveSignupInactivePayload {
  return {
    ok: false,
    code: EXCLUSIVE_SIGNUP_INACTIVE_CODE,
    error: 'O cadastro exclusivo não está ativo. Utilize o checkout.',
    fallback_path: '/checkout',
  };
}

/** true quando active_signup_flow === exclusive_signup */
export async function isExclusiveSignupFlowActive(): Promise<boolean> {
  const { flow } = await getSignupStrategy();
  return flow === 'exclusive_signup';
}

/**
 * Interrompe a request com 409 se o fluxo exclusivo não estiver ativo.
 * @returns true se a request pode continuar
 */
export async function requireExclusiveSignupFlow(res: Response): Promise<boolean> {
  if (await isExclusiveSignupFlowActive()) return true;
  res.status(409).json(buildExclusiveSignupInactivePayload());
  return false;
}
