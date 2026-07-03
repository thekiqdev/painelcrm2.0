import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import type { CertificationContext } from '../certification/captureVisualFixture';

/** Identificador estável do cenário — usado em snapshots e regressões. */
export type GoldenScenarioId = string;

export type GoldenScenarioTags =
  | 'subscription:active'
  | 'subscription:paused'
  | 'subscription:cancelled'
  | 'subscription:trial'
  | 'cycle:pending'
  | 'cycle:failed'
  | 'cycle:skipped'
  | 'cycle:cancelled'
  | 'invoice:paid'
  | 'invoice:due'
  | 'invoice:gateway_failed'
  | 'invoice:invoice_only'
  | 'projection'
  | 'lifecycle'
  | 'legacy'
  | 'generate'
  | 'gap'
  | 'job';

export type GoldenScenario = {
  id: GoldenScenarioId;
  title: string;
  todayYmd: string;
  /** Auditorias que originaram ou validam o cenário (4.2K–4.2Q). */
  auditRefs: string[];
  tags: GoldenScenarioTags[];
  build: () => CrmSubscriptionDetailPayload;
  /** Asserções adicionais além do snapshot visual. */
  assert?: (ctx: CertificationContext) => void;
};

export const GOLDEN_TODAY_DEFAULT = '2026-06-30';
