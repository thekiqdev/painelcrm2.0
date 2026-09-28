/**

 * Sprint 5.0-23B/23C — OCRE frontend adapter (UI / Aggregate / Store).

 */

import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';

import {

  buildResolvedCompetencyPresentation,

  resolveCyclePresentation,

  type ResolvedCompetencyPresentation,

} from './resolvedCompetencyPresentation';



export type {

  OperationalCompetencyMode,

  OperationalCompetencyResolution,

  ResolvedOperationalCompetency,

  ResolveOperationalCompetencyParams,

} from './operationalCompetencyResolverCore';



export {

  resolveOperationalCompetencyFromContext,

  canGenerateForCycleFromResolution,

  findFirstCompetencyGapDate,

  GENERATABLE_CYCLE_STATUSES,

} from './operationalCompetencyResolverCore';



export type { ResolvedCompetencyPresentation };



export function resolveOperationalCompetency(

  detail: CrmSubscriptionDetailPayload,

  params: Omit<import('./operationalCompetencyResolverCore').ResolveOperationalCompetencyParams, 'subscriptionId'>

): ResolvedCompetencyPresentation {

  return buildResolvedCompetencyPresentation(detail, params);

}



/** @deprecated Sprint 5.0-23B — use resolveOperationalCompetency({ mode: 'NEXT_GENERATE' }) */

export function resolveFirstEligibleCycle(detail: CrmSubscriptionDetailPayload) {

  const resolved = resolveOperationalCompetency(detail, { mode: 'NEXT_GENERATE' });

  if (!resolved.cycleId) return null;

  return detail.cycles_raw?.find((c) => c.id === resolved.cycleId) ?? null;

}



/** @deprecated Sprint 5.0-23B — use resolveCyclePresentation / canGenerate */

export function cycleSupportsManualGenerate(

  detail: CrmSubscriptionDetailPayload,

  cycleId: string | null | undefined

): boolean {

  return resolveCyclePresentation(detail, cycleId, 'HISTORY').canGenerate;

}



export function toResolvedCompetencyPresentation(

  detail: CrmSubscriptionDetailPayload,

  params: Omit<import('./operationalCompetencyResolverCore').ResolveOperationalCompetencyParams, 'subscriptionId'>

): ResolvedCompetencyPresentation {

  return resolveOperationalCompetency(detail, params);

}



export { resolveCyclePresentation, buildResolvedCompetencyPresentation };


