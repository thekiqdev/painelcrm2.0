export { isBillingShadowModeEnabled, setBillingShadowModeForTests } from './featureFlag';

export {
  buildLegacyShadowSnapshot,
  buildAggregateShadowSnapshot,
} from './shadowSnapshot';
export type {
  LegacyShadowSnapshot,
  AggregateShadowSnapshot,
  ShadowSnapshotPair,
} from './shadowSnapshot';

export {
  runBillingShadowSideEffect,
  getLastShadowExecutionReport,
  clearLastShadowExecutionReport,
} from './shadowRuntime';
export type {
  ShadowExecutionReport,
  ShadowPerformanceMetrics,
} from './shadowRuntime';
