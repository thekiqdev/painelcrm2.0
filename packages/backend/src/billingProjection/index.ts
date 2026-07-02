/**
 * Billing Engine V2 — Sprint 2.3D: Billing Projection Engine (READ ONLY).
 */
export * from './types.js';
export { BillingProjectionEngine, getProjectionEngineVersion } from './billingProjectionEngine.js';
export { buildProjectedInvoice } from './billingProjectionBuilder.js';
export { normalizeProjectedInvoice, normalizeProjectionResult } from './projectionNormalizer.js';
export { computeProjectionHash } from './projectionHash.js';
export {
  projectBillingForSubscription,
  compareProjectionWithLegacy,
  getBillingProjectionHealthStats,
  getBillingProjectionDashboard,
} from './projectionService.js';
export { serializeProjectedInvoice } from './serializeProjection.js';
export { resetProjectionMetricsForTests, getProjectionHealthStats } from './projectionMetrics.js';
export { clearProjectionCacheForTests } from './projectionCache.js';
