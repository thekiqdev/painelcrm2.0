import { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  completeWizardCompanyStep,
  completeWizardUsersStep,
  completeWizardWhatsappStep,
  skipWizardWhatsappStep,
  getWizardStateByTenantId,
  getWizardStateByToken,
  getWizardOperationalSummaryForSession,
  resolveTenantWizardSession,
  buildWizardOperationMeta,
} from '../acquisition/acquisitionOnboardingWizardService.js';
import {
  formatWizardZodError,
  wizardCompanyBodySchema,
  wizardUsersBodySchema,
} from '../acquisition/onboardingWizardValidation.js';
import { resolveSessionAvatarDisplay } from '../acquisition/acquisitionSessionAvatarService.js';

const whatsappSchema = z.object({
  session_token: z.string().min(8),
  instance_id: z.string().uuid(),
  connection_name: z.string().min(1).max(120).optional(),
});

export async function getWizardStatePublic(req: import('express').Request, res: Response): Promise<void> {
  const token = String(req.params.sessionToken ?? '');
  const state = await getWizardStateByToken(token);
  if (!state) {
    res.status(404).json({ ok: false, error: 'Sessão não encontrada' });
    return;
  }
  res.json({
    ok: true,
    needs_provision: state.needs_provision,
    tenant_id: state.session.tenant_id,
    wizard: state.wizard,
    operation: buildWizardOperationMeta(state.session),
    avatar: resolveSessionAvatarDisplay(state.session.metadata_json),
    lead: {
      id: state.lead.id,
      name: state.lead.name,
      email: state.lead.email,
      phone: state.lead.phone,
    },
  });
}

export async function getWizardStateAuth(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId;
  if (!tenantId) {
    res.status(403).json({ ok: false, error: 'Sem tenant' });
    return;
  }
  const sessionToken = typeof req.query.session_token === 'string' ? req.query.session_token : undefined;
  const state = sessionToken
    ? await getWizardStateByToken(sessionToken)
    : await getWizardStateByTenantId(tenantId);

  if (!state || state.session.tenant_id !== tenantId) {
    res.status(404).json({ ok: false, error: 'Wizard não encontrado' });
    return;
  }
  res.json({ ok: true, wizard: state.wizard, session_token: state.session.session_token });
}

export async function getWizardSummary(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId;
  if (!tenantId) {
    res.status(403).json({ ok: false });
    return;
  }
  const sessionToken = typeof req.query.session_token === 'string' ? req.query.session_token : '';
  if (!sessionToken) {
    res.status(400).json({ ok: false, error: 'session_token obrigatório' });
    return;
  }
  const summary = await getWizardOperationalSummaryForSession(sessionToken, tenantId);
  if (!summary) {
    res.status(404).json({ ok: false, error: 'Resumo indisponível' });
    return;
  }
  res.json({ ok: true, summary });
}

export async function postWizardCompany(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId || !req.userId) {
      res.status(403).json({ ok: false, error: 'Não autenticado' });
      return;
    }
    const body = wizardCompanyBodySchema.parse(req.body);
    const result = await completeWizardCompanyStep({
      sessionToken: body.session_token,
      tenantId,
      companyName: body.company_name,
      slug: body.slug,
      logoLightUrl: body.logo_light_url,
      logoDarkUrl: body.logo_dark_url,
      workspaceName: body.workspace_name,
    });
    if (!result.ok) {
      const slugMessages: Record<string, string> = {
        slug_invalid: 'Endereço inválido. Use letras minúsculas, números e hífens.',
        slug_unavailable: 'Este endereço já está em uso. Escolha outro ou use a sugestão.',
      };
      res.status(400).json({
        ok: false,
        code: result.reason,
        error: result.reason ? slugMessages[result.reason] : undefined,
      });
      return;
    }
    res.json({ ok: true, wizard: result.wizard });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, ...formatWizardZodError(e) });
      return;
    }
    console.error('[wizard] company', e);
    res.status(500).json({ ok: false, error: 'Erro ao salvar empresa' });
  }
}

export async function postWizardUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId || !req.userId) {
      res.status(403).json({ ok: false, error: 'Não autenticado' });
      return;
    }
    const body = wizardUsersBodySchema.parse(req.body);
    const result = await completeWizardUsersStep({
      sessionToken: body.session_token,
      tenantId,
      requesterId: req.userId,
      members: body.members,
    });
    if (!result.ok) {
      res.status(400).json({ ok: false, code: result.reason });
      return;
    }
    res.json({ ok: true, wizard: result.wizard, members_created: result.created ?? 0 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, ...formatWizardZodError(e) });
      return;
    }
    console.error('[wizard] users', e);
    res.status(500).json({ ok: false, error: 'Erro ao salvar equipe' });
  }
}

export async function postWizardWhatsappComplete(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ ok: false, error: 'Não autenticado' });
      return;
    }
    const body = whatsappSchema.parse(req.body);
    const result = await completeWizardWhatsappStep({
      sessionToken: body.session_token,
      tenantId,
      instanceId: body.instance_id,
      connectionName: body.connection_name,
    });
    if (!result.ok) {
      res.status(400).json({ ok: false, code: result.reason });
      return;
    }
    res.json({ ok: true, wizard: result.wizard, summary: result.summary });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Dados de conexão inválidos', details: e.errors });
      return;
    }
    console.error('[wizard] whatsapp', e);
    res.status(500).json({ ok: false, error: 'Erro ao confirmar WhatsApp' });
  }
}

const skipSchema = z.object({
  session_token: z.string().min(8),
  step: z.enum(['users', 'whatsapp']),
});

export async function postWizardSkip(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId || !req.userId) {
      res.status(403).json({ ok: false, error: 'Não autenticado' });
      return;
    }
    const body = skipSchema.parse(req.body);

    if (body.step === 'users') {
      const result = await completeWizardUsersStep({
        sessionToken: body.session_token,
        tenantId,
        requesterId: req.userId,
        members: [],
      });
      if (!result.ok) {
        res.status(400).json({ ok: false, code: result.reason });
        return;
      }
      res.json({ ok: true, wizard: result.wizard });
      return;
    }

    const result = await skipWizardWhatsappStep({
      sessionToken: body.session_token,
      tenantId,
    });
    if (!result.ok) {
      res.status(400).json({ ok: false, code: result.reason });
      return;
    }
    res.json({ ok: true, wizard: result.wizard, summary: result.summary });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, error: 'Dados inválidos' });
      return;
    }
    console.error('[wizard] skip', e);
    res.status(500).json({ ok: false, error: 'Erro ao pular etapa' });
  }
}

export async function getWizardWhatsappStatus(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId;
  if (!tenantId) {
    res.status(403).json({ ok: false });
    return;
  }
  const sessionToken = typeof req.query.session_token === 'string' ? req.query.session_token : undefined;
  const session = await resolveTenantWizardSession(tenantId, sessionToken);
  const instanceId =
    typeof req.query.instance_id === 'string'
      ? req.query.instance_id
      : ((session?.metadata_json.step_data as { whatsapp?: { instance_id?: string } })?.whatsapp
          ?.instance_id ?? null);

  if (!instanceId) {
    res.json({ ok: true, connected: false, instance_id: null });
    return;
  }

  const { pool } = await import('../utils/db.js');
  const r = await pool.query<{
    status: string;
    name: string;
    connected_phone: string | null;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT ci.status, ci.name, ci.connected_phone, ci.metadata
     FROM chat_instances ci
     INNER JOIN users u ON u.id = ci.user_id
     WHERE ci.id = $1 AND u.tenant_id = $2`,
    [instanceId, tenantId],
  );
  if (r.rows.length === 0) {
    res.json({ ok: true, connected: false, instance_id: instanceId });
    return;
  }
  const row = r.rows[0]!;
  const status = row.status?.toLowerCase() ?? '';
  const connected = ['open', 'connected', 'online'].includes(status);
  const meta = row.metadata ?? {};
  const profileName =
    typeof meta.profile_name === 'string'
      ? meta.profile_name
      : typeof meta.pushname === 'string'
        ? meta.pushname
        : null;

  res.json({
    ok: true,
    connected,
    instance_id: instanceId,
    status,
    connection_name: row.name,
    phone: row.connected_phone,
    profile_name: profileName,
  });
}
