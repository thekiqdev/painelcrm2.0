import { pool } from '../utils/db.js';
import type { AcquisitionLeadRow, AcquisitionLeadStage } from './acquisitionTypes.js';
import { findAcquisitionLeadById, updateAcquisitionLeadStage } from './acquisitionLeadRepository.js';
import {
  findAccessibleSessionForLead,
  isSessionTokenAccessible,
} from './acquisitionResumeService.js';
import { logResumeReconciled } from './acquisitionResumeLogger.js';

export type LeadReconciliationOutcome = {
  lead: AcquisitionLeadRow;
  reconciled: boolean;
  previous_stage?: AcquisitionLeadStage;
  corrected_stage?: AcquisitionLeadStage;
  reason?: string;
};

const STAGES_NEEDING_PLAN: AcquisitionLeadStage[] = [
  'plan_selected',
  'activation_prepared',
  'checkout_started',
];

const ONBOARDING_STAGES: AcquisitionLeadStage[] = ['onboarding_in_progress', 'onboarding_kickoff'];

async function hasAccessibleOnboardingSession(lead: AcquisitionLeadRow): Promise<boolean> {
  const session = await findAccessibleSessionForLead(lead.id);
  if (session) return true;
  const metaToken =
    typeof lead.metadata_json.onboarding_session_token === 'string'
      ? lead.metadata_json.onboarding_session_token.trim()
      : '';
  if (!metaToken) return false;
  return isSessionTokenAccessible(metaToken);
}

/**
 * Corrige estágio inconsistente antes de resolver retomada (idempotente).
 */
export async function reconcileAcquisitionLeadForResume(
  lead: AcquisitionLeadRow,
): Promise<LeadReconciliationOutcome> {
  const stage = lead.current_stage;

  if (STAGES_NEEDING_PLAN.includes(stage) && !lead.selected_plan_id) {
    const corrected: AcquisitionLeadStage = 'qualified';
    if (stage === corrected) {
      return { lead, reconciled: false };
    }
    const updated =
      (await updateAcquisitionLeadStage(lead.id, corrected, {
        metadata: { resume_reconciled_at: new Date().toISOString(), resume_reconcile_reason: 'plan_selected_without_plan_id' },
      })) ?? lead;
    logResumeReconciled({
      lead_id: lead.id,
      previous_stage: stage,
      corrected_stage: corrected,
      reason: 'plan_selected_without_plan_id',
    });
    return {
      lead: updated,
      reconciled: true,
      previous_stage: stage,
      corrected_stage: corrected,
      reason: 'plan_selected_without_plan_id',
    };
  }

  if (ONBOARDING_STAGES.includes(stage)) {
    const hasSession = await hasAccessibleOnboardingSession(lead);
    if (!hasSession) {
      const corrected: AcquisitionLeadStage = lead.selected_plan_id
        ? 'activation_prepared'
        : 'qualified';
      if (stage === corrected) {
        return { lead, reconciled: false };
      }
      const updated =
        (await updateAcquisitionLeadStage(lead.id, corrected, {
          metadata: {
            resume_reconciled_at: new Date().toISOString(),
            resume_reconcile_reason: 'onboarding_without_session',
          },
        })) ?? lead;
      logResumeReconciled({
        lead_id: lead.id,
        previous_stage: stage,
        corrected_stage: corrected,
        reason: 'onboarding_without_session',
      });
      return {
        lead: updated,
        reconciled: true,
        previous_stage: stage,
        corrected_stage: corrected,
        reason: 'onboarding_without_session',
      };
    }
  }

  return { lead, reconciled: false };
}

export type HistoricalReconcileSummary = {
  scanned: number;
  corrected: number;
  reasons: Record<string, number>;
};

/**
 * Rotina idempotente para leads históricos com estágio/plano/sessão inconsistentes.
 */
export async function reconcileHistoricalAcquisitionLeads(options?: {
  limit?: number;
}): Promise<HistoricalReconcileSummary> {
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 5000);
  const r = await pool.query<{ id: string }>(
    `SELECT id::text FROM acquisition_leads
     WHERE (
       current_stage IN ('plan_selected', 'activation_prepared', 'checkout_started')
       AND selected_plan_id IS NULL
     )
     OR current_stage IN ('onboarding_in_progress', 'onboarding_kickoff')
     ORDER BY updated_at ASC
     LIMIT $1`,
    [limit],
  );

  const summary: HistoricalReconcileSummary = { scanned: r.rows.length, corrected: 0, reasons: {} };

  for (const row of r.rows) {
    const lead = await findAcquisitionLeadById(row.id);
    if (!lead) continue;
    const outcome = await reconcileAcquisitionLeadForResume(lead);
    if (outcome.reconciled && outcome.reason) {
      summary.corrected += 1;
      summary.reasons[outcome.reason] = (summary.reasons[outcome.reason] ?? 0) + 1;
    }
  }

  return summary;
}
