import type { Response } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import {
  assertGoogleCalendarConfigured,
  getGoogleOAuthClientConfig,
  isGoogleCalendarIntegrationEnabled,
} from '../config/googleCalendarEnv.js';
import { isGoogleOAuthTokenEncryptionConfigured } from '../services/googleOAuthTokenCrypto.js';
import { generateGoogleCalendarOAuthState, verifyGoogleCalendarOAuthState } from '../services/googleCalendarOAuthState.js';
import {
  deleteConnection,
  getConnectionPublicMeta,
  upsertConnection,
} from '../services/googleCalendarConnectionService.js';
import {
  buildGoogleAuthorizeUrl,
  createEvent,
  exchangeAuthorizationCode,
  fetchGoogleAccountEmail,
  listEvents,
  loadConnectionForUser,
} from '../services/googleCalendarService.js';
import { getTenantIdForUser } from '../utils/tenant.js';

function frontendBaseUrl(): string {
  return String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function redirectToSettings(res: Response, query: Record<string, string>): void {
  const u = new URL('/settings', `${frontendBaseUrl()}/`);
  for (const [k, v] of Object.entries(query)) {
    u.searchParams.set(k, v);
  }
  res.redirect(u.toString());
}

export async function googleCalendarConnect(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isGoogleCalendarIntegrationEnabled()) {
      res.status(404).json({ error: 'Integração Google Agenda desativada.' });
      return;
    }
    assertGoogleCalendarConfigured();
    if (!isGoogleOAuthTokenEncryptionConfigured()) {
      res.status(503).json({
        error: 'Servidor sem GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY (mín. 16 caracteres).',
      });
      return;
    }
    const tenantId = requireTenantId(req, res);
    if (!tenantId || !req.userId) return;
    const state = generateGoogleCalendarOAuthState(tenantId, req.userId);
    const url = buildGoogleAuthorizeUrl(state);
    res.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao iniciar OAuth';
    res.status(400).json({ error: msg });
  }
}

export async function googleCalendarOAuthCallback(req: Request, res: Response): Promise<void> {
  const fe = frontendBaseUrl();
  if (!isGoogleCalendarIntegrationEnabled() || !getGoogleOAuthClientConfig()) {
    redirectToSettings(res, { section: 'googleCalendar', google_calendar: 'disabled' });
    return;
  }
  if (!isGoogleOAuthTokenEncryptionConfigured()) {
    redirectToSettings(res, { section: 'googleCalendar', google_calendar: 'misconfigured' });
    return;
  }

  try {
    const err = typeof req.query.error === 'string' ? req.query.error : '';
    if (err) {
      redirectToSettings(res, { section: 'googleCalendar', google_calendar: 'denied' });
      return;
    }
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const stateRaw = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !stateRaw) {
      redirectToSettings(res, { section: 'googleCalendar', google_calendar: 'invalid' });
      return;
    }
    const { tenantId, userId } = verifyGoogleCalendarOAuthState(stateRaw);
    const mapped = await getTenantIdForUser(userId);
    if (!mapped || mapped !== tenantId) {
      redirectToSettings(res, { section: 'googleCalendar', google_calendar: 'invalid' });
      return;
    }
    const tokens = await exchangeAuthorizationCode(code);
    const email = await fetchGoogleAccountEmail(tokens.access_token);
    await upsertConnection({
      tenantId,
      userId,
      googleEmail: email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expires_in,
      scope: tokens.scope,
    });
    redirectToSettings(res, { section: 'googleCalendar', google_calendar: 'connected' });
  } catch (e) {
    console.error('[google-calendar] callback', e);
    redirectToSettings(res, { section: 'googleCalendar', google_calendar: 'error' });
  }
}

export async function googleCalendarStatus(req: AuthRequest, res: Response): Promise<void> {
  if (!isGoogleCalendarIntegrationEnabled()) {
    res.json({ enabled: false, connected: false, google_email: null });
    return;
  }
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  try {
    const meta = await getConnectionPublicMeta(tenantId, req.userId);
    res.json({
      enabled: true,
      encryption_configured: isGoogleOAuthTokenEncryptionConfigured(),
      oauth_configured: !!getGoogleOAuthClientConfig(),
      connected: !!meta,
      google_email: meta?.google_email ?? null,
      connected_at: meta?.connected_at ?? null,
    });
  } catch (e) {
    console.error('[google-calendar] status', e);
    res.status(500).json({ error: 'Erro ao consultar integração' });
  }
}

export async function googleCalendarDisconnect(req: AuthRequest, res: Response): Promise<void> {
  if (!isGoogleCalendarIntegrationEnabled()) {
    res.status(404).json({ error: 'Integração desativada.' });
    return;
  }
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  try {
    await deleteConnection(tenantId, req.userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[google-calendar] disconnect', e);
    res.status(500).json({ error: 'Erro ao desconectar' });
  }
}

const createEventBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  attendees: z.array(z.object({ email: z.string().email() })).optional(),
  createMeet: z.boolean().optional(),
});

export async function googleCalendarCreateEvent(req: AuthRequest, res: Response): Promise<void> {
  if (!isGoogleCalendarIntegrationEnabled()) {
    res.status(404).json({ error: 'Integração desativada.' });
    return;
  }
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const parsed = createEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    const conn = await loadConnectionForUser(tenantId, req.userId);
    if (!conn) {
      res.status(400).json({ error: 'Conecte o Google Agenda primeiro.' });
      return;
    }
    const created = await createEvent(conn, parsed.data);
    res.status(201).json(created);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao criar evento';
    res.status(400).json({ error: msg });
  }
}

export async function googleCalendarListEvents(req: AuthRequest, res: Response): Promise<void> {
  if (!isGoogleCalendarIntegrationEnabled()) {
    res.status(404).json({ error: 'Integração desativada.' });
    return;
  }
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const timeMin = typeof req.query.timeMin === 'string' ? req.query.timeMin : '';
  const timeMax = typeof req.query.timeMax === 'string' ? req.query.timeMax : '';
  if (!timeMin || !timeMax) {
    res.status(400).json({ error: 'Informe timeMin e timeMax (RFC3339).' });
    return;
  }
  try {
    const conn = await loadConnectionForUser(tenantId, req.userId);
    if (!conn) {
      res.status(400).json({ error: 'Conecte o Google Agenda primeiro.' });
      return;
    }
    const items = await listEvents(conn, { timeMin, timeMax });
    res.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao listar eventos';
    res.status(400).json({ error: msg });
  }
}
