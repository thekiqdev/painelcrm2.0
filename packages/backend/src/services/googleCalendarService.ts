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

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

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
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeAuthorizationCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
}> {
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
  const expires_in = Number(json.expires_in) || 3600;
  const scope = String(json.scope || GOOGLE_CALENDAR_SCOPES);
  if (!access_token) throw new Error('Resposta Google sem access_token');
  return { access_token, refresh_token, expires_in, scope };
}

export async function fetchGoogleAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as { email?: string };
  if (!res.ok || !json.email) {
    throw new Error('Não foi possível obter o e-mail da conta Google');
  }
  return json.email;
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
