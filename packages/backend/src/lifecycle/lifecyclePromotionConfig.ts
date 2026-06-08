/**
 * Sprint I — feature flag de promoção lifecycle (default desligado em produção).
 */
export function isOpsLifecyclePromotionEnabled(): boolean {
  const raw = (process.env.OPS_LIFECYCLE_PROMOTION_ENABLED ?? 'false').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}
