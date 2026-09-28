/**
 * Persistência temporária do code_verifier PKCE (cifrado), indexado pelo nonce do OAuth state.
 */
import { pool } from '../utils/db.js';
import { encryptMercadoPagoOAuthToken, decryptMercadoPagoOAuthToken } from './mercadoPagoOAuthTokenCrypto.js';

export async function saveMercadoPagoPkceChallenge(params: {
  nonce: string;
  tenantId: string;
  userId: string;
  codeVerifier: string;
  expiresAt: Date;
}): Promise<void> {
  await pool.query(`DELETE FROM mercado_pago_oauth_pkce_challenges WHERE expires_at < now()`);
  const ciphertext = encryptMercadoPagoOAuthToken(params.codeVerifier);
  await pool.query(
    `INSERT INTO mercado_pago_oauth_pkce_challenges (nonce, tenant_id, user_id, code_verifier_ciphertext, expires_at)
     VALUES ($1, $2::uuid, $3::uuid, $4, $5)
     ON CONFLICT (nonce) DO UPDATE SET
       tenant_id = EXCLUDED.tenant_id,
       user_id = EXCLUDED.user_id,
       code_verifier_ciphertext = EXCLUDED.code_verifier_ciphertext,
       expires_at = EXCLUDED.expires_at`,
    [params.nonce, params.tenantId, params.userId, ciphertext, params.expiresAt.toISOString()],
  );
}

/**
 * Recupera e remove o code_verifier. Valida tenant/user com o state verificado.
 */
export async function consumeMercadoPagoPkceVerifier(params: {
  nonce: string;
  tenantId: string;
  userId: string;
}): Promise<string | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query<{ code_verifier_ciphertext: string }>(
      `SELECT code_verifier_ciphertext FROM mercado_pago_oauth_pkce_challenges
       WHERE nonce = $1 AND tenant_id = $2::uuid AND user_id = $3::uuid AND expires_at > now()
       FOR UPDATE`,
      [params.nonce, params.tenantId, params.userId],
    );
    const row = r.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }
    let plain: string;
    try {
      plain = decryptMercadoPagoOAuthToken(row.code_verifier_ciphertext);
    } catch {
      await client.query(`DELETE FROM mercado_pago_oauth_pkce_challenges WHERE nonce = $1`, [params.nonce]);
      await client.query('COMMIT');
      return null;
    }
    await client.query(`DELETE FROM mercado_pago_oauth_pkce_challenges WHERE nonce = $1`, [params.nonce]);
    await client.query('COMMIT');
    return plain;
  } catch {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    return null;
  } finally {
    client.release();
  }
}
