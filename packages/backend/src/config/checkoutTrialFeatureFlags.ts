/**
 * Feature flags — rollout Fase 2 trial no checkout.
 * Variáveis opcionais; padrão false em produção até configurar explicitamente.
 */
function truthy(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

export function isCheckoutTrialV1Enabled(): boolean {
  return truthy(process.env.CHECKOUT_TRIAL_V1);
}

export function isTrialExpirationJobEnabled(): boolean {
  return truthy(process.env.TRIAL_EXPIRATION_JOB);
}

export function isCheckoutResumeV1Enabled(): boolean {
  return truthy(process.env.CHECKOUT_RESUME_V1);
}

/**
 * Gate único para CRM bloquear trial vencido / retomada e para ramo Fase 2 em cancelamento de faturas.
 * Com tudo desligado, o backend volta ao comportamento pré–Fase 2 nesses pontos (rollout §24 do plano).
 */
export function isPhase2TrialCrmGateEnabled(): boolean {
  return (
    isCheckoutTrialV1Enabled() ||
    isTrialExpirationJobEnabled() ||
    isCheckoutResumeV1Enabled()
  );
}
