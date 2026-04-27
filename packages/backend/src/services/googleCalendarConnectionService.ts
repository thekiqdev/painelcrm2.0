import { pool } from '../utils/db.js';
import { encryptGoogleOAuthToken, decryptGoogleOAuthToken } from './googleOAuthTokenCrypto.js';

export type GoogleCalendarConnectionRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  google_email: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  token_expires_at: string;
  scope: string;
};

export type GoogleCalendarConnectionSecrets = {
  id: string;
  tenantId: string;
  userId: string;
  googleEmail: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  scope: string;
};

function rowToSecrets(r: GoogleCalendarConnectionRow): GoogleCalendarConnectionSecrets {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    googleEmail: r.google_email,
    accessToken: decryptGoogleOAuthToken(r.access_token_ciphertext),
    refreshToken: decryptGoogleOAuthToken(r.refresh_token_ciphertext),
    tokenExpiresAt: new Date(r.token_expires_at),
    scope: r.scope,
  };
}

export async function getConnectionForUser(
  tenantId: string,
  userId: string,
): Promise<GoogleCalendarConnectionSecrets | null> {
  const r = await pool.query<GoogleCalendarConnectionRow>(
    `SELECT id, tenant_id, user_id, google_email, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scope
     FROM google_calendar_connections
     WHERE tenant_id = $1 AND user_id = $2
     LIMIT 1`,
    [tenantId, userId],
  );
  if (!r.rows[0]) return null;
  return rowToSecrets(r.rows[0]);
}

export async function getConnectionPublicMeta(
  tenantId: string,
  userId: string,
): Promise<{ google_email: string; connected_at: string } | null> {
  const r = await pool.query<{ google_email: string; created_at: string }>(
    `SELECT google_email, created_at::text AS created_at
     FROM google_calendar_connections
     WHERE tenant_id = $1 AND user_id = $2
     LIMIT 1`,
    [tenantId, userId],
  );
  if (!r.rows[0]) return null;
  return { google_email: r.rows[0].google_email, connected_at: r.rows[0].created_at };
}

export async function upsertConnection(params: {
  tenantId: string;
  userId: string;
  googleEmail: string;
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
  scope: string;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + Math.max(0, params.expiresInSeconds) * 1000);
  const accessCt = encryptGoogleOAuthToken(params.accessToken);

  let refreshCt: string;
  if (params.refreshToken) {
    refreshCt = encryptGoogleOAuthToken(params.refreshToken);
  } else {
    const prev = await pool.query<{ refresh_token_ciphertext: string }>(
      `SELECT refresh_token_ciphertext FROM google_calendar_connections WHERE tenant_id = $1 AND user_id = $2`,
      [params.tenantId, params.userId],
    );
    const existing = prev.rows[0]?.refresh_token_ciphertext;
    if (!existing) {
      throw new Error('Google não devolveu refresh_token; reconecte com prompt=consent.');
    }
    refreshCt = existing;
  }

  await pool.query(
    `INSERT INTO google_calendar_connections (
       tenant_id, user_id, google_email, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scope
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET
       google_email = EXCLUDED.google_email,
       access_token_ciphertext = EXCLUDED.access_token_ciphertext,
       refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
       token_expires_at = EXCLUDED.token_expires_at,
       scope = EXCLUDED.scope,
       updated_at = now()`,
    [
      params.tenantId,
      params.userId,
      params.googleEmail,
      accessCt,
      refreshCt,
      expiresAt.toISOString(),
      params.scope,
    ],
  );
}

export async function updateTokens(
  connectionId: string,
  tenantId: string,
  userId: string,
  accessToken: string,
  expiresInSeconds: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + Math.max(0, expiresInSeconds) * 1000);
  const accessCt = encryptGoogleOAuthToken(accessToken);
  await pool.query(
    `UPDATE google_calendar_connections
     SET access_token_ciphertext = $1, token_expires_at = $2, updated_at = now()
     WHERE id = $3 AND tenant_id = $4 AND user_id = $5`,
    [accessCt, expiresAt.toISOString(), connectionId, tenantId, userId],
  );
}

export async function deleteConnection(tenantId: string, userId: string): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM google_calendar_connections WHERE tenant_id = $1 AND user_id = $2`,
    [tenantId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}
