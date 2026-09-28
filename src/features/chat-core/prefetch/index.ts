/**
 * F6.6 — Warm Window & Predictive Prefetch (barrel).
 */

export {
  computeHeatScore,
  rankByHeatScore,
  activityRecencyScore,
  openRecencyScore,
  DEFAULT_HEAT_WEIGHTS,
} from './heatScore';
export type { HeatConversationInput, HeatScoreWeights } from './heatScore';

export {
  createWarmWindowEngine,
  getWarmWindowEngine,
  resetWarmWindowEngineForTests,
  isConversationAlreadyWarm,
  DEFAULT_WARM_CONVERSATION_COUNT,
} from './warmWindow';
export type { WarmWindowEngine, WarmWindowEntry } from './warmWindow';

export {
  buildPrefetchQueue,
  createPredictivePrefetchController,
} from './predictivePrefetch';
export type {
  PrefetchConversationMeta,
  BuildPrefetchQueueParams,
  PrefetchLoader,
  PredictivePrefetchController,
  PredictivePrefetchOptions,
} from './predictivePrefetch';

export { useConversationWarmup } from './useConversationWarmup';
export type {
  UseConversationWarmupParams,
  UseConversationWarmupResult,
} from './useConversationWarmup';
