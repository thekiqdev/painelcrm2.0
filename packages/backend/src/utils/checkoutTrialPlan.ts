/**
 * Trial no checkout (Fase 2) — separado de "plano gratuito permanente".
 *
 * - Fonte de verdade: `plans.trial_days` (> 0 = período de avaliação antes da cobrança obrigatória).
 * - Compatibilidade: planos com vitrine legada `is_free` + `free_access_days` e `trial_days` ainda 0
 *   usam `free_access_days` como duração até migração alinhar colunas (ver 91_plans_trial_days_legacy_align.sql).
 * - Plano estritamente gratuito sem trial de conversão: `is_free` e effective days === 0 → não entra em cobrança SaaS.
 */
export function effectiveCheckoutTrialDays(row: {
  trial_days?: number | null;
  is_free?: boolean | null;
  free_access_days?: number | null;
}): number {
  const td = Math.max(0, Math.floor(Number(row.trial_days ?? 0)));
  if (td >= 1) return td;
  if (row.is_free === true && row.free_access_days != null) {
    const fd = Math.floor(Number(row.free_access_days));
    if (fd >= 1) return fd;
  }
  return 0;
}
