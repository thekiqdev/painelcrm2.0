import type { Response } from 'express';
import type { Request } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import {
  assertGoogleDriveConfigured,
  getGoogleDriveOAuthClientConfig,
  isGoogleDriveIntegrationEnabled,
} from '../config/googleDriveEnv.js';
import { isGoogleOAuthTokenEncryptionConfigured } from '../services/googleOAuthTokenCrypto.js';
import {
  generateGoogleDriveOAuthState,
  verifyGoogleDriveOAuthState,
} from '../services/googleDriveOAuthState.js';
import {
  getDriveIntegrationPublicMeta,
  getDriveIntegrationSecrets,
  markDriveDisconnected,
  upsertDriveIntegration,
} from '../services/googleDriveConnectionService.js';
import {
  buildGoogleDriveAuthorizeUrl,
  exchangeGoogleDriveAuthorizationCode,
  ensureDriveCompanyFolderStructure,
  fetchGoogleUserProfile,
  revokeGoogleOAuthToken,
} from '../services/googleDriveService.js';
import { getTenantIdForUser, isTenantAdmin } from '../utils/tenant.js';
import { pool } from '../utils/db.js';

function frontendBaseUrl(): string {
  return String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function redirectToDriveIntegration(res: Response, query: Record<string, string | undefined>): void {
  const u = new URL('/settings', `${frontendBaseUrl()}/`);
  u.searchParams.set('section', 'googleDrive');
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) u.searchParams.set(k, v);
  }
  res.redirect(u.toString());
}

function callbackErrorLog(e: unknown, reason: string): void {
  const m = e instanceof Error ? e.message : String(e);
  console.error('[google-drive] callback', { reason, error_message: m });
}

export async function googleDriveConnect(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isGoogleDriveIntegrationEnabled()) {
      res.status(404).json({ error: 'Integração Google Drive desativada.' });
      return;
    }
    assertGoogleDriveConfigured();
    if (!isGoogleOAuthTokenEncryptionConfigured()) {
      res.status(503).json({
        error: 'Servidor sem GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY (mín. 16 caracteres).',
      });
      return;
    }
    const tenantId = requireTenantId(req, res);
    if (!tenantId || !req.userId) return;
    if (!(await isTenantAdmin(req.userId))) {
      res.status(403).json({ error: 'Apenas administradores da empresa podem ligar o Google Drive.' });
      return;
    }
    const state = generateGoogleDriveOAuthState(tenantId, req.userId);
    const url = buildGoogleDriveAuthorizeUrl(state);
    res.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao iniciar OAuth';
    res.status(400).json({ error: msg });
  }
}

export async function googleDriveOAuthCallback(req: Request, res: Response): Promise<void> {
  if (!isGoogleDriveIntegrationEnabled() || !getGoogleDriveOAuthClientConfig()) {
    redirectToDriveIntegration(res, { google_drive: 'error', reason: 'disabled' });
    return;
  }
  if (!isGoogleOAuthTokenEncryptionConfigured()) {
    redirectToDriveIntegration(res, { google_drive: 'error', reason: 'misconfigured' });
    return;
  }

  try {
    const err = typeof req.query.error === 'string' ? req.query.error : '';
    if (err) {
      redirectToDriveIntegration(res, { google_drive: 'error', reason: 'denied' });
      return;
    }
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const stateRaw = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !stateRaw) {
      redirectToDriveIntegration(res, { google_drive: 'error', reason: 'invalid' });
      return;
    }
    const { tenantId, initiatedByUserId } = verifyGoogleDriveOAuthState(stateRaw);
    const mapped = await getTenantIdForUser(initiatedByUserId);
    if (!mapped || mapped !== tenantId) {
      redirectToDriveIntegration(res, { google_drive: 'error', reason: 'invalid' });
      return;
    }
    if (!(await isTenantAdmin(initiatedByUserId))) {
      redirectToDriveIntegration(res, { google_drive: 'error', reason: 'forbidden' });
      return;
    }

    const tokens = await exchangeGoogleDriveAuthorizationCode(code);
    let profile: Awaited<ReturnType<typeof fetchGoogleUserProfile>>;
    try {
      profile = await fetchGoogleUserProfile(tokens.access_token, tokens.id_token);
    } catch (pe) {
      callbackErrorLog(pe, 'email_not_found');
      redirectToDriveIntegration(res, { google_drive: 'error', reason: 'email_not_found' });
      return;
    }

    const tn = await pool.query<{ name: string }>('SELECT name FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
    const tenantName = tn.rows[0]?.name?.trim() || 'Empresa';

    let rootFolderId: string | null = null;
    let clientsFolderId: string | null = null;
    try {
      const folders = await ensureDriveCompanyFolderStructure(tokens.access_token, tenantName);
      rootFolderId = folders.rootFolderId;
      clientsFolderId = folders.clientsFolderId;
    } catch (fe) {
      callbackErrorLog(fe, 'folders_failed');
      redirectToDriveIntegration(res, { google_drive: 'error', reason: 'folders_failed' });
      return;
    }

    await upsertDriveIntegration({
      tenantId,
      connectedByUserId: initiatedByUserId,
      googleEmail: profile.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expires_in,
      scope: tokens.scope,
      rootFolderId,
      clientsFolderId,
      connectionError: null,
    });

    redirectToDriveIntegration(res, { google_drive: 'connected' });
  } catch (e) {
    callbackErrorLog(e, 'token_or_save');
    redirectToDriveIntegration(res, { google_drive: 'error', reason: 'token_or_save' });
  }
}

export async function googleDriveStatus(req: AuthRequest, res: Response): Promise<void> {
  if (!isGoogleDriveIntegrationEnabled()) {
    res.json({
      enabled: false,
      connected: false,
      google_email: null,
      root_folder_id: null,
      clients_folder_id: null,
      connection_error: null,
    });
    return;
  }
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  try {
    const meta = await getDriveIntegrationPublicMeta(tenantId);
    const connected = Boolean(meta?.is_connected);
    res.json({
      enabled: true,
      encryption_configured: isGoogleOAuthTokenEncryptionConfigured(),
      oauth_configured: !!getGoogleDriveOAuthClientConfig(),
      connected,
      google_email: connected ? meta?.google_email ?? null : null,
      root_folder_id: connected ? meta?.root_folder_id ?? null : null,
      clients_folder_id: connected ? meta?.clients_folder_id ?? null : null,
      connection_error: connected ? meta?.connection_error ?? null : null,
      connected_at: meta?.connected_at ?? null,
    });
  } catch (e) {
    console.error('[google-drive] status', e);
    res.status(500).json({ error: 'Erro ao consultar integração' });
  }
}

export async function googleDriveDisconnect(req: AuthRequest, res: Response): Promise<void> {
  if (!isGoogleDriveIntegrationEnabled()) {
    res.status(404).json({ error: 'Integração desativada.' });
    return;
  }
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  if (!(await isTenantAdmin(req.userId))) {
    res.status(403).json({ error: 'Apenas administradores da empresa podem desligar o Google Drive.' });
    return;
  }
  try {
    const secrets = await getDriveIntegrationSecrets(tenantId);
    if (secrets?.refreshToken) {
      await revokeGoogleOAuthToken(secrets.refreshToken);
    }
    await markDriveDisconnected(tenantId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[google-drive] disconnect', e);
    res.status(500).json({ error: 'Erro ao desconectar' });
  }
}
