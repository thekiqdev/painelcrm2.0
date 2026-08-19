/**
 * M5 S7.2/S7.3 — controllers públicos do checkout do canal Partner.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { PartnerAdminError } from './partnerAdminService.js';
import {
  signupPartnerChannelPaid,
  signupPartnerChannelTrial,
  validatePartnerChannelAdmin,
} from './partnerChannelSignupService.js';

const honeypotSchema = z.object({
  /** Campo oculto anti-bot — se preenchido, responde sucesso falso. */
  website: z.string().optional().nullable(),
  company_website: z.string().optional().nullable(),
});

const signupBodySchema = z
  .object({
    partner_slug: z.string().min(1),
    partner_sell_plan_id: z.string().uuid(),
    seller_user_id: z.string().uuid().nullable().optional(),
    company_name: z.string().min(2),
    email: z.string().email(),
    billing_email: z.string().email().optional().nullable(),
    responsible_name: z.string().min(1),
    password: z.string().min(8),
    whatsapp: z.string().min(8),
    cpf_cnpj: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    tenant_id: z.string().uuid().optional().nullable(),
    payment_method: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']).optional(),
  })
  .merge(honeypotSchema);

const validateAdminSchema = z
  .object({
    email: z.string().email(),
    whatsapp: z.string().min(8),
  })
  .merge(honeypotSchema);

function handleErr(err: unknown, res: Response): void {
  if (err instanceof PartnerAdminError) {
    const body: Record<string, unknown> = { ok: false, error: err.message, code: err.code };
    if (err.code === 'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD' || err.code === 'CPF_CNPJ_INVALID') {
      body.field = 'cpf_cnpj';
    }
    if (err.code === 'EMAIL_ALREADY_REGISTERED_USE_LOGIN') {
      body.field = 'email';
    }
    if (err.code === 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN') {
      body.field = 'whatsapp';
    }
    res.status(err.status).json(body);
    return;
  }
  console.error('[partner-channel public]', err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
}

function hostFromReq(req: Request): string | null {
  return req.get('x-forwarded-host') || req.get('host') || null;
}

/** S7.3 — honeypot: bots preenchem website → 201 fake sem provisionar. */
export function isPartnerChannelHoneypotTriggered(body: {
  website?: string | null;
  company_website?: string | null;
}): boolean {
  return Boolean((body.website ?? '').trim() || (body.company_website ?? '').trim());
}

function honeypotTrialResponse(res: Response): void {
  res.status(201).json({
    ok: true,
    token: 'ok',
    tenant_id: '00000000-0000-4000-8000-000000000000',
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'ok@example.com',
      tenant_id: '00000000-0000-4000-8000-000000000000',
      registration_complete: true,
    },
    trial_ends_at: null,
    partner_sell_plan_id: '00000000-0000-4000-8000-000000000002',
  });
}

function honeypotPaidResponse(res: Response): void {
  res.status(201).json({
    ok: true,
    billing_id: '00000000-0000-4000-8000-000000000003',
    tenant_id: '00000000-0000-4000-8000-000000000000',
    amount_cents: 0,
    payment_method: 'PIX',
    partner_sell_plan_id: '00000000-0000-4000-8000-000000000002',
  });
}

export async function publicPartnerChannelSignupTrial(req: Request, res: Response): Promise<void> {
  const parsed = signupBodySchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: 'Payload inválido',
      code: 'INVALID_CHECKOUT_CONTEXT',
      details: parsed.error.flatten(),
    });
    return;
  }
  if (isPartnerChannelHoneypotTriggered(parsed.data)) {
    honeypotTrialResponse(res);
    return;
  }
  try {
    const { website: _w, company_website: _cw, ...payload } = parsed.data;
    const result = await signupPartnerChannelTrial({
      ...payload,
      host: hostFromReq(req),
    });
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    handleErr(err, res);
  }
}

export async function publicPartnerChannelSignup(req: Request, res: Response): Promise<void> {
  const parsed = signupBodySchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: 'Payload inválido',
      code: 'INVALID_CHECKOUT_CONTEXT',
      details: parsed.error.flatten(),
    });
    return;
  }
  if (isPartnerChannelHoneypotTriggered(parsed.data)) {
    honeypotPaidResponse(res);
    return;
  }
  try {
    const { website: _w, company_website: _cw, ...payload } = parsed.data;
    const result = await signupPartnerChannelPaid({
      ...payload,
      host: hostFromReq(req),
    });
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    handleErr(err, res);
  }
}

export async function publicPartnerChannelValidateAdmin(req: Request, res: Response): Promise<void> {
  const parsed = validateAdminSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: 'Payload inválido',
      code: 'INVALID_CHECKOUT_CONTEXT',
      details: parsed.error.flatten(),
    });
    return;
  }
  if (isPartnerChannelHoneypotTriggered(parsed.data)) {
    res.json({ ok: true });
    return;
  }
  try {
    const result = await validatePartnerChannelAdmin(parsed.data);
    res.json(result);
  } catch (err) {
    handleErr(err, res);
  }
}
