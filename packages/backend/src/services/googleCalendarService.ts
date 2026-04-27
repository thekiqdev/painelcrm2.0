/**
 * Google Calendar API + OAuth (authorization code flow).
 */
import { randomUUID } from 'crypto';
import { getGoogleOAuthClientConfig } from '../config/googleCalendarEnv.js';
import {
  getConnectionForUser,
  updateTokens,
  type GoogleCalendarConnectionSecrets,
} from './googleCalendarConnectionService.js';

/**
 * openid + email + profile: necessários para userinfo e id_token (e-mail da conta).
 * Calendário: eventos e calendário completo (solicitado no produto).
 * Ordem no URL: o Google concatena; manter tudo o que a consola "Dados" listar.
 */
const GOOGLE_CALENDAR_SCOPE_PARTS = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar',
] as const;
export const GOOGLE_CALENDAR_SCOPES = GOOGLE_CALENDAR_SCOPE_PARTS.join(' ');

function maskEmailForLog(email: string): string {
  const t = email.trim();
  if (!t.includes('@') || t.length < 3) return '***';
  const [local, domain] = t.split('@', 2);
  const d = domain ?? '';
  if (local.length <= 1) return `*@${d}`;
  return `${local[0]}***@${d}`;
}

function decodeIdTokenEmailPayload(
  idToken: string,
): { email?: string; email_verified?: boolean; name?: string; picture?: string } | null {
  try {
    const parts = idToken.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const raw = Buffer.from(b64 + pad, 'base64').toString('utf8');
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      email: typeof p.email === 'string' ? p.email : undefined,
      email_verified: p.email_verified === true,
      name: typeof p.name === 'string' ? p.name : undefined,
      picture: typeof p.picture === 'string' ? p.picture : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Quando `GOOGLE_OAUTH_LOG_PARAMS=true`, regista parâmetros da URL de autorização (sem `client_secret`).
 * `state` é um JWT: só comprimento e prefixo de formato (não o payload completo).
 */
function logGoogleOAuthAuthorizeParams(authorizeUrl: string, state: string): void {
  if (String(process.env.GOOGLE_OAUTH_LOG_PARAMS || '').toLowerCase() !== 'true') return;
  let parsed: URL;
  try {
    parsed = new URL(authorizeUrl);
  } catch {
    console.log('[google-oauth:params] (URL inválida)');
    return;
  }
  const p = parsed.searchParams;
  const clientId = p.get('client_id') || '';
  const maskedId =
    clientId.length > 20 ? `${clientId.slice(0, 12)}…${clientId.slice(-8)}` : clientId ? '***' : '';
  console.log('[google-oauth:params]', {
    client_id: maskedId,
    redirect_uri: p.get('redirect_uri'),
    response_type: p.get('response_type'),
    scope: p.get('scope'),
    access_type: p.get('access_type'),
    prompt: p.get('prompt'),
    include_granted_scopes: p.get('include_granted_scopes'),
    state_length: state.length,
    state_looks_like_jwt: state.startsWith('eyJ'),
  });
}

export function buildGoogleAuthorizeUrl(state: string): string {
  const cfg = getGoogleOAuthClientConfig();
  if (!cfg) throw new Error('Google OAuth não configurado');
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
    include_granted_scopes: 'true',
  });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  logGoogleOAuthAuthorizeParams(url, state);
  return url;
}

export type GoogleTokenExchangeResult = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  scope: string;
};

export async function exchangeAuthorizationCode(code: string): Promise<GoogleTokenExchangeResult> {
  const cfg = getGoogleOAuthClientConfig();
  if (!cfg) throw new Error('Google OAuth não configurado');
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof json.error_description === 'string' ? json.error_description : JSON.stringify(json);
    throw new Error(`Falha ao trocar code por tokens: ${msg}`);
  }
  const access_token = String(json.access_token || '');
  const refresh_token = json.refresh_token != null ? String(json.refresh_token) : undefined;
  const id_token = json.id_token != null ? String(json.id_token) : undefined;
  const expires_in = Number(json.expires_in) || 3600;
  const scope = String(json.scope || GOOGLE_CALENDAR_SCOPES);
  if (!access_token) throw new Error('Resposta Google sem access_token');
  if (String(process.env.GOOGLE_OAUTH_LOG_PARAMS || '').toLowerCase() === 'true') {
    console.log('[google-oauth:token]', {
      status: res.status,
      has_refresh_token: Boolean(refresh_token),
      has_id_token: Boolean(id_token),
      scope,
    });
  }
  return { access_token, refresh_token, id_token, expires_in, scope };
}

export type GoogleUserProfile = {
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

/**
 * Obtém e-mail (e perfil) via userinfo v3; fallback no payload de id_token (sem logar segredos).
 */
export async function fetchGoogleUserProfile(
  accessToken: string,
  idToken: string | undefined,
): Promise<GoogleUserProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let j: unknown = null;
  try {
    j = await res.json();
  } catch {
    j = null;
  }
  const json = j as { email?: string; email_verified?: boolean; name?: string; picture?: string; error?: string };
  if (String(process.env.GOOGLE_OAUTH_LOG_PARAMS || '').toLowerCase() === 'true') {
    const emailMask = json.email ? maskEmailForLog(json.email) : '(nenhum na resposta)';
    console.log('[google-oauth:userinfo]', { status: res.status, email_masked: emailMask });
  }

  if (res.ok && typeof json.email === 'string' && json.email.length > 0) {
    return {
      email: json.email,
      email_verified: json.email_verified === true,
      name: json.name,
      picture: json.picture,
    };
  }

  if (idToken) {
    const p = decodeIdTokenEmailPayload(idToken);
    if (p?.email) {
      if (String(process.env.GOOGLE_OAUTH_LOG_PARAMS || '').toLowerCase() === 'true') {
        console.log('[google-oauth:id_token] fallback e-mail a partir de id_token (userinfo indisponível ou sem email)');
      }
      return {
        email: p.email,
        email_verified: p.email_verified,
        name: p.name,
        picture: p.picture,
      };
    }
  }

  const hint = res.ok ? 'userinfo sem email' : `HTTP ${res.status} ${json?.error || ''}`.trim();
  throw new Error(`Não foi possível obter o e-mail da conta Google (${hint})`);
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const cfg = getGoogleOAuthClientConfig();
  if (!cfg) throw new Error('Google OAuth não configurado');
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof json.error_description === 'string' ? json.error_description : JSON.stringify(json);
    throw new Error(`Falha ao renovar token: ${msg}`);
  }
  const access_token = String(json.access_token || '');
  const expires_in = Number(json.expires_in) || 3600;
  if (!access_token) throw new Error('Resposta Google sem access_token na renovação');
  return { access_token, expires_in };
}

const REFRESH_MARGIN_MS = 90_000;

/**
 * Garante access token válido; persiste novo access token quando renova.
 */
export async function refreshTokenIfNeeded(
  conn: GoogleCalendarConnectionSecrets,
): Promise<GoogleCalendarConnectionSecrets> {
  const now = Date.now();
  if (conn.tokenExpiresAt.getTime() - REFRESH_MARGIN_MS > now) {
    return conn;
  }
  const { access_token, expires_in } = await refreshAccessToken(conn.refreshToken);
  await updateTokens(conn.id, conn.tenantId, conn.userId, access_token, expires_in);
  return {
    ...conn,
    accessToken: access_token,
    tokenExpiresAt: new Date(now + expires_in * 1000),
  };
}

export type CreateGoogleCalendarEventInput = {
  title: string;
  description?: string;
  start: string;
  end: string;
  attendees?: { email: string }[];
  createMeet?: boolean;
};

export async function createEvent(
  conn: GoogleCalendarConnectionSecrets,
  data: CreateGoogleCalendarEventInput,
): Promise<{ id: string; htmlLink?: string; hangoutLink?: string }> {
  const c = await refreshTokenIfNeeded(conn);
  const event: Record<string, unknown> = {
    summary: data.title,
    description: data.description ?? '',
    start: { dateTime: data.start },
    end: { dateTime: data.end },
  };
  if (data.attendees?.length) {
    event.attendees = data.attendees.map((a) => ({ email: a.email }));
  }
  if (data.createMeet) {
    event.conferenceData = {
      createRequest: {
        requestId: randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }
  const q = data.createMeet ? '?conferenceDataVersion=1' : '';
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events${q}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${c.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | string | undefined;
    const msg =
      typeof err === 'object' && err && typeof err.message === 'string'
        ? err.message
        : typeof err === 'string'
          ? err
          : JSON.stringify(json);
    throw new Error(`Google Calendar: ${msg}`);
  }
  return {
    id: String(json.id || ''),
    htmlLink: typeof json.htmlLink === 'string' ? json.htmlLink : undefined,
    hangoutLink: typeof json.hangoutLink === 'string' ? json.hangoutLink : undefined,
  };
}

export type ListGoogleCalendarEventsFilters = {
  timeMin: string;
  timeMax: string;
  maxResults?: number;
};

export async function listEvents(
  conn: GoogleCalendarConnectionSecrets,
  filters: ListGoogleCalendarEventsFilters,
): Promise<
  {
    id: string;
    summary?: string;
    start?: string;
    end?: string;
    htmlLink?: string;
  }[]
> {
  const c = await refreshTokenIfNeeded(conn);
  const params = new URLSearchParams({
    timeMin: filters.timeMin,
    timeMax: filters.timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(filters.maxResults ?? 50),
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${c.accessToken}` },
    },
  );
  const json = (await res.json()) as {
    items?: { id?: string; summary?: string; start?: { dateTime?: string }; end?: { dateTime?: string }; htmlLink?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    const msg = json.error?.message || JSON.stringify(json);
    throw new Error(`Google Calendar: ${msg}`);
  }
  return (json.items || []).map((it) => ({
    id: String(it.id || ''),
    summary: it.summary,
    start: it.start?.dateTime,
    end: it.end?.dateTime,
    htmlLink: it.htmlLink,
  }));
}

export async function loadConnectionForUser(
  tenantId: string,
  userId: string,
): Promise<GoogleCalendarConnectionSecrets | null> {
  return getConnectionForUser(tenantId, userId);
}
