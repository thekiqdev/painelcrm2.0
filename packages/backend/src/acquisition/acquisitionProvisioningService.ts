/**
 * Provisionamento tardio: tenant + admin ao concluir onboarding operacional da aquisição.
 */
import { pool } from '../utils/db.js';
import { generateToken } from '../utils/jwt.js';
import { effectiveCheckoutTrialDays } from '../utils/checkoutTrialPlan.js';
import { normalizeEmailForUniqueness } from '../utils/userIdentity.js';
import {
  assertAdminEmailAvailableForCheckout,
  assertAdminWhatsappAvailableForCheckout,
  normalizeWhatsappDigits,
} from '../services/userIdentityValidationService.js';
import {
  assertNewTrialSignupAllowed,
  TrialAlreadyConsumedError,
} from '../services/trialSignupGuardService.js';
import { createTenantAdminUser } from '../services/tenantAdminService.js';
import { slugifyOperationalName } from './tenantOperationalSlug.js';
import { updateAcquisitionLeadStage, mergeAcquisitionLeadMetadata } from './acquisitionLeadRepository.js';
import {
  attachTenantToSession,
  loadSessionWithLead,
  updateOnboardingWizardSession,
} from './acquisitionOnboardingSessionService.js';
import { trackActivationEvent } from './activationTrackingService.js';
import { publishAcquisitionStageChanged } from './acquisitionOutbox.js';
import { kickoffOnboarding } from './onboardingKickoffService.js';
import { logAcquisition } from './acquisitionLogger.js';
import { syncAcquisitionLeadToOpsKanban } from '../services/superadminOpsKanbanLeadService.js';
import { applySessionAvatarToUserProfile } from './acquisitionSessionAvatarService.js';
import { ensureTenantOperationalBootstrap } from '../services/tenantOperationalBootstrapService.js';
import { observeTrialActivationShadow } from '../lifecycle/lifecycleDebugService.js';
import { promoteLifecycleCard } from '../lifecycle/lifecyclePromotionService.js';

const EXTRA_TRIAL_DAYS = 7;

export type ProvisionWorkspaceInput = {
  sessionToken: string;
  companyName: string;
  password: string;
  responsibleName?: string;
  cpfCnpj?: string;
  correlationId?: string;
};

export type ProvisionWorkspaceResult =
  | {
      ok: true;
      token: string;
      tenantId: string;
      userId: string;
      email: string;
      redirectPath: string;
    }
  | { ok: false; reason: string; code?: string };

export async function provisionWorkspaceFromSession(
  input: ProvisionWorkspaceInput,
): Promise<ProvisionWorkspaceResult> {
  const loaded = await loadSessionWithLead(input.sessionToken);
  if (!loaded) {
    return { ok: false, reason: 'Sessão inválida ou expirada.', code: 'SESSION_NOT_FOUND' };
  }

  const { session, lead } = loaded;
  if (session.tenant_id || lead.tenant_id) {
    return { ok: false, reason: 'Workspace já provisionado.', code: 'ALREADY_PROVISIONED' };
  }

  const planId = session.plan_id ?? lead.selected_plan_id;
  if (!planId) {
    return { ok: false, reason: 'Plano não definido na sessão.', code: 'PLAN_REQUIRED' };
  }

  const email = lead.email.trim();
  const whatsappDigits = normalizeWhatsappDigits(lead.phone ?? '');
  if (!whatsappDigits || whatsappDigits.length < 10) {
    return { ok: false, reason: 'WhatsApp inválido.', code: 'INVALID_PHONE' };
  }

  const companyName = input.companyName.trim();
  if (companyName.length < 2) {
    return { ok: false, reason: 'Informe o nome da empresa.', code: 'COMPANY_REQUIRED' };
  }

  const responsibleName = (input.responsibleName ?? lead.name ?? '').trim() || email.split('@')[0] || 'Admin';

  try {
    await assertAdminEmailAvailableForCheckout(normalizeEmailForUniqueness(email));
    await assertAdminWhatsappAvailableForCheckout(whatsappDigits);
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    if (code === 'EMAIL_ALREADY_REGISTERED_USE_LOGIN') {
      return { ok: false, reason: 'E-mail já cadastrado. Faça login.', code };
    }
    if (code === 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN') {
      return { ok: false, reason: 'WhatsApp já cadastrado. Faça login.', code };
    }
    throw err;
  }

  const planRow = await pool.query<{
    trial_days: number | null;
    is_free: boolean;
    free_access_days: number | null;
    plan_type: string;
  }>(
    `SELECT trial_days, is_free, free_access_days, plan_type FROM plans WHERE id = $1 AND is_active = true`,
    [planId],
  );
  if (planRow.rows.length === 0) {
    return { ok: false, reason: 'Plano inválido.', code: 'PLAN_NOT_FOUND' };
  }
  const planMeta = planRow.rows[0]!;

  const sessionMeta = session.metadata_json;
  const extraTrialPrepared = Boolean(sessionMeta.extra_trial_prepared);
  const extraAlreadyUsed = Boolean(lead.metadata_json.extra_trial_consumed_at);
  let trialDays = effectiveCheckoutTrialDays(planMeta);

  if (session.activation_intent === 'trial') {
    if (extraTrialPrepared && !extraAlreadyUsed) {
      trialDays = EXTRA_TRIAL_DAYS;
    }
    if (trialDays < 1) {
      return { ok: false, reason: 'Plano sem trial.', code: 'PLAN_HAS_NO_TRIAL' };
    }

    if (!extraTrialPrepared || extraAlreadyUsed) {
      try {
        await assertNewTrialSignupAllowed({
          cpfCnpjDigits: input.cpfCnpj?.replace(/\D/g, '') || null,
          emailNormalized: normalizeEmailForUniqueness(email),
          whatsappDigits,
        });
      } catch (err) {
        if (err instanceof TrialAlreadyConsumedError) {
          return { ok: false, reason: err.message, code: 'TRIAL_ALREADY_CONSUMED' };
        }
        throw err;
      }
    }
  }

  const usersCount = session.users_count;
  const client = await pool.connect();
  const correlationId = input.correlationId ?? session.correlation_id;

  try {
    await client.query('BEGIN');

    const baseSlug = slugifyOperationalName(companyName) || 'workspace';
    let slug = baseSlug;
    let suffix = 0;
    for (;;) {
      const exists = await client.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
      if (exists.rows.length === 0) break;
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const cpfDigits = input.cpfCnpj?.replace(/\D/g, '') || null;
    const status = session.activation_intent === 'trial' ? 'trial' : 'active';

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO tenants (
         name, slug, plan_id, status, created_via,
         billing_email, billing_phone, cpf_cnpj, responsible_name,
         trial_ends_at, has_used_trial, trial_consumed_at, onboarding_completed
       )
       VALUES (
         $1, $2, $3, $4::text, 'registration',
         $5, $6, $7, $8,
         CASE WHEN $4::text = 'trial' THEN now() + ($9::int * interval '1 day') ELSE NULL END,
         CASE WHEN $4::text = 'trial' THEN true ELSE false END,
         CASE WHEN $4::text = 'trial' THEN now() ELSE NULL END,
         false
       )
       RETURNING id`,
      [
        companyName,
        slug,
        planId,
        status,
        email,
        whatsappDigits,
        cpfDigits,
        responsibleName,
        trialDays,
      ],
    );
    const tenantId = inserted.rows[0]!.id;

    if (usersCount != null && usersCount > 0) {
      await client.query(
        'UPDATE tenants SET max_users_override = $1, updated_at = now() WHERE id = $2',
        [usersCount, tenantId],
      );
    }

    const { userId, email: userEmail } = await createTenantAdminUser(
      {
        tenantId,
        tenantName: companyName,
        email,
        responsibleName,
        whatsappDigits,
        password: input.password,
      },
      { db: client },
    );

    await client.query('COMMIT');

    try {
      await ensureTenantOperationalBootstrap({ tenantId, adminUserId: userId });
    } catch (bootstrapErr) {
      console.warn('[acquisition] tenant_operational_bootstrap_failed', {
        tenantId,
        err: bootstrapErr,
      });
    }

    void applySessionAvatarToUserProfile({ session, userId, tenantId }).catch((err) => {
      console.warn('[acquisition] session_avatar_apply_failed', err);
    });

    const metaPatch: Record<string, unknown> = {
      provisioned_at: new Date().toISOString(),
      operational_tags: ['workspace_criado', 'onboarding_wizard'],
    };
    if (extraTrialPrepared && !extraAlreadyUsed) {
      metaPatch.extra_trial_consumed_at = new Date().toISOString();
      metaPatch.trial_reactivation_count =
        (typeof lead.metadata_json.trial_reactivation_count === 'number'
          ? lead.metadata_json.trial_reactivation_count
          : 0) + 1;
      metaPatch.operational_tags = [
        'trial_2x',
        'extra_trial_granted',
        'reactivated_trial',
        'workspace_criado',
        'onboarding_wizard',
      ];
    }

    const previousStage = lead.current_stage;
    const updatedLead =
      (await updateAcquisitionLeadStage(lead.id, 'onboarding_in_progress', {
        tenantId,
        metadata: metaPatch,
      })) ?? lead;

    await attachTenantToSession(session.id, tenantId);
    await updateOnboardingWizardSession(session.id, {
      current_step: 'company',
      completed_steps: [],
      activation_progress: 0,
      resume_step: 1,
      metadata: {
        step_data: { provision: { at: new Date().toISOString() } },
        onboarding_state: 'active',
      },
    });

    void publishAcquisitionStageChanged(updatedLead, previousStage);

    await trackActivationEvent({
      acquisitionLeadId: lead.id,
      tenantId,
      eventType: 'signup_started',
      correlationId,
      metadata: { plan_id: planId, provisioned: true, wizard: true },
    });

    await kickoffOnboarding({
      lead: { ...updatedLead, tenant_id: tenantId },
      correlationId,
      trigger: 'conversion',
      tenantId,
    });

    void syncAcquisitionLeadToOpsKanban({
      acquisitionLeadId: lead.id,
      correlationId,
      columnNameOverride: 'Onboarding incompleto',
    });

    logAcquisition('workspace_provisioned', {
      acquisition_lead_id: lead.id,
      tenant_id: tenantId,
      session_id: session.id,
    });

    observeTrialActivationShadow({
      acquisitionLeadId: lead.id,
      tenantId,
      correlationId,
      tenantStatus: status,
    });
    if (status === 'trial') {
      void promoteLifecycleCard({
        eventType: 'trial.engagement.started',
        context: {
          tenantId,
          acquisitionLeadId: lead.id,
        },
        correlationId,
        source: 'trial_engagement_started',
      }).then((result) => {
        console.info('[trial_engagement_started]', {
          tenantId,
          leadId: lead.id,
          event: 'trial.engagement.started',
          result: result.status,
        });
      });
    }
    void promoteLifecycleCard({
      eventType: 'onboarding.started',
      context: { acquisitionLeadId: lead.id, tenantId, correlationId },
      correlationId,
      source: 'provisionWorkspaceFromSession',
    });

    // P0-F.1: trial.started é enviado após Company Step (identidade oficial), não no provision.

    const token = generateToken({ userId, email: userEmail });

    return {
      ok: true,
      token,
      tenantId,
      userId,
      email: userEmail,
      redirectPath: `/onboarding/acquisition?session=${encodeURIComponent(session.session_token)}`,
    };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('[acquisition] provision_failed', e);
    return {
      ok: false,
      reason: e instanceof Error ? e.message : 'Falha no provisionamento',
      code: 'PROVISION_FAILED',
    };
  } finally {
    client.release();
  }
}
