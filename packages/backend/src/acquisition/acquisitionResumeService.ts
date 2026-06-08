import { pool } from '../utils/db.js';
import type { AcquisitionLeadRow, AcquisitionLeadStage } from './acquisitionTypes.js';
import { onboardingSessionsTableExists } from './acquisitionOnboardingSessionService.js';

export type AcquisitionResumeResolution = {
  /** Caminho de navegação (sempre definido quando há retomada possível). */
  path: string;
  step: number;
  /** Exibir copy "Continuando de onde você parou." */
  canContinueWhereLeftOff: boolean;
  message: string;
};

function cadastroPath(leadId: string, step?: 'plan' | 'conversion'): string {
  if (step === 'plan') return `/cadastro?lead=${leadId}&step=plan`;
  if (step === 'conversion') return `/cadastro?lead=${leadId}&step=conversion`;
  return `/cadastro?lead=${leadId}`;
}

export async function findAccessibleSessionForLead(leadId: string): Promise<{
  session_token: string;
  status: string;
  tenant_id: string | null;
} | null> {
  if (!(await onboardingSessionsTableExists())) return null;
  const r = await pool.query<{
    session_token: string;
    status: string;
    tenant_id: string | null;
  }>(
    `SELECT session_token, status, tenant_id::text
     FROM acquisition_onboarding_sessions
     WHERE acquisition_lead_id = $1::uuid
       AND status IN ('active', 'completed')
       AND expires_at > now()
     ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC
     LIMIT 1`,
    [leadId],
  );
  return r.rows[0] ?? null;
}

export async function isSessionTokenAccessible(token: string): Promise<boolean> {
  if (!(await onboardingSessionsTableExists())) return false;
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM acquisition_onboarding_sessions
     WHERE session_token = $1
       AND status IN ('active', 'completed')
       AND expires_at > now()`,
    [token],
  );
  return (r.rows[0]?.c ?? '0') !== '0';
}

const TERMINAL_STAGES: AcquisitionLeadStage[] = ['converted'];

/**
 * Resolve retomada verificada (lead + sessão). Mensagem "onde parou" só se caminho validado.
 */
export async function resolveAcquisitionResume(
  lead: AcquisitionLeadRow,
): Promise<AcquisitionResumeResolution> {
  const stage = lead.current_stage;

  if (TERMINAL_STAGES.includes(stage)) {
    return {
      path: '/login',
      step: 0,
      canContinueWhereLeftOff: false,
      message: 'Sua conta já foi ativada. Faça login para continuar.',
    };
  }

  if (stage === 'plan_selected' || stage === 'activation_prepared' || stage === 'checkout_started') {
    if (!lead.selected_plan_id) {
      return {
        path: cadastroPath(lead.id, 'plan'),
        step: 1,
        canContinueWhereLeftOff: false,
        message: 'Retomando seu cadastro.',
      };
    }
    const planQ = `&plan=${encodeURIComponent(lead.selected_plan_id)}`;
    return {
      path: `${cadastroPath(lead.id, 'conversion')}${planQ}`,
      step: 2,
      canContinueWhereLeftOff: true,
      message: 'Continuando de onde você parou.',
    };
  }

  if (stage === 'contact_captured') {
    return {
      path: cadastroPath(lead.id, 'plan'),
      step: 1,
      canContinueWhereLeftOff: true,
      message: 'Continuando de onde você parou.',
    };
  }

  if (stage === 'onboarding_in_progress' || stage === 'onboarding_kickoff') {
    const session = await findAccessibleSessionForLead(lead.id);
    if (session) {
      if (session.status === 'completed' && session.tenant_id) {
        return {
          path: '/login',
          step: 0,
          canContinueWhereLeftOff: false,
          message: 'Seu onboarding já foi concluído. Faça login para acessar o painel.',
        };
      }
      return {
        path: `/onboarding/acquisition?session=${encodeURIComponent(session.session_token)}`,
        step: 0,
        canContinueWhereLeftOff: true,
        message: 'Continuando de onde você parou.',
      };
    }

    const metaToken =
      typeof lead.metadata_json.onboarding_session_token === 'string'
        ? lead.metadata_json.onboarding_session_token.trim()
        : '';
    if (metaToken && (await isSessionTokenAccessible(metaToken))) {
      return {
        path: `/onboarding/acquisition?session=${encodeURIComponent(metaToken)}`,
        step: 0,
        canContinueWhereLeftOff: true,
        message: 'Continuando de onde você parou.',
      };
    }

    if (lead.selected_plan_id) {
      return {
        path: cadastroPath(lead.id, 'conversion'),
        step: 2,
        canContinueWhereLeftOff: false,
        message: 'Retomando seu cadastro a partir da ativação.',
      };
    }

    return {
      path: cadastroPath(lead.id, 'plan'),
      step: 1,
      canContinueWhereLeftOff: false,
      message: 'Retomando seu cadastro.',
    };
  }

  return {
    path: cadastroPath(lead.id),
    step: 0,
    canContinueWhereLeftOff: false,
    message: 'Retomando seu cadastro.',
  };
}
