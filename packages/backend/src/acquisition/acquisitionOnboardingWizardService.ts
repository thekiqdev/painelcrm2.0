import { randomBytes } from 'crypto';
import { pool } from '../utils/db.js';
import {
  type OnboardingWizardStatePayload,
  type OnboardingWizardStepId,
  WIZARD_STEP_ORDER,
  wizardProgressPercent,
  nextWizardStep,
  isTeamStepEnabled,
  normalizeWizardCurrentStep,
} from './onboardingWizardTypes.js';
import {
  findOnboardingSessionByToken,
  findOnboardingSessionByTokenForAccess,
  findActiveOnboardingSessionByTenantId,
  loadSessionWithLead,
  updateOnboardingWizardSession,
  type OnboardingSessionRow,
} from './acquisitionOnboardingSessionService.js';
import { emitOnboardingWizardEvent } from './acquisitionOnboardingOrchestration.js';
import { hashPassword } from '../utils/bcrypt.js';
import { getPermissionsForRole, type AppRole } from '../services/rolePermissionsService.js';
import { normalizeEmailForUniqueness } from '../utils/userIdentity.js';
import { checkTenantUsersLimitForAddOne } from '../services/tenantLimitService.js';
import type { AcquisitionLeadRow } from './acquisitionTypes.js';
import { logOnboardingCompany } from './acquisitionLogger.js';
import { checkOperationalSlugAvailability } from './tenantSlugAvailabilityService.js';
import { isValidOperationalSlug, normalizeOperationalSlugInput } from './tenantOperationalSlug.js';
import { notifySuperAdminsNewTenant } from '../services/superadminNotificationsService.js';
import {
  schedulePublishPlatformAccountCreated,
  schedulePublishPlatformTrialStarted,
} from '../services/platformNotifications/platformBusinessNotifications.js';
import { observeOnboardingCompletedShadow } from '../lifecycle/lifecycleDebugService.js';
import { promoteLifecycleCard } from '../lifecycle/lifecyclePromotionService.js';

const STEP_RESUME_INDEX: Record<string, number> = {
  provision: 0,
  company: 1,
  users: 2,
  whatsapp: 3,
  completed: 4,
};

export function buildWizardStatePayload(session: OnboardingSessionRow): OnboardingWizardStatePayload {
  const meta = session.metadata_json;
  const stepData = (meta.step_data ?? {}) as OnboardingWizardStatePayload['step_data'];
  const completed = (session.completed_steps.length
    ? session.completed_steps
    : (meta.completed_steps as string[]) ?? []) as OnboardingWizardStepId[];

  let currentStep = (session.current_step || meta.current_step || 'company') as OnboardingWizardStepId;
  if (!session.tenant_id && currentStep !== 'provision') {
    currentStep = 'provision';
  }
  currentStep = normalizeWizardCurrentStep(currentStep, session.users_count);

  const usersCount = session.users_count;
  const completedFiltered = completed.filter((s) =>
    WIZARD_STEP_ORDER.includes(s as (typeof WIZARD_STEP_ORDER)[number]),
  ) as OnboardingWizardStepId[];

  return {
    onboarding_state: session.status === 'completed' ? 'completed' : 'active',
    current_step: currentStep,
    completed_steps: completedFiltered,
    activation_progress: session.activation_progress || wizardProgressPercent(completedFiltered, usersCount),
    step_data: stepData,
  };
}

export function buildWizardOperationMeta(session: OnboardingSessionRow) {
  const usersCount = session.users_count ?? 1;
  return {
    users_count: usersCount,
    seats_limit: usersCount,
    team_step_enabled: isTeamStepEnabled(usersCount),
  };
}

export async function getWizardStateByToken(token: string) {
  const loaded = await loadSessionWithLead(token);
  if (!loaded) return null;
  const { session, lead } = loaded;
  return {
    session,
    lead,
    wizard: buildWizardStatePayload(session),
    needs_provision: !session.tenant_id,
  };
}

export async function getWizardStateByTenantId(tenantId: string) {
  const session = await findActiveOnboardingSessionByTenantId(tenantId);
  if (!session) return null;
  const { findAcquisitionLeadById } = await import('./acquisitionLeadRepository.js');
  const lead = await findAcquisitionLeadById(session.acquisition_lead_id);
  if (!lead) return null;
  return {
    session,
    lead,
    wizard: buildWizardStatePayload(session),
    needs_provision: false,
  };
}

async function persistStepCompletion(
  session: OnboardingSessionRow,
  step: OnboardingWizardStepId,
  stepDataPatch: Record<string, unknown>,
): Promise<OnboardingWizardStatePayload> {
  const usersCount = session.users_count;
  const completed = new Set([
    ...session.completed_steps,
    step,
  ] as OnboardingWizardStepId[]);

  if (step === 'company' && !isTeamStepEnabled(usersCount)) {
    completed.add('users');
  }

  const completedArr = [...completed].filter((s) =>
    WIZARD_STEP_ORDER.includes(s as (typeof WIZARD_STEP_ORDER)[number]),
  ) as OnboardingWizardStepId[];

  const next = nextWizardStep(step, usersCount);
  const progress = wizardProgressPercent(completedArr, usersCount);
  const meta = {
    ...session.metadata_json,
    step_data: {
      ...((session.metadata_json.step_data as object) ?? {}),
      ...stepDataPatch,
    },
    last_completed_step: step,
    last_completed_at: new Date().toISOString(),
  };

  await updateOnboardingWizardSession(session.id, {
    current_step: next,
    completed_steps: completedArr,
    activation_progress: progress,
    resume_step: STEP_RESUME_INDEX[next] ?? 3,
    metadata: meta,
  });

  const refreshed = (await findOnboardingSessionByToken(session.session_token)) ?? session;
  return buildWizardStatePayload({
    ...refreshed,
    completed_steps: completedArr,
    current_step: next,
    activation_progress: progress,
  });
}

export async function completeWizardCompanyStep(input: {
  sessionToken: string;
  tenantId: string;
  companyName: string;
  slug: string;
  logoLightUrl?: string | null;
  logoDarkUrl?: string | null;
  workspaceName?: string;
}): Promise<{ ok: boolean; wizard?: OnboardingWizardStatePayload; reason?: string }> {
  const loaded = await loadSessionWithLead(input.sessionToken);
  if (!loaded || loaded.session.tenant_id !== input.tenantId) {
    return { ok: false, reason: 'session_mismatch' };
  }

  const name = input.companyName.trim();
  if (name.length < 2) return { ok: false, reason: 'company_name_required' };

  const slug = normalizeOperationalSlugInput(input.slug);
  if (!isValidOperationalSlug(slug)) {
    return { ok: false, reason: 'slug_invalid' };
  }

  const availability = await checkOperationalSlugAvailability(slug, { excludeTenantId: input.tenantId });
  if (!availability.available) {
    return { ok: false, reason: 'slug_unavailable' };
  }

  const tenantBefore = await pool.query<{ slug: string; status: string }>(
    'SELECT slug, status::text AS status FROM tenants WHERE id = $1',
    [input.tenantId],
  );
  const previousSlug = tenantBefore.rows[0]?.slug ?? '';
  const companyAlreadyCompleted = loaded.session.completed_steps.includes('company');

  await pool.query(
    `UPDATE tenants SET name = $2, slug = $3,
       logo_light_url = COALESCE($4, logo_light_url),
       logo_dark_url = COALESCE($5, logo_dark_url),
       logo_url = CASE WHEN $4 IS NOT NULL THEN $4 ELSE logo_url END,
       updated_at = now()
     WHERE id = $1`,
    [input.tenantId, name, slug, input.logoLightUrl ?? null, input.logoDarkUrl ?? null],
  );

  await pool.query(
    `UPDATE profiles p SET company_name = $2, updated_at = now()
     FROM users u WHERE p.id = u.id AND u.tenant_id = $1`,
    [input.tenantId, name],
  );

  logOnboardingCompany('company_saved', {
    tenant_id: input.tenantId,
    company_name: name,
    previous_slug: previousSlug,
    new_slug: slug,
  });

  const wizard = await persistStepCompletion(loaded.session, 'company', {
    company: {
      company_name: name,
      slug,
      logo_light_url: input.logoLightUrl ?? null,
      logo_dark_url: input.logoDarkUrl ?? null,
      workspace_name: input.workspaceName?.trim() ?? name,
    },
  });

  await emitOnboardingWizardEvent({
    eventKey: 'onboarding.company.completed',
    acquisitionLeadId: loaded.lead.id,
    tenantId: input.tenantId,
    correlationId: loaded.session.correlation_id,
    metadata: { company_name: name, slug },
  });

  const tenantStatus = tenantBefore.rows[0]?.status;
  if (!companyAlreadyCompleted) {
    setImmediate(() => notifySuperAdminsNewTenant(name, input.tenantId).catch(() => {}));
    if (tenantStatus === 'trial') {
      schedulePublishPlatformAccountCreated(input.tenantId);
      schedulePublishPlatformTrialStarted(input.tenantId);
    }
  }

  return { ok: true, wizard };
}

export async function completeWizardUsersStep(input: {
  sessionToken: string;
  tenantId: string;
  requesterId: string;
  members: Array<{ email: string; full_name: string; role: string; phone?: string; password?: string }>;
}): Promise<{ ok: boolean; wizard?: OnboardingWizardStatePayload; created?: number; reason?: string }> {
  const loaded = await loadSessionWithLead(input.sessionToken);
  if (!loaded || loaded.session.tenant_id !== input.tenantId) {
    return { ok: false, reason: 'session_mismatch' };
  }

  const createdMembers: Array<{ email: string; full_name: string; role: string; phone?: string | null }> = [];

  if (input.members.length > 0) {
    const profileRow = await pool.query<{ profile_id: string; owner_id: string }>(
      `SELECT up.id AS profile_id, up.owner_id
       FROM user_profiles up
       JOIN users o ON o.id = up.owner_id AND o.tenant_id = $1
       ORDER BY up.created_at ASC LIMIT 1`,
      [input.tenantId],
    );
    if (profileRow.rows.length === 0) {
      return { ok: false, reason: 'profile_missing' };
    }
    const { profile_id: profileId, owner_id: ownerId } = profileRow.rows[0]!;

    for (const member of input.members) {
      const limit = await checkTenantUsersLimitForAddOne(input.tenantId);
      if (!limit.allowed) break;

      const email = normalizeEmailForUniqueness(member.email);
      const exists = await pool.query('SELECT id FROM users WHERE lower(btrim(email)) = $1', [email]);
      if (exists.rows.length > 0) continue;

      const role = (['admin', 'member', 'viewer'].includes(member.role) ? member.role : 'member') as AppRole;
      const pwd = member.password && member.password.length >= 6 ? member.password : cryptoRandomPassword();
      const passwordHash = await hashPassword(pwd);
      const fullName = member.full_name.trim();
      const parts = fullName.split(/\s+/).filter(Boolean);
      const firstName = parts[0] ?? fullName;
      const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';

      const phoneDigits = member.phone?.replace(/\D/g, '') || null;
      const ins = await pool.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, whatsapp_number, tenant_id) VALUES ($1, $2, $3, $4) RETURNING id`,
        [email, passwordHash, phoneDigits && phoneDigits.length >= 10 ? phoneDigits : null, input.tenantId],
      );
      const userId = ins.rows[0]!.id;
      await pool.query(
        `INSERT INTO profiles (id, first_name, last_name, company_name, registration_complete)
         VALUES ($1, $2, $3, '', true)`,
        [userId, firstName, lastName],
      );
      await pool.query(
        'INSERT INTO profile_members (profile_id, user_id, created_by) VALUES ($1, $2, $3)',
        [profileId, userId, input.requesterId],
      );
      await pool.query(
        `INSERT INTO user_roles (user_id, role, profile_id, created_by) VALUES ($1, $2::app_role, $3, $4)`,
        [userId, role, profileId, ownerId],
      );
      const perms = getPermissionsForRole(role);
      for (const permission of perms) {
        await pool.query(
          `INSERT INTO user_permissions (user_id, profile_id, permission, created_by) VALUES ($1, $2, $3, $4)`,
          [userId, profileId, permission, input.requesterId],
        );
      }
      createdMembers.push({ email, full_name: fullName, role, phone: phoneDigits });
    }
  }

  const wizard = await persistStepCompletion(loaded.session, 'users', {
    users: { members: createdMembers },
  });

  await emitOnboardingWizardEvent({
    eventKey: 'onboarding.users.completed',
    acquisitionLeadId: loaded.lead.id,
    tenantId: input.tenantId,
    correlationId: loaded.session.correlation_id,
    metadata: { members_added: createdMembers.length },
  });

  return { ok: true, wizard, created: createdMembers.length };
}

function cryptoRandomPassword(): string {
  return randomBytes(12).toString('base64url').slice(0, 14) + 'A1!';
}

export async function completeWizardWhatsappStep(input: {
  sessionToken: string;
  tenantId: string;
  instanceId: string;
  connectionName?: string;
}): Promise<{ ok: boolean; wizard?: OnboardingWizardStatePayload; summary?: WizardOperationalSummary; reason?: string }> {
  const loaded = await loadSessionWithLead(input.sessionToken);
  if (!loaded || loaded.session.tenant_id !== input.tenantId) {
    return { ok: false, reason: 'session_mismatch' };
  }

  const inst = await pool.query<{
    id: string;
    status: string;
    name: string;
    connected_phone: string | null;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT ci.id, ci.status, ci.name, ci.connected_phone, ci.metadata
     FROM chat_instances ci
     INNER JOIN users u ON u.id = ci.user_id
     WHERE ci.id = $1 AND u.tenant_id = $2`,
    [input.instanceId, input.tenantId],
  );
  if (inst.rows.length === 0) return { ok: false, reason: 'instance_not_found' };

  const row = inst.rows[0]!;
  const status = String(row.status ?? '').toLowerCase();
  if (!['open', 'connected', 'online'].includes(status)) {
    return { ok: false, reason: 'whatsapp_not_connected' };
  }

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const profileName =
    typeof meta.profile_name === 'string'
      ? meta.profile_name
      : typeof meta.pushname === 'string'
        ? meta.pushname
        : null;

  const wizard = await persistStepCompletion(loaded.session, 'whatsapp', {
    whatsapp: {
      instance_id: input.instanceId,
      connection_name: input.connectionName ?? row.name,
      connected_at: new Date().toISOString(),
      connected_phone: row.connected_phone,
      profile_name: profileName,
    },
  });

  await updateOnboardingWizardSession(loaded.session.id, {
    current_step: 'completed',
    activation_progress: 100,
    status: 'completed',
    resume_step: 4,
  });

  await pool.query(
    `UPDATE tenants SET onboarding_completed = true, updated_at = now() WHERE id = $1`,
    [input.tenantId],
  );

  observeOnboardingCompletedShadow({
    acquisitionLeadId: loaded.lead.id,
    tenantId: input.tenantId,
    correlationId: loaded.session.correlation_id,
  });
  void promoteLifecycleCard({
    eventType: 'onboarding.completed',
    context: {
      acquisitionLeadId: loaded.lead.id,
      tenantId: input.tenantId,
      correlationId: loaded.session.correlation_id,
    },
    correlationId: loaded.session.correlation_id,
    source: 'completeWizardWhatsappStep',
  });

  const { completeOnboardingSession } = await import('./acquisitionOnboardingSessionService.js');
  await completeOnboardingSession(loaded.session.id, input.tenantId);

  const { applySessionAvatarForTenantAdmin } = await import('./acquisitionSessionAvatarService.js');
  void applySessionAvatarForTenantAdmin(loaded.session, input.tenantId).catch(() => {});

  await emitOnboardingWizardEvent({
    eventKey: 'whatsapp.connected',
    acquisitionLeadId: loaded.lead.id,
    tenantId: input.tenantId,
    correlationId: loaded.session.correlation_id,
    metadata: { instance_id: input.instanceId, activation_signal: true },
  });

  const summary = await buildWizardOperationalSummary(input.tenantId, loaded.session, loaded.lead);
  return {
    ok: true,
    wizard: { ...wizard, onboarding_state: 'completed', current_step: 'completed', activation_progress: 100 },
    summary,
  };
}

export type WizardOperationalSummary = {
  company_name: string;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  members: Array<{ full_name: string; email: string; role: string; phone?: string | null }>;
  whatsapp: {
    connected: boolean;
    connection_name?: string | null;
    phone?: string | null;
    profile_name?: string | null;
    skipped?: boolean;
  };
  plan_name: string | null;
  activation_progress: number;
  operational_status: string;
};

export async function buildWizardOperationalSummary(
  tenantId: string,
  session: OnboardingSessionRow,
  lead: AcquisitionLeadRow,
): Promise<WizardOperationalSummary> {
  const stepData = (session.metadata_json.step_data ?? {}) as OnboardingWizardStatePayload['step_data'];
  const tenantRow = await pool.query<{
    name: string;
    logo_light_url: string | null;
    logo_dark_url: string | null;
  }>(`SELECT name, logo_light_url, logo_dark_url FROM tenants WHERE id = $1`, [tenantId]);

  let planName: string | null = null;
  if (session.plan_id) {
    const pr = await pool.query<{ name: string }>(`SELECT name FROM plans WHERE id = $1`, [session.plan_id]);
    planName = pr.rows[0]?.name ?? null;
  }

  const whatsappStep = stepData.whatsapp ?? {};
  return {
    company_name: stepData.company?.company_name ?? tenantRow.rows[0]?.name ?? lead.name ?? 'Operação',
    logo_light_url: stepData.company?.logo_light_url ?? tenantRow.rows[0]?.logo_light_url ?? null,
    logo_dark_url: stepData.company?.logo_dark_url ?? tenantRow.rows[0]?.logo_dark_url ?? null,
    members: stepData.users?.members ?? [],
    whatsapp: {
      connected: Boolean(whatsappStep.instance_id && !whatsappStep.skipped),
      connection_name: whatsappStep.connection_name ?? null,
      phone: whatsappStep.connected_phone ?? null,
      profile_name: whatsappStep.profile_name ?? null,
      skipped: Boolean(whatsappStep.skipped),
    },
    plan_name: planName,
    activation_progress: session.activation_progress ?? 100,
    operational_status: whatsappStep.skipped ? 'ativação_parcial' : 'operacional_ativo',
  };
}

export async function getWizardOperationalSummaryForSession(
  sessionToken: string,
  tenantId: string,
): Promise<WizardOperationalSummary | null> {
  const loaded = await loadSessionWithLead(sessionToken);
  if (!loaded || loaded.session.tenant_id !== tenantId) return null;
  return buildWizardOperationalSummary(tenantId, loaded.session, loaded.lead);
}

/** Conclui onboarding sem WhatsApp — usuário conecta depois nas configurações. */
export async function skipWizardWhatsappStep(input: {
  sessionToken: string;
  tenantId: string;
}): Promise<{
  ok: boolean;
  wizard?: OnboardingWizardStatePayload;
  summary?: WizardOperationalSummary;
  reason?: string;
}> {
  const loaded = await loadSessionWithLead(input.sessionToken);
  if (!loaded || loaded.session.tenant_id !== input.tenantId) {
    return { ok: false, reason: 'session_mismatch' };
  }

  const wizard = await persistStepCompletion(loaded.session, 'whatsapp', {
    whatsapp: { skipped: true, skipped_at: new Date().toISOString() },
  });

  await updateOnboardingWizardSession(loaded.session.id, {
    current_step: 'completed',
    activation_progress: 100,
    status: 'completed',
    resume_step: 4,
    metadata: {
      whatsapp_skipped: true,
      onboarding_state: 'completed',
    },
  });

  await pool.query(
    `UPDATE tenants SET onboarding_completed = true, updated_at = now() WHERE id = $1`,
    [input.tenantId],
  );

  observeOnboardingCompletedShadow({
    acquisitionLeadId: loaded.lead.id,
    tenantId: input.tenantId,
    correlationId: loaded.session.correlation_id,
  });
  void promoteLifecycleCard({
    eventType: 'onboarding.completed',
    context: {
      acquisitionLeadId: loaded.lead.id,
      tenantId: input.tenantId,
      correlationId: loaded.session.correlation_id,
    },
    correlationId: loaded.session.correlation_id,
    source: 'skipWizardWhatsappStep',
  });

  const { completeOnboardingSession } = await import('./acquisitionOnboardingSessionService.js');
  await completeOnboardingSession(loaded.session.id, input.tenantId);

  const { applySessionAvatarForTenantAdmin } = await import('./acquisitionSessionAvatarService.js');
  void applySessionAvatarForTenantAdmin(loaded.session, input.tenantId).catch(() => {});

  const { mergeAcquisitionLeadMetadata } = await import('./acquisitionLeadRepository.js');
  await mergeAcquisitionLeadMetadata(loaded.lead.id, {
    operational_tags: ['onboarding_sem_whatsapp'],
  });

  const { syncAcquisitionLeadToOpsKanban } = await import('../services/superadminOpsKanbanLeadService.js');
  void syncAcquisitionLeadToOpsKanban({
    acquisitionLeadId: loaded.lead.id,
    correlationId: loaded.session.correlation_id,
    columnNameOverride: 'Trial iniciado',
    timelineType: 'onboarding_whatsapp_skipped',
  });

  const { appendOperationalTimelineForLead } = await import('../services/superadminOpsLeadTimelineService.js');
  void appendOperationalTimelineForLead(loaded.lead.id, {
    type: 'onboarding_whatsapp_skipped',
    label: 'WhatsApp adiado',
    correlation_id: loaded.session.correlation_id,
    tenant_id: input.tenantId,
  });

  const summary = await buildWizardOperationalSummary(input.tenantId, loaded.session, loaded.lead);
  return {
    ok: true,
    wizard: { ...wizard, onboarding_state: 'completed', current_step: 'completed', activation_progress: 100 },
    summary,
  };
}

export async function resolveTenantWizardSession(
  tenantId: string,
  sessionToken?: string,
): Promise<OnboardingSessionRow | null> {
  if (sessionToken) {
    const s = await findOnboardingSessionByTokenForAccess(sessionToken);
    if (s?.tenant_id === tenantId) return s;
  }
  return findActiveOnboardingSessionByTenantId(tenantId);
}
