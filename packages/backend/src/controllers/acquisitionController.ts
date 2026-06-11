import { Request, Response } from 'express';
import { z } from 'zod';
import { getCorrelationId, mergeRequestContext } from '../context/requestContext.js';
import { randomUUID } from 'crypto';
import { getAcquisitionPublicConfig } from '../acquisition/acquisitionFlags.js';
import { orchestrateTesteGratis } from '../acquisition/trialOrchestrationService.js';
import {
  newAcquisitionCorrelationId,
  orchestrateSignupStep,
} from '../acquisition/signupOrchestrationService.js';
import { findAcquisitionLeadById } from '../acquisition/acquisitionLeadRepository.js';
import { reconcileAcquisitionLeadForResume } from '../acquisition/acquisitionLeadReconciliationService.js';
import { resolveAcquisitionResume } from '../acquisition/acquisitionResumeService.js';
import { logResumeDetected, logResumeRedirect } from '../acquisition/acquisitionResumeLogger.js';
import { markAcquisitionAbandoned } from '../acquisition/acquisitionRecoveryService.js';
import { activateAcquisitionTrial } from '../services/acquisitionTrialActivationService.js';
import { resolveAcquisitionContact } from '../acquisition/acquisitionContactIntelligenceService.js';
import { captureAcquisitionPhoneContact } from '../acquisition/acquisitionPhoneCaptureService.js';
import { loadSessionWithLead } from '../acquisition/acquisitionOnboardingSessionService.js';
import { provisionWorkspaceFromSession } from '../acquisition/acquisitionProvisioningService.js';
import { getPublicSignupEntryPayload } from '../platform/platformRuntimeConfig.js';
import { getSignupStrategy } from '../platform/signupStrategyService.js';
import { checkOperationalSlugAvailability } from '../acquisition/tenantSlugAvailabilityService.js';
import {
  assertSignupPhoneVerified,
  sendSignupPhoneVerificationCode,
  verifySignupPhoneCode,
} from '../acquisition/signupPhoneVerificationService.js';
import { pool } from '../utils/db.js';

const testeGratisSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(8),
  plan_id: z.string().uuid().optional(),
  source: z.string().optional(),
  campaign: z.string().optional(),
  utm: z.record(z.unknown()).optional(),
});

const signupStepSchema = z.object({
  lead_id: z.string().uuid().optional(),
  name: z.string().optional(),
  email: z.string().email(),
  phone: z.string().min(8).optional(),
  plan_id: z.string().uuid().optional(),
  step: z.enum(['contact', 'plan', 'checkout']),
  utm: z.record(z.unknown()).optional(),
});

export async function getAcquisitionConfig(_req: Request, res: Response): Promise<void> {
  const [flags, entry, strategy] = await Promise.all([
    getAcquisitionPublicConfig(),
    getPublicSignupEntryPayload(),
    getSignupStrategy(),
  ]);
  res.json({
    ok: true,
    flags: {
      ...flags,
      signup_flow_v1: strategy.flow === 'exclusive_signup',
    },
    signup_strategy: strategy,
    entry_mode: entry.entry_mode,
    paths: entry.paths,
  });
}

const contactCaptureSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  lead_id: z.string().uuid().optional(),
  source: z.string().optional(),
  phone_verification_id: z.string().uuid(),
});

const phoneSendCodeSchema = z.object({
  phone: z.string().min(10),
  ddi: z.string().optional(),
});

const phoneVerifyCodeSchema = z.object({
  verification_id: z.string().uuid(),
  phone: z.string().min(10),
  code: z.string().min(6).max(6),
});

const contactResolveSchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
  phone: z.string().min(8).optional(),
  lead_id: z.string().uuid().optional(),
  source: z.string().optional(),
});

const activateTrialSchema = z.object({
  lead_id: z.string().uuid(),
  users_count: z.number().int().min(1).optional(),
  grant_extra_trial: z.boolean().optional(),
  avatar_data_url: z.string().max(600_000).optional().nullable(),
  avatar_url: z.string().max(4096).optional().nullable(),
});

const provisionSchema = z.object({
  session_token: z.string().min(8),
  company_name: z.string().min(2),
  password: z.string().min(6),
  responsible_name: z.string().optional(),
  cpf_cnpj: z.string().optional(),
});

export async function postContactCapture(req: Request, res: Response): Promise<void> {
  try {
    const body = contactCaptureSchema.parse(req.body);
    const correlationId = getCorrelationId() ?? randomUUID();
    mergeRequestContext({ correlationId });

    const phoneVerified = await assertSignupPhoneVerified(
      pool,
      body.phone_verification_id,
      body.phone.trim(),
    );
    if (!phoneVerified) {
      res.status(400).json({
        ok: false,
        error: 'Confirme seu WhatsApp antes de continuar.',
        code: 'phone_not_verified',
      });
      return;
    }

    const result = await captureAcquisitionPhoneContact({
      name: body.name.trim(),
      phone: body.phone.trim(),
      leadId: body.lead_id,
      correlationId,
      source: body.source,
    });

    if (!result.ok || !result.lead) {
      res.status(400).json({ ok: false, error: result.reason ?? 'capture_failed' });
      return;
    }

    res.status(201).json({
      ok: true,
      lead_id: result.lead.id,
      correlation_id: correlationId,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Dados inválidos', details: e.errors });
      return;
    }
    console.error('[ACQUISITION] contact_capture_error', e);
    res.status(500).json({ ok: false, error: 'Erro ao registrar contato' });
  }
}

function mapSendCodeReason(reason: string): { status: number; error: string; code: string } {
  switch (reason) {
    case 'invalid_phone':
      return { status: 400, error: 'Informe um WhatsApp válido com DDD.', code: reason };
    case 'resend_cooldown':
      return { status: 429, error: 'Aguarde antes de solicitar um novo código.', code: reason };
    case 'whatsapp_unavailable':
      return { status: 503, error: 'Envio por WhatsApp indisponível no momento.', code: reason };
    case 'send_failed':
      return { status: 502, error: 'Não foi possível enviar o código. Tente novamente.', code: reason };
    default:
      return { status: 500, error: 'Erro ao enviar código.', code: 'send_failed' };
  }
}

function mapVerifyCodeReason(
  reason: 'invalid_code' | 'expired' | 'max_attempts' | 'not_found',
): { status: number; error: string; code: string } {
  switch (reason) {
    case 'invalid_code':
      return { status: 400, error: 'Código incorreto.', code: reason };
    case 'expired':
      return {
        status: 400,
        error: 'O código expirou. Solicite um novo acesso.',
        code: reason,
      };
    case 'max_attempts':
      return {
        status: 400,
        error: 'O código expirou. Solicite um novo acesso.',
        code: 'max_attempts',
      };
    case 'not_found':
      return { status: 404, error: 'Solicitação não encontrada.', code: reason };
    default:
      return { status: 400, error: 'Código incorreto.', code: 'invalid_code' };
  }
}

export async function postPhoneSendCode(req: Request, res: Response): Promise<void> {
  try {
    const body = phoneSendCodeSchema.parse(req.body);
    const result = await sendSignupPhoneVerificationCode(pool, body.phone.trim(), body.ddi);
    if (!result.ok) {
      const mapped = mapSendCodeReason(result.reason);
      res.status(mapped.status).json({
        ok: false,
        error: mapped.error,
        code: mapped.code,
        resend_available_in_seconds: result.resend_available_in_seconds,
      });
      return;
    }
    res.status(201).json({
      ok: true,
      verification_id: result.verification_id,
      resend_available_at: result.resend_available_at,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Dados inválidos', details: e.errors });
      return;
    }
    console.error('[ACQUISITION] phone_send_code_error', e);
    res.status(500).json({ ok: false, error: 'Erro ao enviar código' });
  }
}

export async function postPhoneVerifyCode(req: Request, res: Response): Promise<void> {
  try {
    const body = phoneVerifyCodeSchema.parse(req.body);
    const result = await verifySignupPhoneCode(
      pool,
      body.verification_id,
      body.phone.trim(),
      body.code,
    );
    if (!result.ok) {
      const mapped = mapVerifyCodeReason(result.reason);
      res.status(mapped.status).json({ ok: false, error: mapped.error, code: mapped.code });
      return;
    }
    res.json({ ok: true, verification_id: result.verification_id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Dados inválidos', details: e.errors });
      return;
    }
    console.error('[ACQUISITION] phone_verify_code_error', e);
    res.status(500).json({ ok: false, error: 'Erro ao verificar código' });
  }
}

export async function postPhoneResendCode(req: Request, res: Response): Promise<void> {
  return postPhoneSendCode(req, res);
}

export async function postContactResolve(req: Request, res: Response): Promise<void> {
  try {
    const body = contactResolveSchema.parse(req.body);
    const correlationId = getCorrelationId() ?? randomUUID();
    mergeRequestContext({ correlationId });

    const result = await resolveAcquisitionContact({
      name: body.name?.trim(),
      email: body.email.trim(),
      phone: body.phone?.trim(),
      leadId: body.lead_id,
      correlationId,
      source: body.source,
    });

    res.json({
      ok: true,
      action: result.action,
      message: result.message,
      lead_id: result.lead.id,
      resume_step: result.resume_step,
      resume_path: result.resume_path,
      resume_verified: result.resume_verified,
      extra_trial_eligible: result.extra_trial_eligible,
      operational_tags: result.operational_tags,
      correlation_id: correlationId,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Dados inválidos', details: e.errors });
      return;
    }
    console.error('[ACQUISITION] contact_resolve_error', e);
    res.status(500).json({ ok: false, error: 'Erro ao validar contato' });
  }
}

export async function postActivateTrial(req: Request, res: Response): Promise<void> {
  console.log('[ACTIVATE_TRIAL] body', req.body);
  try {
    const body = activateTrialSchema.parse(req.body);
    const correlationId = getCorrelationId() ?? randomUUID();
    mergeRequestContext({ correlationId });

    const result = await activateAcquisitionTrial({
      acquisitionLeadId: body.lead_id,
      usersCount: body.users_count,
      correlationId,
      grantExtraTrial: body.grant_extra_trial,
      avatarDataUrl: body.avatar_data_url ?? undefined,
      avatarUrl: body.avatar_url ?? undefined,
    });

    if (!result.ok) {
      console.log('[ACTIVATE_TRIAL] business_reject', {
        code: result.code,
        reason: result.reason,
        lead_id: body.lead_id,
      });
      const status =
        result.code === 'CHECKOUT_TRIAL_V1_DISABLED'
          ? 503
          : result.code === 'TRIAL_BLOCKED' || result.code === 'TRIAL_ALREADY_CONSUMED'
            ? 409
            : 400;
      res.status(status).json({ ok: false, code: result.code, error: result.reason });
      return;
    }

    res.status(201).json({
      ok: true,
      session_token: result.sessionToken,
      redirect_path: result.redirectPath,
      lead_id: result.leadId,
      correlation_id: correlationId,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      console.log('[ACTIVATE_TRIAL] validation_error', e);
      res.status(400).json({ ok: false, error: 'Dados inválidos', details: e.errors });
      return;
    }
    console.error('[ACQUISITION] activate_trial_error', e);
    res.status(500).json({ ok: false, error: 'Erro ao preparar avaliação' });
  }
}

export async function getOnboardingSession(req: Request, res: Response): Promise<void> {
  const token = String(req.params.sessionToken ?? '');
  const loaded = await loadSessionWithLead(token);
  if (!loaded) {
    res.status(404).json({ ok: false, error: 'Sessão não encontrada ou expirada' });
    return;
  }
  const { session, lead } = loaded;
  res.json({
    ok: true,
    session: {
      token: session.session_token,
      intent: session.activation_intent,
      resume_step: session.resume_step,
      plan_id: session.plan_id,
      users_count: session.users_count,
    },
    lead: {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      current_stage: lead.current_stage,
      selected_plan_id: lead.selected_plan_id,
      extra_trial_eligible: Boolean(
        Array.isArray(lead.metadata_json.operational_tags) &&
          (lead.metadata_json.operational_tags as string[]).includes('extra_trial_elegivel'),
      ),
    },
  });
}

export async function postProvisionOnboarding(req: Request, res: Response): Promise<void> {
  try {
    const body = provisionSchema.parse(req.body);
    const correlationId = getCorrelationId() ?? randomUUID();

    const result = await provisionWorkspaceFromSession({
      sessionToken: body.session_token,
      companyName: body.company_name,
      password: body.password,
      responsibleName: body.responsible_name,
      cpfCnpj: body.cpf_cnpj,
      correlationId,
    });

    if (!result.ok) {
      const status =
        result.code === 'TRIAL_ALREADY_CONSUMED' || result.code === 'EMAIL_ALREADY_REGISTERED_USE_LOGIN'
          ? 409
          : 400;
      res.status(status).json({ ok: false, code: result.code, error: result.reason });
      return;
    }

    res.status(201).json({
      ok: true,
      token: result.token,
      tenant_id: result.tenantId,
      user: {
        id: result.userId,
        email: result.email,
        tenant_id: result.tenantId,
        registration_complete: true,
        onboarding_completed: false,
      },
      redirect_path: result.redirectPath,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Dados inválidos', details: e.errors });
      return;
    }
    console.error('[ACQUISITION] provision_error', e);
    res.status(500).json({ ok: false, error: 'Erro ao provisionar workspace' });
  }
}

export async function postTesteGratis(req: Request, res: Response): Promise<void> {
  try {
    const body = testeGratisSchema.parse(req.body);
    const correlationId = getCorrelationId() ?? randomUUID();
    mergeRequestContext({ correlationId });

    const result = await orchestrateTesteGratis({
      name: body.name.trim(),
      email: body.email.trim(),
      phone: body.phone.trim(),
      correlationId,
      planId: body.plan_id,
      source: body.source,
      campaign: body.campaign,
      utm: body.utm,
    });

    if (!result.ok) {
      res.status(result.reason === 'trial_flow_v1_off' ? 503 : 400).json({
        ok: false,
        code: result.reason,
        fallback_path: result.checkoutPath ?? '/checkout',
      });
      return;
    }

    res.status(201).json({
      ok: true,
      lead_id: result.lead?.id,
      correlation_id: correlationId,
      activation_score: result.lead?.activation_score,
      trial_plan_id: result.trialPlanId,
      checkout_path: result.checkoutPath,
      onboarding_kickoff_path: `/onboarding/kickoff?lead=${result.lead?.id}`,
      shadow: result.shadow,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Dados inválidos', details: e.errors });
      return;
    }
    console.error('[ACQUISITION] teste_gratis_error', e);
    res.status(500).json({ ok: false, error: 'Erro ao processar teste grátis' });
  }
}

export async function postSignupStep(req: Request, res: Response): Promise<void> {
  try {
    const body = signupStepSchema.parse(req.body);
    const correlationId = getCorrelationId() ?? newAcquisitionCorrelationId();

    const result = await orchestrateSignupStep({
      leadId: body.lead_id,
      name: body.name,
      email: body.email,
      phone: body.phone,
      planId: body.plan_id,
      step: body.step,
      correlationId,
      utm: body.utm,
    });

    if (!result.ok) {
      const status =
        result.reason === 'login_required' || result.reason === 'trial_blocked' ? 409 : result.reason?.includes('off') ? 503 : 400;
      res.status(status).json({
        ok: false,
        code: result.reason,
        contact_message: result.contact_message,
        fallback_path: result.nextPath ?? '/register',
      });
      return;
    }

    res.json({
      ok: true,
      lead_id: result.lead?.id,
      correlation_id: correlationId,
      activation_score: result.lead?.activation_score,
      next_path: result.nextPath,
      stage: result.lead?.current_stage,
      contact_message: result.contact_message,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Dados inválidos', details: e.errors });
      return;
    }
    console.error('[SIGNUP] step_error', e);
    res.status(500).json({ ok: false, error: 'Erro no fluxo de signup' });
  }
}

export async function getAcquisitionLead(req: Request, res: Response): Promise<void> {
  const leadId = String(req.params.leadId ?? '');
  const raw = await findAcquisitionLeadById(leadId);
  if (!raw) {
    res.status(404).json({ ok: false, error: 'Lead não encontrado' });
    return;
  }

  const { lead } = await reconcileAcquisitionLeadForResume(raw);
  const resume = await resolveAcquisitionResume(lead);

  logResumeDetected({
    lead_id: lead.id,
    current_stage: lead.current_stage,
    resume_path: resume.path,
    resume_verified: resume.canContinueWhereLeftOff,
  });

  if (!resume.path.startsWith('/cadastro')) {
    logResumeRedirect({ lead_id: lead.id, destination: resume.path });
  }

  res.json({
    ok: true,
    lead: {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      current_stage: lead.current_stage,
      activation_score: lead.activation_score,
      selected_plan_id: lead.selected_plan_id,
      correlation_id: lead.correlation_id,
      tenant_id: lead.tenant_id,
    },
    resume_path: resume.path,
    resume_verified: resume.canContinueWhereLeftOff,
    resume_message: resume.message,
  });
}

export async function getAcquisitionSlugCheck(req: Request, res: Response): Promise<void> {
  const raw = typeof req.query.slug === 'string' ? req.query.slug : '';
  if (!raw.trim()) {
    res.status(400).json({ ok: false, error: 'slug obrigatório' });
    return;
  }
  const result = await checkOperationalSlugAvailability(raw);
  if (result.available) {
    res.json({ available: true });
    return;
  }
  res.json({ available: false, suggestion: result.suggestion });
}

export async function postMarkAbandoned(req: Request, res: Response): Promise<void> {
  const leadId = String(req.params.leadId ?? '');
  const correlationId = getCorrelationId() ?? randomUUID();
  const result = await markAcquisitionAbandoned({ leadId, correlationId });
  if (!result.ok) {
    res.status(404).json({ ok: false, error: 'Lead não encontrado' });
    return;
  }
  res.json({ ok: true, eligibility: result.eligibility });
}
