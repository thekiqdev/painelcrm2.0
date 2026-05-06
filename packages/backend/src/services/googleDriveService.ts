/**
 * Google Drive API + OAuth (authorization code flow) para integração por tenant.
 *
 * Escopo `https://www.googleapis.com/auth/drive` (acesso completo ao Drive da conta):
 * necessário para criar pastas na raiz “Meu Drive”, nomear livremente e preparar árvore
 * empresa/clientes sem limitações do escopo restrito `drive.file` (apenas ficheiros criados pela app).
 * Trade-off: permissão sensível na Google Cloud (pode exigir verificação OAuth); avaliar em produção.
 *
 * openid + email + profile: userinfo / id_token (e-mail da conta Google).
 */
import { getGoogleDriveOAuthClientConfig } from '../config/googleDriveEnv.js';
import { fetchGoogleUserProfile } from './googleCalendarService.js';
import {
  updateDriveTokens,
  type TenantGoogleDriveIntegrationSecrets,
} from './googleDriveConnectionService.js';

const GOOGLE_DRIVE_SCOPE_PARTS = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive',
] as const;
export const GOOGLE_DRIVE_SCOPES = GOOGLE_DRIVE_SCOPE_PARTS.join(' ');

function logGoogleDriveOAuthAuthorizeParams(authorizeUrl: string, state: string): void {
  if (String(process.env.GOOGLE_OAUTH_LOG_PARAMS || '').toLowerCase() !== 'true') return;
  let parsed: URL;
  try {
    parsed = new URL(authorizeUrl);
  } catch {
    console.log('[google-drive-oauth:params] (URL inválida)');
    return;
  }
  const p = parsed.searchParams;
  const clientId = p.get('client_id') || '';
  const maskedId =
    clientId.length > 20 ? `${clientId.slice(0, 12)}…${clientId.slice(-8)}` : clientId ? '***' : '';
  console.log('[google-drive-oauth:params]', {
    client_id: maskedId,
    redirect_uri: p.get('redirect_uri'),
    scope: p.get('scope'),
    access_type: p.get('access_type'),
    state_length: state.length,
  });
}

export function buildGoogleDriveAuthorizeUrl(state: string): string {
  const cfg = getGoogleDriveOAuthClientConfig();
  if (!cfg) throw new Error('Google Drive OAuth não configurado');
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: GOOGLE_DRIVE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
    include_granted_scopes: 'true',
  });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  logGoogleDriveOAuthAuthorizeParams(url, state);
  return url;
}

export type GoogleDriveTokenExchangeResult = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  scope: string;
};

export async function exchangeGoogleDriveAuthorizationCode(code: string): Promise<GoogleDriveTokenExchangeResult> {
  const cfg = getGoogleDriveOAuthClientConfig();
  if (!cfg) throw new Error('Google Drive OAuth não configurado');
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
  const scope = String(json.scope || GOOGLE_DRIVE_SCOPES);
  if (!access_token) throw new Error('Resposta Google sem access_token');
  return { access_token, refresh_token, id_token, expires_in, scope };
}

async function refreshDriveAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const cfg = getGoogleDriveOAuthClientConfig();
  if (!cfg) throw new Error('Google Drive OAuth não configurado');
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

export async function refreshDriveTokenIfNeeded(
  conn: TenantGoogleDriveIntegrationSecrets,
): Promise<TenantGoogleDriveIntegrationSecrets> {
  const now = Date.now();
  if (conn.tokenExpiresAt.getTime() - REFRESH_MARGIN_MS > now) {
    return conn;
  }
  const { access_token, expires_in } = await refreshDriveAccessToken(conn.refreshToken);
  await updateDriveTokens(conn.id, conn.tenantId, access_token, expires_in);
  return {
    ...conn,
    accessToken: access_token,
    tokenExpiresAt: new Date(now + expires_in * 1000),
  };
}

export async function createDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    body.parents = [parentId];
  }
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    const msg = typeof err?.message === 'string' ? err.message : JSON.stringify(json);
    throw new Error(`Drive: criar pasta falhou: ${msg}`);
  }
  const id = typeof json.id === 'string' ? json.id : '';
  if (!id) throw new Error('Drive: resposta sem id da pasta');
  return id;
}

export type DriveUploadFileResult = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  webViewLink: string | null;
  webContentLink: string | null;
};

/** Upload simples multipart para o Google Drive em pasta específica. */
export async function uploadFileToDrive(params: {
  accessToken: string;
  folderId: string;
  filename: string;
  mimeType: string;
  content: Buffer;
}): Promise<DriveUploadFileResult> {
  const form = new FormData();
  const metadata = {
    name: params.filename,
    parents: [params.folderId],
  };
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([params.content], { type: params.mimeType }), params.filename);
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: form,
    },
  );
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    const msg = typeof err?.message === 'string' ? err.message : JSON.stringify(json);
    throw new Error(`Drive: upload falhou: ${msg}`);
  }
  const id = typeof json.id === 'string' ? json.id : '';
  if (!id) throw new Error('Drive: upload sem id');
  return {
    id,
    name: typeof json.name === 'string' ? json.name : params.filename,
    mimeType: typeof json.mimeType === 'string' ? json.mimeType : params.mimeType,
    size: Number(json.size || 0),
    webViewLink: typeof json.webViewLink === 'string' ? json.webViewLink : null,
    webContentLink: typeof json.webContentLink === 'string' ? json.webContentLink : null,
  };
}

/** Pasta empresa na raiz do Drive + subpasta "Clientes". */
export async function ensureDriveCompanyFolderStructure(
  accessToken: string,
  companyFolderName: string,
): Promise<{ rootFolderId: string; clientsFolderId: string }> {
  const safeName = companyFolderName.replace(/[\\/]/g, ' ').trim().slice(0, 200) || 'Empresa';
  const rootFolderId = await createDriveFolder(accessToken, safeName);
  const clientsFolderId = await createDriveFolder(accessToken, 'Clientes', rootFolderId);
  return { rootFolderId, clientsFolderId };
}

export { fetchGoogleUserProfile };

export async function revokeGoogleOAuthToken(token: string): Promise<void> {
  try {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    // best-effort
  }
}
