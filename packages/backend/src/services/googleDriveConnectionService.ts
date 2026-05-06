import { pool } from '../utils/db.js';
import { encryptGoogleOAuthToken, decryptGoogleOAuthToken } from './googleOAuthTokenCrypto.js';

export type TenantGoogleDriveIntegrationRow = {
  id: string;
  tenant_id: string;
  connected_by_user_id: string | null;
  google_account_email: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  token_expires_at: string;
  scope: string;
  root_folder_id: string | null;
  clients_folder_id: string | null;
  is_connected: boolean;
  connection_error: string | null;
  disconnected_at: string | null;
};

export type TenantGoogleDriveIntegrationSecrets = {
  id: string;
  tenantId: string;
  googleEmail: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scope: string;
};

function rowToSecrets(r: TenantGoogleDriveIntegrationRow): TenantGoogleDriveIntegrationSecrets {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    googleEmail: r.google_account_email,
    accessToken: decryptGoogleOAuthToken(r.access_token_ciphertext),
    refreshToken: decryptGoogleOAuthToken(r.refresh_token_ciphertext),
    tokenExpiresAt: new Date(r.token_expires_at),
    scope: r.scope,
  };
}

export async function getDriveIntegrationSecrets(
  tenantId: string,
): Promise<TenantGoogleDriveIntegrationSecrets | null> {
  const r = await pool.query<TenantGoogleDriveIntegrationRow>(
    `SELECT id, tenant_id, connected_by_user_id, google_account_email,
            access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scope,
            root_folder_id, clients_folder_id, is_connected, connection_error, disconnected_at
     FROM tenant_google_drive_integrations
     WHERE tenant_id = $1 AND is_connected = true
     LIMIT 1`,
    [tenantId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowToSecrets(row);
}

export async function getDriveIntegrationPublicMeta(tenantId: string): Promise<{
  google_email: string;
  root_folder_id: string | null;
  clients_folder_id: string | null;
  connection_error: string | null;
  connected_at: string;
  is_connected: boolean;
} | null> {
  const r = await pool.query<{
    google_account_email: string;
    root_folder_id: string | null;
    clients_folder_id: string | null;
    connection_error: string | null;
    created_at: string;
    is_connected: boolean;
  }>(
    `SELECT google_account_email, root_folder_id, clients_folder_id, connection_error,
            created_at::text AS created_at, is_connected
     FROM tenant_google_drive_integrations
     WHERE tenant_id = $1
     LIMIT 1`,
    [tenantId],
  );
  if (!r.rows[0]) return null;
  return {
    google_email: r.rows[0].google_account_email,
    root_folder_id: r.rows[0].root_folder_id,
    clients_folder_id: r.rows[0].clients_folder_id,
    connection_error: r.rows[0].connection_error,
    connected_at: r.rows[0].created_at,
    is_connected: r.rows[0].is_connected,
  };
}

export async function upsertDriveIntegration(params: {
  tenantId: string;
  connectedByUserId: string;
  googleEmail: string;
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
  scope: string;
  rootFolderId: string | null;
  clientsFolderId: string | null;
  connectionError: string | null;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + Math.max(0, params.expiresInSeconds) * 1000);
  const accessCt = encryptGoogleOAuthToken(params.accessToken);

  let refreshCt: string;
  if (params.refreshToken) {
    refreshCt = encryptGoogleOAuthToken(params.refreshToken);
  } else {
    const prev = await pool.query<{ refresh_token_ciphertext: string }>(
      `SELECT refresh_token_ciphertext FROM tenant_google_drive_integrations WHERE tenant_id = $1`,
      [params.tenantId],
    );
    const existing = prev.rows[0]?.refresh_token_ciphertext;
    if (!existing) {
      throw new Error('Google não devolveu refresh_token; reconecte com prompt=consent.');
    }
    refreshCt = existing;
  }

  await pool.query(
    `INSERT INTO tenant_google_drive_integrations (
       tenant_id, connected_by_user_id, google_account_email,
       access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scope,
       root_folder_id, clients_folder_id, is_connected, connection_error, disconnected_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, NULL)
     ON CONFLICT (tenant_id) DO UPDATE SET
       connected_by_user_id = EXCLUDED.connected_by_user_id,
       google_account_email = EXCLUDED.google_account_email,
       access_token_ciphertext = EXCLUDED.access_token_ciphertext,
       refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
       token_expires_at = EXCLUDED.token_expires_at,
       scope = EXCLUDED.scope,
       root_folder_id = EXCLUDED.root_folder_id,
       clients_folder_id = EXCLUDED.clients_folder_id,
       is_connected = true,
       connection_error = EXCLUDED.connection_error,
       disconnected_at = NULL,
       updated_at = now()`,
    [
      params.tenantId,
      params.connectedByUserId,
      params.googleEmail,
      accessCt,
      refreshCt,
      expiresAt.toISOString(),
      params.scope,
      params.rootFolderId,
      params.clientsFolderId,
      params.connectionError,
    ],
  );
}

export async function updateDriveTokens(
  connectionId: string,
  tenantId: string,
  accessToken: string,
  expiresInSeconds: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + Math.max(0, expiresInSeconds) * 1000);
  const accessCt = encryptGoogleOAuthToken(accessToken);
  await pool.query(
    `UPDATE tenant_google_drive_integrations
     SET access_token_ciphertext = $1, token_expires_at = $2, updated_at = now()
     WHERE id = $3 AND tenant_id = $4 AND is_connected = true`,
    [accessCt, expiresAt.toISOString(), connectionId, tenantId],
  );
}

/** Remove tokens e marca desligado; não apaga pastas no Google. */
export async function markDriveDisconnected(tenantId: string): Promise<boolean> {
  const r = await pool.query(
    `UPDATE tenant_google_drive_integrations
     SET is_connected = false,
         disconnected_at = now(),
         access_token_ciphertext = '',
         refresh_token_ciphertext = '',
         token_expires_at = now(),
         updated_at = now()
     WHERE tenant_id = $1 AND is_connected = true`,
    [tenantId],
  );
  return (r.rowCount ?? 0) > 0;
}
