import { pool } from '../utils/db.js';
import { normalizeEmailForUniqueness } from '../utils/userIdentity.js';
import { normalizeWhatsappDigits } from '../services/userIdentityValidationService.js';
import {
  findAcquisitionLeadByEmail,
  findAcquisitionLeadById,
  findAcquisitionLeadByPhone,
  finalizeAcquisitionLeadEmail,
  mergeAcquisitionLeadMetadata,
  upsertAcquisitionLeadContact,
} from './acquisitionLeadRepository.js';
import { isPendingSignupEmail } from './acquisitionPendingEmail.js';
import {
  publishAcquisitionSignupStarted,
  syncAcquisitionLeadOpsKanbanProfile,
} from './acquisitionOutbox.js';
import type { AcquisitionLeadRow } from './acquisitionTypes.js';
import { resolveAcquisitionResume } from './acquisitionResumeService.js';
import { reconcileAcquisitionLeadForResume } from './acquisitionLeadReconciliationService.js';
import { logResumeDetected } from './acquisitionResumeLogger.js';

export type ContactResolveAction =
  | 'new_lead'
  | 'continue_lead'
  | 'login_required'
  | 'reactivation_eligible'
  | 'trial_blocked';

export type ContactResolveResult = {
  action: ContactResolveAction;
  lead: AcquisitionLeadRow;
  message?: string;
  resume_step?: number;
  resume_path?: string;
  /** true apenas quando a copy "Continuando de onde você parou." é adequada */
  resume_verified?: boolean;
  extra_trial_eligible?: boolean;
  operational_tags?: string[];
};

const EXTRA_TRIAL_MAX_REACTIVATIONS = 1;

function trialReactivationCount(lead: AcquisitionLeadRow): number {
  const n = lead.metadata_json.trial_reactivation_count;
  return typeof n === 'number' ? n : parseInt(String(n ?? '0'), 10) || 0;
}

function extraTrialConsumed(lead: AcquisitionLeadRow): boolean {
  return Boolean(lead.metadata_json.extra_trial_consumed_at);
}

async function findTenantForContact(
  email: string,
  whatsappDigits: string | null,
): Promise<{
  tenant_id: string;
  status: string;
  trial_ends_at: string | null;
} | null> {
  const em = normalizeEmailForUniqueness(email);
  const r = await pool.query<{
    tenant_id: string;
    status: string;
    trial_ends_at: string | null;
  }>(
    `SELECT t.id::text AS tenant_id, t.status, t.trial_ends_at::text
     FROM users u
     INNER JOIN tenants t ON t.id = u.tenant_id
     WHERE lower(btrim(u.email)) = $1
        OR ($2::text IS NOT NULL AND length($2) >= 10
            AND regexp_replace(COALESCE(u.whatsapp_number, ''), '\\D', '', 'g') = $2)
     ORDER BY u.created_at DESC
     LIMIT 1`,
    [em, whatsappDigits],
  );
  return r.rows[0] ?? null;
}

async function afterContactProfileResolved(
  lead: AcquisitionLeadRow,
  correlationId: string,
  action: ContactResolveAction,
): Promise<void> {
  if (action === 'login_required' || action === 'trial_blocked') return;
  void publishAcquisitionSignupStarted(lead, 'contact');
  void syncAcquisitionLeadOpsKanbanProfile(lead, {
    signupStep: 'contact',
    timelineType: `contact_resolve_${action}`,
  });
  void correlationId;
}

function isTenantOperationallyActive(row: { status: string; trial_ends_at: string | null }): boolean {
  if (row.status === 'active') return true;
  if (row.status === 'trial') {
    if (!row.trial_ends_at) return true;
    return new Date(row.trial_ends_at).getTime() >= Date.now();
  }
  return false;
}

export async function resolveAcquisitionContact(input: {
  name?: string;
  email: string;
  phone?: string;
  leadId?: string;
  correlationId: string;
  source?: string;
}): Promise<ContactResolveResult> {
  const email = input.email.trim();
  const whatsappDigits = normalizeWhatsappDigits(input.phone ?? null);

  let contextLead: AcquisitionLeadRow | null = null;
  if (input.leadId) {
    contextLead = await findAcquisitionLeadById(input.leadId);
  }
  if (!contextLead && whatsappDigits) {
    contextLead = await findAcquisitionLeadByPhone(whatsappDigits);
  }

  if (contextLead && isPendingSignupEmail(contextLead.email)) {
    const emailOwner = await findAcquisitionLeadByEmail(email);
    if (!emailOwner || emailOwner.id === contextLead.id) {
      contextLead =
        (await finalizeAcquisitionLeadEmail(contextLead.id, email, input.correlationId)) ?? contextLead;
    }
  }

  const tenantRow = await findTenantForContact(email, whatsappDigits);

  if (tenantRow && isTenantOperationallyActive(tenantRow)) {
    const lead =
      (await findAcquisitionLeadByEmail(email)) ??
      (await upsertAcquisitionLeadContact({
        name: input.name,
        email,
        phone: input.phone,
        correlationId: input.correlationId,
        source: input.source ?? 'web',
        metadata: { blocked_reason: 'active_tenant', tenant_id: tenantRow.tenant_id },
      }));

    if (!lead) throw new Error('lead_upsert_failed');

    await mergeAcquisitionLeadMetadata(lead.id, {
      operational_tags: ['cliente_ativo'],
      last_seen_at: new Date().toISOString(),
    });

    return {
      action: 'login_required',
      lead,
      message: 'Encontramos uma operação ativa vinculada a este e-mail. Faça login para continuar.',
    };
  }

  const existingLead =
    (await findAcquisitionLeadByEmail(email)) ??
    (contextLead && !isPendingSignupEmail(contextLead.email) ? contextLead : null);

  if (existingLead) {
    const reactivations = trialReactivationCount(existingLead);
    const extraUsed = extraTrialConsumed(existingLead);
    const tags = Array.isArray(existingLead.metadata_json.operational_tags)
      ? [...(existingLead.metadata_json.operational_tags as string[])]
      : [];

    if (reactivations > EXTRA_TRIAL_MAX_REACTIVATIONS || (extraUsed && tags.includes('trial_2x'))) {
      return {
        action: 'trial_blocked',
        lead: existingLead,
        message: 'Período de avaliação adicional já utilizado para este contato.',
        operational_tags: [...tags, 'trial_2x'],
      };
    }

    const inactiveTenant = tenantRow != null && !isTenantOperationallyActive(tenantRow);
    const extraEligible = inactiveTenant && reactivations < EXTRA_TRIAL_MAX_REACTIVATIONS && !extraUsed;

    const lead = await upsertAcquisitionLeadContact({
      name: input.name,
      email,
      phone: input.phone,
      correlationId: input.correlationId,
      source: input.source ?? existingLead.source ?? 'web',
      metadata: {
        operational_tags: extraEligible
          ? [...tags.filter((t) => t !== 'extra_trial_elegivel'), 'reativacao', 'extra_trial_elegivel', 'retomado']
          : [...tags, 'retomado'],
      },
    });

    if (!lead) throw new Error('lead_upsert_failed');

    const reconciled = await reconcileAcquisitionLeadForResume(lead);
    const leadForResume = reconciled.lead;
    const resume = await resolveAcquisitionResume(leadForResume);
    const action: ContactResolveAction = extraEligible ? 'reactivation_eligible' : 'continue_lead';

    await afterContactProfileResolved(leadForResume, input.correlationId, action);

    logResumeDetected({
      lead_id: leadForResume.id,
      current_stage: leadForResume.current_stage,
      resume_path: resume.path,
      resume_verified: resume.canContinueWhereLeftOff,
    });

    return {
      action,
      lead: leadForResume,
      message: extraEligible
        ? 'Conta anterior inativa. Você pode solicitar 7 dias adicionais de avaliação após escolher o plano.'
        : resume.message,
      resume_step: resume.step,
      resume_path: resume.path,
      resume_verified: resume.canContinueWhereLeftOff,
      extra_trial_eligible: extraEligible,
      operational_tags: (lead.metadata_json.operational_tags as string[]) ?? [],
    };
  }

  if (contextLead && !isPendingSignupEmail(contextLead.email)) {
    const lead = await upsertAcquisitionLeadContact({
      name: input.name,
      email,
      phone: input.phone,
      correlationId: input.correlationId,
      source: input.source ?? contextLead.source ?? 'web',
      metadata: { operational_tags: ['novo'], email_confirmed_at: new Date().toISOString() },
    });
    if (!lead) throw new Error('lead_upsert_failed');
    await afterContactProfileResolved(lead, input.correlationId, 'new_lead');
    return { action: 'new_lead', lead, message: 'Lead registrado.' };
  }

  const lead = await upsertAcquisitionLeadContact({
    name: input.name,
    email,
    phone: input.phone,
    correlationId: input.correlationId,
    source: input.source ?? 'web',
    stage: 'contact_captured',
    metadata: { operational_tags: ['novo'] },
  });

  if (!lead) throw new Error('lead_insert_failed');

  await afterContactProfileResolved(lead, input.correlationId, 'new_lead');
  return { action: 'new_lead', lead, message: 'Lead registrado.' };
}

export async function assertExtraTrialGrantAllowed(
  lead: AcquisitionLeadRow,
): Promise<{ ok: boolean; reason?: string }> {
  if (extraTrialConsumed(lead)) {
    return { ok: false, reason: 'extra_trial_already_consumed' };
  }
  if (trialReactivationCount(lead) > EXTRA_TRIAL_MAX_REACTIVATIONS) {
    return { ok: false, reason: 'trial_reactivation_limit' };
  }
  return { ok: true };
}

export async function markExtraTrialGranted(leadId: string): Promise<void> {
  const lead = await findAcquisitionLeadById(leadId);
  if (!lead) return;
  const tags = Array.isArray(lead.metadata_json.operational_tags)
    ? (lead.metadata_json.operational_tags as string[])
    : [];
  await mergeAcquisitionLeadMetadata(leadId, {
    extra_trial_consumed_at: new Date().toISOString(),
    trial_reactivation_count: trialReactivationCount(lead) + 1,
    operational_tags: [...new Set([...tags, 'trial_2x', 'extra_trial_granted', 'reactivated_trial'])],
  });
}
