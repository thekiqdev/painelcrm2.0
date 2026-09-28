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

export {
  certifyScenario,
  runShadowCertification,
  classifyDivergenceSummary,
} from './shadowCertification';
export type {
  DivergenceClass,
  SurfaceName,
  SurfaceDivergence,
  SurfaceParity,
  ScenarioCertification,
  ShadowCertificationReport,
} from './shadowCertification';
